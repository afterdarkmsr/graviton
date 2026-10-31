import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  runTransaction,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { ActivityCategory, MatchRequest, MatchRequestStatus, UserProfile } from '../types';
import { availabilityService } from './availabilityService';

export interface SendMatchRequestInput {
  hostUid: string;
  activityInterest: string;
  requesterName: string;
  requesterYear?: string;
}

export class MatchRequestService {
  private readonly collectionName = 'matchRequests';

  /**
   * Sends a 1-to-1 match request to an active Who's Free host.
   * Enforces:
   * 1. Authenticated user
   * 2. requesterUid matches current user
   * 3. hostUid !== requesterUid
   * 4. No existing pending request to this host
   * 5. Server timestamps for createdAt and updatedAt
   */
  public async sendMatchRequest(input: SendMatchRequestInput): Promise<string> {
    const user = auth.currentUser;
    if (!user || !user.uid) {
      throw new Error('Authentication required: Sign in to request a match.');
    }

    const requesterUid = user.uid;
    const hostUid = input.hostUid;

    if (!hostUid || typeof hostUid !== 'string') {
      throw new Error('Invalid host specified.');
    }

    if (requesterUid === hostUid) {
      throw new Error('You cannot request a match with yourself.');
    }

    // Check if requester is already in an active 1-to-1 match
    try {
      const activeMatchQuery = query(
        collection(db, 'activities'),
        where('participantIds', 'array-contains', requesterUid),
        where('status', '==', 'active')
      );
      const activeSnap = await getDocs(activeMatchQuery);
      const hasActiveMatch = activeSnap.docs.some((d) => d.data().isOneToOne === true);
      if (hasActiveMatch) {
        throw new Error('You are currently in an active 1-to-1 match. End or leave your current match first.');
      }
    } catch (activeErr) {
      if (activeErr instanceof Error && activeErr.message.includes('active 1-to-1 match')) {
        throw activeErr;
      }
      console.warn('Active match pre-check notice:', activeErr);
    }

    // Check for existing pending request to this host from this user to prevent duplicate pending requests
    const checkQuery = query(
      collection(db, this.collectionName),
      where('requesterUid', '==', requesterUid),
      where('hostUid', '==', hostUid)
    );

    try {
      const snap = await getDocs(checkQuery);
      const hasActivePending = snap.docs.some(
        (d) => d.data().status === 'pending'
      );
      if (hasActivePending) {
        throw new Error('You already have a pending match request with this student.');
      }
    } catch (checkErr) {
      // If error was our own validation error, rethrow
      if (checkErr instanceof Error && checkErr.message.includes('pending match request')) {
        throw checkErr;
      }
      // Otherwise proceed to attempt creation
      console.warn('Pre-check warning (will proceed):', checkErr);
    }

    const payload: Record<string, any> = {
      hostUid,
      requesterUid,
      status: 'pending' as MatchRequestStatus,
      activityInterest: input.activityInterest || 'Campus Hangout',
      requesterName: input.requesterName || user.displayName || 'Campus Student',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (input.requesterYear && input.requesterYear.trim().length > 0) {
      payload.requesterYear = input.requesterYear.trim().slice(0, 50);
    }

    try {
      const docRef = await addDoc(collection(db, this.collectionName), payload);
      return docRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, this.collectionName);
    }
  }

  /**
   * Allows the requester to cancel their own pending match request.
   */
  public async cancelMatchRequest(requestId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.uid) {
      throw new Error('Authentication required: Sign in to cancel request.');
    }

    const docPath = `${this.collectionName}/${requestId}`;
    try {
      const docRef = doc(db, this.collectionName, requestId);
      await updateDoc(docRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    }
  }

  /**
   * Allows the host to decline an incoming pending match request.
   */
  public async declineMatchRequest(requestId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.uid) {
      throw new Error('Authentication required: Sign in to decline request.');
    }

    const docPath = `${this.collectionName}/${requestId}`;
    try {
      const docRef = doc(db, this.collectionName, requestId);
      await updateDoc(docRef, {
        status: 'declined',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    }
  }

  /**
   * Accepts an incoming pending match request (Host action).
   * Verifies:
   * 1. Host identity and authentication.
   * 2. Host broadcast is active and not expired.
   * 3. Neither user is currently engaged in an active 1-to-1 match.
   * 4. Match request is still 'pending'.
   *
   * Executes coordinated flow:
   * 1. Creates a fresh 1-to-1 maxParticipants=2 activity with exactly [hostUid, requesterUid].
   * 2. Updates the matchRequest to 'accepted' with the activityId.
   * 3. Deactivates the host's availability broadcast.
   * 4. Auto-declines competing pending requests for this host.
   *
   * Returns the newly created activityId for direct Squad Chat navigation.
   */
  /**
   * Accepts an incoming pending match request (Host action).
   * Atomically executes in a Firestore runTransaction:
   * 1. Reads & validates request is pending for current host.
   * 2. Reads & validates host availability broadcast is active & unexpired (concurrency guard).
   * 3. Creates 1-to-1 activity document with exactly [hostUid, requesterUid] (maxParticipants=2).
   * 4. Updates request to 'accepted' with the activityId.
   * 5. Deactivates host broadcast so no competing requests can ever be accepted.
   *
   * Competing pending requests are automatically declined after the transaction commits.
   */
  public async acceptMatchRequest(
    requestId: string,
    hostProfile: UserProfile
  ): Promise<string> {
    const user = auth.currentUser;
    if (!user || !user.uid) {
      throw new Error('Authentication required: Sign in to accept match request.');
    }
    const hostUid = user.uid;
    if (hostProfile.id !== hostUid) {
      throw new Error('Identity mismatch: Current user is not the host.');
    }

    // Advisory pre-checks for existing active 1-to-1 matches across the collection
    const activeHostQuery = query(
      collection(db, 'activities'),
      where('participantIds', 'array-contains', hostUid),
      where('status', '==', 'active')
    );
    const activeHostSnap = await getDocs(activeHostQuery);
    if (activeHostSnap.docs.some((d) => d.data().isOneToOne === true)) {
      throw new Error('You already have an active 1-to-1 match. End your existing match before accepting a new one.');
    }

    // Document references for transactional atomic read & write
    const requestRef = doc(db, this.collectionName, requestId);
    const broadcastRef = doc(db, 'availabilityBroadcasts', hostUid);
    const newActivityRef = doc(collection(db, 'activities'));
    const newActivityId = newActivityRef.id;

    try {
      await runTransaction(db, async (transaction) => {
        // --- TRANSACTION READ PHASE (All reads strictly before writes) ---
        // 1. Read & validate the match request inside transaction
        const requestSnap = await transaction.get(requestRef);
        if (!requestSnap.exists()) {
          throw new Error('Match request not found.');
        }
        const reqData = requestSnap.data();
        if (reqData.hostUid !== hostUid) {
          throw new Error('Unauthorized: You are not the designated host for this match request.');
        }
        if (reqData.status !== 'pending') {
          throw new Error(`This match request has already been ${reqData.status}.`);
        }

        const requesterUid = reqData.requesterUid;
        if (!requesterUid || requesterUid === hostUid) {
          throw new Error('Invalid requester UID.');
        }

        // 2. Read & validate host availability broadcast as authoritative concurrency guard
        const broadcastSnap = await transaction.get(broadcastRef);
        if (!broadcastSnap.exists()) {
          throw new Error('Your Who\'s Free broadcast was not found.');
        }
        const broadcastData = broadcastSnap.data();
        const expiresAtMs = availabilityService.getMillisFromTimestamp(broadcastData.expiresAt);
        if (!broadcastData.isActive || expiresAtMs <= Date.now()) {
          throw new Error('Your availability broadcast has expired or is no longer active.');
        }

        // --- PREPARE 1-TO-1 SQUAD ACTIVITY PAYLOAD ---
        const activityInterest = reqData.activityInterest || broadcastData.activityInterest || 'Campus Hangout';
        const venue = broadcastData.locationHint || 'Student Union / Quad';
        const duration = Number(broadcastData.durationMinutes) || 60;

        const validCategories: ActivityCategory[] = [
          'Badminton', 'Cricket', 'Basketball', 'Football', 'Walking',
          'Coffee', 'Lunch', 'Study Group', 'Campus Hangout', 'Running', 'Gym', 'Board Games'
        ];
        const category: ActivityCategory = validCategories.includes(activityInterest as ActivityCategory)
          ? (activityInterest as ActivityCategory)
          : 'Campus Hangout';

        const categoryGroup: 'sports' | 'social' | 'study' = [
          'Badminton', 'Cricket', 'Basketball', 'Football', 'Running', 'Gym'
        ].includes(category)
          ? 'sports'
          : category === 'Study Group'
          ? 'study'
          : 'social';

        const activityPayload = {
          title: `1-on-1: ${activityInterest}`,
          category,
          categoryGroup,
          description: `1-to-1 Who's Free match: ${hostProfile.name} and ${reqData.requesterName} connecting for ${activityInterest} at ${venue}.`,
          venue,
          dateTime: new Date().toISOString(),
          durationMinutes: duration,
          maxParticipants: 2,
          skillLevel: 'All Levels' as const,
          campus: hostProfile.campus || hostProfile.college || 'CGC',
          createdBy: hostUid,
          hostId: hostUid,
          hostName: hostProfile.name,
          hostAvatarColor: hostProfile.avatarColor || '#3A0F34',
          hostAvatarInitials: hostProfile.avatarInitials || 'HO',
          participantIds: [hostUid, requesterUid],
          status: 'active',
          isDemo: false,
          isOneToOne: true,
          matchRequestId: requestId,
          requesterUid,
          requesterName: reqData.requesterName,
          originalBroadcastExpiresAt: expiresAtMs,
          createdAt: serverTimestamp(),
        };

        // --- TRANSACTION WRITE PHASE (Atomic commit) ---
        // a) Create 1-to-1 activity document
        transaction.set(newActivityRef, activityPayload);

        // b) Accept match request with activityId
        transaction.update(requestRef, {
          status: 'accepted',
          activityId: newActivityId,
          updatedAt: serverTimestamp(),
        });

        // c) Deactivate host broadcast (concurrency guard)
        transaction.update(broadcastRef, {
          isActive: false,
          updatedAt: serverTimestamp(),
        });
      });

      // 4. Auto-decline competing pending requests for this host after transaction commits
      try {
        const competingQuery = query(
          collection(db, this.collectionName),
          where('hostUid', '==', hostUid),
          where('status', '==', 'pending')
        );
        const competingSnap = await getDocs(competingQuery);
        const competingDocs = competingSnap.docs.filter((d) => d.id !== requestId);
        await Promise.all(
          competingDocs.map((d) =>
            updateDoc(d.ref, {
              status: 'declined',
              updatedAt: serverTimestamp(),
            })
          )
        );
      } catch (competingErr) {
        console.warn('Could not auto-decline competing match requests:', competingErr);
      }

      return newActivityId;
    } catch (err: unknown) {
      const errorObj = err as Error;
      if (
        errorObj?.message?.includes('Missing or insufficient permissions') ||
        errorObj?.message?.includes('PERMISSION_DENIED')
      ) {
        throw new Error(
          'Firestore Security Rules restricted 1-to-1 match acceptance. The updated security rules for /activities and /matchRequests must be deployed in the Firebase Console.'
        );
      }
      throw err;
    }
  }

  /**
   * Ends an active 1-to-1 match (called by Host as "End Match" or Requester as "Leave Match").
   * 1. Preserves chat history and marks activity as 'completed'.
   * 2. Marks matchRequest as 'ended'.
   * 3. Idempotent: returns cleanly if already completed/cancelled.
   * 4. Enforces ownership: ONLY the host can write to /availabilityBroadcasts to restore availability.
   *    A requester leaving never attempts to write to the host's broadcast document.
   */
  public async endOneToOneMatch(
    activityId: string,
    currentUserUid: string
  ): Promise<{ broadcastRestored: boolean; alreadyEnded?: boolean }> {
    const activityRef = doc(db, 'activities', activityId);
    const snap = await getDoc(activityRef);
    if (!snap.exists()) {
      throw new Error('Activity not found.');
    }
    const data = snap.data();
    if (!data.isOneToOne) {
      throw new Error('This activity is not a 1-to-1 match.');
    }

    const participantIds: string[] = Array.isArray(data.participantIds) ? data.participantIds : [];
    if (!participantIds.includes(currentUserUid)) {
      throw new Error('Unauthorized: Only match participants can end or leave this match.');
    }

    // Idempotent: if already ended/completed/cancelled, no-op return
    if (data.status === 'completed' || data.status === 'cancelled') {
      return { broadcastRestored: false, alreadyEnded: true };
    }

    const hostUid = data.createdBy || data.hostId;
    const isHost = hostUid === currentUserUid;
    const nowISO = new Date().toISOString();

    // 1. Update activity to 'completed' (preserves messages subcollection completely)
    await updateDoc(activityRef, {
      status: 'completed',
      endedAt: nowISO,
      endedByUid: currentUserUid,
      updatedAt: serverTimestamp(),
    });

    // 2. Mark match request as 'ended'
    if (data.matchRequestId) {
      try {
        const reqRef = doc(db, this.collectionName, data.matchRequestId);
        await updateDoc(reqRef, {
          status: 'ended',
          updatedAt: serverTimestamp(),
        });
      } catch (reqErr) {
        console.warn('Could not update matchRequest on end match:', reqErr);
      }
    }

    // 3. Restore host broadcast if original expiresAt is still in the future!
    // CRITICAL: Strictly check `isHost` so a requester NEVER attempts to write to the host's broadcast document!
    let broadcastRestored = false;
    const originalExpiresAt = data.originalBroadcastExpiresAt;
    if (isHost && typeof originalExpiresAt === 'number' && originalExpiresAt > Date.now()) {
      try {
        const broadcastRef = doc(db, 'availabilityBroadcasts', hostUid);
        const bSnap = await getDoc(broadcastRef);
        if (bSnap.exists()) {
          await updateDoc(broadcastRef, {
            isActive: true,
            updatedAt: serverTimestamp(),
          });
          broadcastRestored = true;
        }
      } catch (restoreErr) {
        console.warn('Could not restore host availability broadcast:', restoreErr);
      }
    }

    return { broadcastRestored };
  }

  /**
   * Subscribes to incoming match requests for the given host.
   * Query is strictly filtered by hostUid == current user's UID.
   * Ensures auth state is valid before initiating query.
   */
  public subscribeIncomingRequests(
    hostUid: string,
    callback: (requests: MatchRequest[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    if (!hostUid) {
      callback([]);
      return () => {};
    }

    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubAuth = auth.onAuthStateChanged((firebaseUser) => {
      // Clean up any existing snapshot listener
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      // If not authenticated or UID does not match the hostUid, do not attempt Firestore query
      if (!firebaseUser || firebaseUser.uid !== hostUid) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, this.collectionName),
        where('hostUid', '==', hostUid)
      );

      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          const requests: MatchRequest[] = snapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              hostUid: d.hostUid,
              requesterUid: d.requesterUid,
              status: d.status,
              activityInterest: d.activityInterest || 'Campus Hangout',
              requesterName: d.requesterName || 'Student',
              requesterYear: d.requesterYear,
              activityId: d.activityId,
              createdAt: d.createdAt,
              updatedAt: d.updatedAt,
            };
          });

          // Filter for active pending requests for host notification display
          const pending = requests.filter((r) => r.status === 'pending');
          callback(pending);
        },
        (error) => {
          if (onError) {
            onError(error);
          } else {
            console.warn('Incoming match requests subscription notice:', error);
          }
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }

  /**
   * Subscribes to outgoing match requests made by the current user.
   * Query is strictly filtered by requesterUid == current user's UID.
   * Ensures auth state is valid before initiating query.
   */
  public subscribeOutgoingRequests(
    requesterUid: string,
    callback: (requests: MatchRequest[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    if (!requesterUid) {
      callback([]);
      return () => {};
    }

    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubAuth = auth.onAuthStateChanged((firebaseUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (!firebaseUser || firebaseUser.uid !== requesterUid) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, this.collectionName),
        where('requesterUid', '==', requesterUid)
      );

      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          const requests: MatchRequest[] = snapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              hostUid: d.hostUid,
              requesterUid: d.requesterUid,
              status: d.status,
              activityInterest: d.activityInterest || 'Campus Hangout',
              requesterName: d.requesterName || 'Student',
              requesterYear: d.requesterYear,
              activityId: d.activityId,
              createdAt: d.createdAt,
              updatedAt: d.updatedAt,
            };
          });

          callback(requests);
        },
        (error) => {
          if (onError) {
            onError(error);
          } else {
            console.warn('Outgoing match requests subscription notice:', error);
          }
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }
}

export const matchRequestService = new MatchRequestService();
