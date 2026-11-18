import {
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../lib/firebase';
import {
  Activity,
  ActivityFeedback,
  FeedbackTag,
  PendingSuspensionAppeal,
  RatingStarValue,
  UserModeration,
  UserReputation,
} from '../types';

export interface SubmitFeedbackInput {
  activityId: string;
  activityTitle?: string;
  isOneToOne?: boolean;
  raterId: string;
  raterName?: string;
  targetUserId: string;
  targetUserName?: string;
  rating: RatingStarValue;
  tags: FeedbackTag[];
  comment?: string;
}

export class FeedbackService {
  private readonly reputationCollection = 'userReputations';
  private readonly moderationCollection = 'userModeration';

  /**
   * Deterministic document ID to enforce one rating per rater per target per activity.
   */
  public getFeedbackDocId(activityId: string, raterId: string, targetUserId: string): string {
    return `${activityId}_${raterId}_${targetUserId}`;
  }

  /**
   * Submits a rating & feedback for an activity participant securely via trusted Cloud Functions.
   * All critical calculations (aggregates, distinct 1-star raters, 15-day suspensions)
   * are executed strictly on the server via Firebase Admin SDK.
   */
  public async submitFeedback(input: SubmitFeedbackInput): Promise<ActivityFeedback> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      throw new Error('Authentication required: You must be signed in to submit feedback.');
    }
    if (currentUid !== input.raterId) {
      throw new Error('Identity mismatch: You can only submit feedback under your own authenticated account.');
    }

    if (input.raterId === input.targetUserId) {
      throw new Error('Self-rating not allowed: Participants cannot rate themselves.');
    }

    if (
      typeof input.rating !== 'number' ||
      !Number.isInteger(input.rating) ||
      input.rating < 1 ||
      input.rating > 5
    ) {
      throw new Error('Rating must be an integer between 1 and 5 stars.');
    }

    const trimmedComment = input.comment ? input.comment.trim() : '';
    if (trimmedComment.length > 500) {
      throw new Error('Feedback comment cannot exceed 500 characters.');
    }

    try {
      const submitFeedbackFn = httpsCallable<
        {
          activityId: string;
          targetUserId: string;
          rating: number;
          tags?: string[];
          comment?: string;
        },
        {
          success: boolean;
          feedback: ActivityFeedback;
          reputation: {
            averageRating: number;
            totalRatings: number;
          };
        }
      >(functions, 'submitFeedback');

      const response = await submitFeedbackFn({
        activityId: input.activityId,
        targetUserId: input.targetUserId,
        rating: input.rating,
        tags: input.tags,
        comment: trimmedComment || undefined,
      });

      return response.data.feedback;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const errorCode = error?.code;

      // Handle un-deployed or unreachable Cloud Function in preview/dev environment
      if (
        errorCode === 'functions/not-found' ||
        errorCode === 'not-found' ||
        errorCode === 'unavailable' ||
        errorMsg.includes('not-found') ||
        errorMsg.includes('Failed to fetch')
      ) {
        throw new Error(
          "Secure Cloud Function 'submitFeedback' is awaiting deployment on the Firebase Blaze plan. Run 'firebase deploy --only functions' in the CLI to activate server-side rating verification."
        );
      }

      throw new Error(errorMsg);
    }
  }

  /**
   * Retrieves all feedback submitted by a specific rater for a specific activity
   * via secure Cloud Function without exposing /feedbackPrivate to general client reads.
   * Returns a map keyed by targetUserId.
   */
  public async getFeedbacksForActivityByRater(
    activityId: string,
    raterId: string
  ): Promise<Record<string, ActivityFeedback>> {
    try {
      const getFeedbackFn = httpsCallable<{ activityId: string }, Record<string, ActivityFeedback>>(
        functions,
        'getSubmittedFeedbackForActivity'
      );
      const response = await getFeedbackFn({ activityId });
      return response.data || {};
    } catch (err) {
      console.warn('Could not fetch activity feedbacks for rater via Cloud Function:', err);
      return {};
    }
  }

  /**
   * Subscribes to feedback submitted by a rater for an activity.
   */
  public subscribeFeedbacksForActivity(
    activityId: string,
    raterId: string,
    onUpdate: (feedbacks: Record<string, ActivityFeedback>) => void
  ): () => void {
    this.getFeedbacksForActivityByRater(activityId, raterId).then(onUpdate);
    return () => {};
  }

  /**
   * Retrieves a student's public reputation summary.
   * Confidential: Never includes individual comments or reviewer identities.
   */
  public async getUserReputation(userId: string): Promise<UserReputation | null> {
    try {
      const docRef = doc(db, this.reputationCollection, userId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return null;
      }
      return snap.data() as UserReputation;
    } catch (err) {
      console.warn('Could not get user reputation:', err);
      return null;
    }
  }

  /**
   * Real-time subscription to a user's sanitized public reputation.
   */
  public subscribeUserReputation(
    userId: string,
    onUpdate: (reputation: UserReputation | null) => void
  ): () => void {
    const docRef = doc(db, this.reputationCollection, userId);
    return onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
          return;
        }
        onUpdate(snap.data() as UserReputation);
      },
      (err) => {
        console.warn('Reputation subscription warning:', err);
      }
    );
  }

  /**
   * Retrieves private moderation record for the authenticated user.
   * Allowed strictly for isOwner or admin in security rules.
   */
  public async getUserModeration(userId: string): Promise<UserModeration | null> {
    try {
      const docRef = doc(db, this.moderationCollection, userId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return null;
      }
      return snap.data() as UserModeration;
    } catch (err) {
      console.warn('Could not get user moderation record:', err);
      return null;
    }
  }

  /**
   * Real-time subscription to private moderation record for the authenticated user.
   */
  public subscribeUserModeration(
    userId: string,
    onUpdate: (moderation: UserModeration | null) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const docRef = doc(db, this.moderationCollection, userId);
    return onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
          return;
        }
        onUpdate(snap.data() as UserModeration);
      },
      (err) => {
        console.warn('User moderation subscription notice:', err);
        if (onError) {
          onError(err);
        }
      }
    );
  }

  /**
   * Strictly checks authoritative suspension status from userModeration/{userId}.
   * Throws on permission/network errors rather than silently treating failure as unrestricted.
   */
  public async getSuspensionStatusStrict(userId: string): Promise<{
    isSuspended: boolean;
    expiresAt?: string | null;
    reason?: string | null;
    remainingDays?: number;
    appealStatus?: 'none' | 'submitted' | 'rejected' | 'accepted';
  }> {
    if (!userId) {
      throw new Error('Authentication required to verify account standing.');
    }

    let modSnap;
    try {
      modSnap = await getDoc(doc(db, this.moderationCollection, userId));
    } catch (err) {
      console.error('Failed to read userModeration record:', err);
      throw new Error(
        'Unable to verify your account moderation status right now. Please check your connection and try again.'
      );
    }

    if (modSnap.exists()) {
      return this.isSuspended(modSnap.data() as UserModeration);
    }

    // Optional legacy check only when userModeration document does not yet exist
    try {
      const repSnap = await getDoc(doc(db, this.reputationCollection, userId));
      if (repSnap.exists()) {
        return this.isSuspended(repSnap.data() as UserReputation);
      }
      return { isSuspended: false };
    } catch (err) {
      console.error('Failed to verify legacy reputation standing:', err);
      throw new Error(
        'Unable to verify your account moderation status right now. Please check your connection and try again.'
      );
    }
  }

  /**
   * Helper to check if a user is currently actively suspended.
   * Works with UserModeration or legacy UserReputation.
   */
  public isSuspended(record: UserModeration | UserReputation | null): {
    isSuspended: boolean;
    expiresAt?: string | null;
    reason?: string | null;
    remainingDays?: number;
    appealStatus?: 'none' | 'submitted' | 'rejected' | 'accepted';
  } {
    if (!record || !record.isSuspended) {
      return { isSuspended: false };
    }

    const expiresAt = (record as any).suspensionExpiresAt;
    if (expiresAt) {
      let expiresMs: number;
      if (typeof expiresAt === 'object' && expiresAt !== null && 'toMillis' in expiresAt) {
        expiresMs = expiresAt.toMillis();
      } else {
        expiresMs = new Date(expiresAt).getTime();
      }

      const nowMs = Date.now();
      if (nowMs >= expiresMs) {
        return { isSuspended: false };
      }

      const remainingDays = Math.ceil((expiresMs - nowMs) / (1000 * 60 * 60 * 24));
      const expiresAtISO = new Date(expiresMs).toISOString();

      return {
        isSuspended: true,
        expiresAt: expiresAtISO,
        reason: (record as any).suspensionReason || 'Received 5 distinct 1-star ratings.',
        remainingDays,
        appealStatus: (record as any).appealStatus || 'none',
      };
    }

    return {
      isSuspended: true,
      reason: (record as any).suspensionReason || 'Account temporarily suspended.',
      appealStatus: (record as any).appealStatus || 'none',
    };
  }

  /**
   * Submits an appeal for an active suspension via trusted Cloud Function.
   */
  public async submitSuspensionAppeal(userId: string, appealReason: string): Promise<void> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || currentUid !== userId) {
      throw new Error('You can only submit an appeal for your own account.');
    }

    const trimmed = appealReason.trim();
    if (!trimmed || trimmed.length < 10) {
      throw new Error('Please provide a constructive appeal statement (at least 10 characters).');
    }
    if (trimmed.length > 1000) {
      throw new Error('Appeal statement cannot exceed 1000 characters.');
    }

    try {
      const submitAppealFn = httpsCallable<
        { appealReason: string },
        { success: boolean; message: string }
      >(functions, 'submitSuspensionAppeal');

      await submitAppealFn({ appealReason: trimmed });
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const errorCode = error?.code;

      if (
        errorCode === 'functions/not-found' ||
        errorCode === 'not-found' ||
        errorCode === 'unavailable' ||
        errorMsg.includes('not-found') ||
        errorMsg.includes('Failed to fetch')
      ) {
        throw new Error(
          "Secure Cloud Function 'submitSuspensionAppeal' is awaiting deployment on the Firebase Blaze plan. Run 'firebase deploy --only functions' in the CLI to activate server-side moderation."
        );
      }

      throw new Error(errorMsg);
    }
  }

  /**
   * Admin review for suspension appeals via Cloud Function.
   * Requires request.auth.token.admin === true.
   */
  public async reviewSuspensionAppeal(
    targetUserId: string,
    decision: 'accepted' | 'rejected',
    moderationNote?: string
  ): Promise<void> {
    const reviewFn = httpsCallable<
      { targetUserId: string; decision: 'accepted' | 'rejected'; moderationNote?: string },
      { success: boolean; decision: string }
    >(functions, 'reviewSuspensionAppeal');

    await reviewFn({ targetUserId, decision, moderationNote });
  }

  /**
   * Fetches pending appeals for admin review via secure Cloud Function.
   * Requires request.auth.token.admin === true.
   */
  public async listPendingSuspensionAppeals(): Promise<PendingSuspensionAppeal[]> {
    const listFn = httpsCallable<
      void,
      { success: boolean; appeals: PendingSuspensionAppeal[] }
    >(functions, 'listPendingSuspensionAppeals');

    const result = await listFn();
    return result.data.appeals || [];
  }

  /**
   * Validates if a user is eligible to rate a completed activity.
   */
  public canSubmitFeedback(
    activity: Activity,
    userId: string
  ): { eligible: boolean; reason?: string } {
    if (activity.status === 'cancelled') {
      return { eligible: false, reason: 'Activity was cancelled.' };
    }
    if (activity.status !== 'completed') {
      return { eligible: false, reason: 'Activity has not yet completed.' };
    }
    if (!activity.participantIds.includes(userId)) {
      return { eligible: false, reason: 'You were not a participant in this activity.' };
    }
    const otherParticipants = activity.participantIds.filter((id) => id !== userId);
    if (otherParticipants.length === 0) {
      return { eligible: false, reason: 'No other participants to rate.' };
    }
    return { eligible: true };
  }
}

export const feedbackService = new FeedbackService();
