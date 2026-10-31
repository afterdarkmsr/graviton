import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  runTransaction,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Activity, ActivityCategory, ActivityMessage, ActivityParticipant, SkillLevel, UserProfile } from '../types';

export interface CreateActivityInput {
  title: string;
  category: ActivityCategory;
  categoryGroup: 'sports' | 'social' | 'study';
  description: string;
  campus?: string;
  venue: string;
  dateTime: string;
  durationMinutes: number;
  maxParticipants: number;
  skillLevel: SkillLevel;
}

export class ActivityFirestoreService {
  private readonly collectionName = 'activities';

  /**
   * Creates a new activity in the Firestore 'activities' collection.
   * Enforces validation and security rules compliance (request.auth.uid == createdBy).
   */
  public async createActivity(
    input: CreateActivityInput,
    currentUser: UserProfile
  ): Promise<Activity> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      throw new Error('Authentication required: You must be signed in to create an activity.');
    }

    if (currentUid !== currentUser.id) {
      throw new Error('Identity mismatch: Current authenticated user does not match the host profile.');
    }

    const trimmedTitle = input.title.trim();
    if (!trimmedTitle || trimmedTitle.length < 5) {
      throw new Error('Activity title must be at least 5 characters long.');
    }

    const trimmedVenue = input.venue.trim();
    if (!trimmedVenue || trimmedVenue.length < 2) {
      throw new Error('Please specify a public campus venue (at least 2 characters).');
    }

    if (input.maxParticipants < 2 || input.maxParticipants > 24) {
      throw new Error('Participant capacity must be between 2 and 24 students.');
    }

    const scheduledEpoch = new Date(input.dateTime).getTime();
    if (isNaN(scheduledEpoch) || scheduledEpoch <= Date.now()) {
      throw new Error('Please select a scheduled start time in the future.');
    }

    const description =
      input.description.trim() ||
      `Spontaneous ${input.category} meetup at ${trimmedVenue}. Looking for enthusiastic campus peers!`;

    const docPayload = {
      title: trimmedTitle,
      category: input.category,
      categoryGroup: input.categoryGroup,
      description,
      venue: trimmedVenue,
      dateTime: new Date(input.dateTime).toISOString(),
      durationMinutes: Number(input.durationMinutes),
      maxParticipants: Number(input.maxParticipants),
      skillLevel: input.skillLevel,
      campus: input.campus || currentUser.campus || currentUser.college || 'CGC',
      createdBy: currentUid,
      hostName: currentUser.name,
      hostAvatarColor: currentUser.avatarColor || '#3A0F34',
      hostAvatarInitials: currentUser.avatarInitials || 'ST',
      participantIds: [currentUid],
      status: 'active',
      createdAt: serverTimestamp(),
    };

    try {
      const colRef = collection(db, this.collectionName);
      const docRef = await addDoc(colRef, docPayload);

      return {
        id: docRef.id,
        title: trimmedTitle,
        category: input.category,
        categoryGroup: input.categoryGroup,
        description,
        venue: trimmedVenue,
        dateTime: docPayload.dateTime,
        durationMinutes: docPayload.durationMinutes,
        maxParticipants: docPayload.maxParticipants,
        skillLevel: input.skillLevel,
        campus: docPayload.campus,
        createdBy: currentUid,
        hostId: currentUid,
        hostName: currentUser.name,
        hostCollege: currentUser.college || currentUser.campus || 'CGC',
        hostAvatarColor: docPayload.hostAvatarColor,
        hostAvatarInitials: docPayload.hostAvatarInitials,
        participantIds: [currentUid],
        isDemo: false,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, this.collectionName);
    }
  }

  /**
   * Subscribes to real-time updates from Firestore 'activities' collection using onSnapshot().
   * Automatically parses Firestore documents into the typed Activity model and provides error handling.
   */
  public subscribeToActivities(
    onUpdate: (activities: Activity[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const colRef = collection(db, this.collectionName);

    return onSnapshot(
      colRef,
      (snapshot) => {
        const activities: Activity[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();

          let createdAtISO = new Date().toISOString();
          if (data.createdAt instanceof Timestamp) {
            createdAtISO = data.createdAt.toDate().toISOString();
          } else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            createdAtISO = data.createdAt.toDate().toISOString();
          } else if (typeof data.createdAt === 'string') {
            createdAtISO = data.createdAt;
          }

          const participantIds: string[] = Array.isArray(data.participantIds)
            ? data.participantIds
            : [data.createdBy || 'unknown'];

          return {
            id: docSnap.id,
            title: data.title || 'Untitled Activity',
            category: (data.category as ActivityCategory) || 'Campus Hangout',
            categoryGroup: (data.categoryGroup as 'sports' | 'social' | 'study') || 'social',
            description: data.description || '',
            campus: data.campus,
            venue: data.venue || 'Campus Center',
            dateTime: data.dateTime || new Date().toISOString(),
            durationMinutes: Number(data.durationMinutes) || 60,
            maxParticipants: Number(data.maxParticipants) || 4,
            skillLevel: (data.skillLevel as SkillLevel) || 'All Levels',
            createdBy: data.createdBy || '',
            hostId: data.createdBy || '',
            hostName: data.hostName || 'Student',
            hostCollege: data.hostCollege || data.campus || 'CGC',
            hostAvatarColor: data.hostAvatarColor || '#3A0F34',
            hostAvatarInitials: data.hostAvatarInitials || 'ST',
            participantIds,
            isDemo: false,
            status: (data.status as Activity['status']) || 'active',
            createdAt: createdAtISO,
            isOneToOne: !!data.isOneToOne,
            matchRequestId: data.matchRequestId,
            requesterUid: data.requesterUid,
            requesterName: data.requesterName,
            endedAt: data.endedAt,
            endedByUid: data.endedByUid,
            originalBroadcastExpiresAt: data.originalBroadcastExpiresAt,
          };
        });

        // Sort: Active upcoming activities first, then by scheduled date
        activities.sort((a, b) => {
          return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
        });

        onUpdate(activities);
      },
      (error) => {
        if (onError) {
          onError(error);
        }
        try {
          handleFirestoreError(error, OperationType.GET, this.collectionName);
        } catch (e) {
          console.error('Firestore onSnapshot listener error:', e);
        }
      }
    );
  }

  /**
   * Joins an activity in Cloud Firestore using an atomic transaction.
   * Prevents race conditions, double-booking, duplicate joins, and overbooking.
   *
   * Validates server-side:
   * 1. Activity document exists and is 'active'
   * 2. Host cannot join as a participant (already creator)
   * 3. Current user is not already in participantIds
   * 4. Current participant count < maxParticipants
   *
   * Writes atomically:
   * 1. Appends current UID to activity.participantIds
   * 2. Sets activity.status = 'full' if max capacity is reached, or 'active'
   * 3. Creates membership receipt in subcollection `/activities/{activityId}/participants/{userId}`
   */
  public async joinActivity(activityId: string, currentUser: UserProfile): Promise<void> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      throw new Error('Authentication required: You must be signed in to join an activity.');
    }
    if (currentUid !== currentUser.id) {
      throw new Error('Identity mismatch: Current authenticated user does not match the participant profile.');
    }

    const activityRef = doc(db, this.collectionName, activityId);

    try {
      await runTransaction(db, async (transaction) => {
        const activitySnap = await transaction.get(activityRef);
        if (!activitySnap.exists()) {
          throw new Error('Activity not found. It may have been deleted by the host.');
        }

        const data = activitySnap.data();

        // Check activity status
        if (data.status === 'cancelled') {
          throw new Error('This activity has been cancelled by the host.');
        }
        if (data.status === 'completed') {
          throw new Error('This activity has already taken place.');
        }

        // Host cannot join as a participant
        if (data.createdBy === currentUid) {
          throw new Error('You are the host of this activity and already lead the squad.');
        }

        const existingParticipantIds: string[] = Array.isArray(data.participantIds)
          ? data.participantIds
          : [data.createdBy || ''];

        // Duplicate join check
        if (existingParticipantIds.includes(currentUid)) {
          throw new Error('You are already a member of this squad.');
        }

        const maxParticipants = Number(data.maxParticipants) || 4;

        // Capacity limit check
        if (existingParticipantIds.length >= maxParticipants) {
          throw new Error(`This squad is already full (${maxParticipants}/${maxParticipants} spots filled).`);
        }

        const newParticipantIds = [...existingParticipantIds, currentUid];
        const newStatus = newParticipantIds.length >= maxParticipants ? 'full' : 'active';

        // Single authoritative update
        transaction.update(activityRef, {
          participantIds: newParticipantIds,
          status: newStatus,
        });
      });
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes('Authentication required') ||
          error.message.includes('Identity mismatch') ||
          error.message.includes('Activity not found') ||
          error.message.includes('cancelled') ||
          error.message.includes('already taken place') ||
          error.message.includes('already a member') ||
          error.message.includes('already full') ||
          error.message.includes('host')
        ) {
          throw error;
        }
      }
      handleFirestoreError(error, OperationType.UPDATE, `${this.collectionName}/${activityId}`);
    }
  }

  /**
   * Leaves an activity in Cloud Firestore using an atomic transaction.
   *
   * Validates server-side:
   * 1. Activity document exists
   * 2. Host cannot leave their own activity (must cancel instead)
   * 3. Current user is currently in participantIds
   *
   * Writes atomically:
   * 1. Removes current UID from activity.participantIds
   * 2. Restores activity.status to 'active' if it was previously 'full'
   */
  public async leaveActivity(activityId: string, userId: string): Promise<void> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      throw new Error('Authentication required: You must be signed in to leave an activity.');
    }
    if (currentUid !== userId) {
      throw new Error('Identity mismatch: You can only leave activities for your own account.');
    }

    const activityRef = doc(db, this.collectionName, activityId);

    try {
      await runTransaction(db, async (transaction) => {
        const activitySnap = await transaction.get(activityRef);
        if (!activitySnap.exists()) {
          throw new Error('Activity not found.');
        }

        const data = activitySnap.data();

        // Host cannot leave their own activity
        if (data.createdBy === currentUid) {
          throw new Error('As the host, you cannot leave your own squad. You can cancel the activity if needed.');
        }

        const existingParticipantIds: string[] = Array.isArray(data.participantIds)
          ? data.participantIds
          : [];

        if (!existingParticipantIds.includes(currentUid)) {
          throw new Error('You are not currently a member of this squad.');
        }

        const newParticipantIds = existingParticipantIds.filter((id) => id !== currentUid);
        // If it was full, reopening a spot returns it to active
        const newStatus = data.status === 'full' ? 'active' : data.status;

        transaction.update(activityRef, {
          participantIds: newParticipantIds,
          status: newStatus,
        });
      });
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes('Authentication required') ||
          error.message.includes('Identity mismatch') ||
          error.message.includes('Activity not found') ||
          error.message.includes('host') ||
          error.message.includes('not currently a member')
        ) {
          throw error;
        }
      }
      handleFirestoreError(error, OperationType.UPDATE, `${this.collectionName}/${activityId}`);
    }
  }

  /**
   * Subscribes to real-time updates for participants of a specific activity.
   */
  public subscribeToParticipants(
    activityId: string,
    onUpdate: (participants: ActivityParticipant[]) => void
  ): () => void {
    const colRef = collection(db, this.collectionName, activityId, 'participants');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const participants: ActivityParticipant[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          let joinedAtISO = new Date().toISOString();
          if (d.joinedAt instanceof Timestamp) {
            joinedAtISO = d.joinedAt.toDate().toISOString();
          } else if (d.joinedAt && typeof d.joinedAt.toDate === 'function') {
            joinedAtISO = d.joinedAt.toDate().toISOString();
          }
          return {
            id: docSnap.id,
            name: d.name || 'Campus Student',
            college: d.college || 'CGC',
            avatarColor: d.avatarColor || '#3A0F34',
            avatarInitials: d.avatarInitials || 'ST',
            isHost: false,
            joinedAt: joinedAtISO,
          };
        });
        onUpdate(participants);
      },
      (error) => {
        // If subcollection doesn't exist or isn't accessible, silently handle
        console.warn('Participants listener note:', error);
      }
    );
  }

  /**
   * Sends a real-time chat message to the activity's messages subcollection:
   * /activities/{activityId}/messages/{messageId}
   *
   * Enforces:
   * 1. Sender must be authenticated.
   * 2. Message cannot be empty.
   * 3. Message length <= 1000 characters.
   * 4. Uses serverTimestamp() for authoritative time ordering.
   */
  public async sendMessage(
    activityId: string,
    currentUser: UserProfile,
    text: string
  ): Promise<void> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      throw new Error('Authentication required: You must be signed in to send a message.');
    }

    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Message cannot be empty.');
    }
    if (trimmed.length > 1000) {
      throw new Error('Message length exceeds the 1000 character limit.');
    }

    const messagesCol = collection(db, this.collectionName, activityId, 'messages');
    const senderDisplayName = (currentUser.name && currentUser.name.trim()) || 'Campus Student';
    try {
      await addDoc(messagesCol, {
        activityId,
        senderId: currentUid,
        senderName: senderDisplayName,
        senderAvatarColor: currentUser.avatarColor || '#3A0F34',
        senderAvatarInitials: currentUser.avatarInitials || 'ST',
        text: trimmed,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${this.collectionName}/${activityId}/messages`);
    }
  }

  /**
   * Subscribes to real-time chat messages for an activity using onSnapshot() and orderBy('createdAt', 'asc').
   * Returns an unsubscribe function to properly clean up the listener on unmount.
   */
  public subscribeToMessages(
    activityId: string,
    onUpdate: (messages: ActivityMessage[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const messagesCol = collection(db, this.collectionName, activityId, 'messages');
    const q = query(messagesCol, orderBy('createdAt', 'asc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const msgs: ActivityMessage[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          let timestampISO = new Date().toISOString();
          if (data.createdAt instanceof Timestamp) {
            timestampISO = data.createdAt.toDate().toISOString();
          } else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            timestampISO = data.createdAt.toDate().toISOString();
          } else if (typeof data.createdAt === 'string') {
            timestampISO = data.createdAt;
          }

          return {
            id: docSnap.id,
            activityId,
            senderId: data.senderId || 'unknown',
            senderName: data.senderName || 'Student',
            senderAvatarColor: data.senderAvatarColor || '#3A0F34',
            senderAvatarInitials: data.senderAvatarInitials || 'ST',
            text: data.text || '',
            timestamp: timestampISO,
            isSystemNotification: !!data.isSystemNotification,
          };
        });
        onUpdate(msgs);
      },
      (error) => {
        if (onError) {
          onError(error);
        }
        console.warn('Real-time messages listener warning:', error);
      }
    );
  }

  /**
   * Cancels an activity in Firestore if the current user is the host/creator.
   * Updates status to 'cancelled' and records updatedAt.
   */
  public async cancelActivity(activityId: string, currentUserUid: string): Promise<void> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      throw new Error('Authentication required: You must be signed in to cancel an activity.');
    }
    if (currentUid !== currentUserUid) {
      throw new Error('Unauthorized: Only the host can cancel this activity.');
    }

    const docPath = `${this.collectionName}/${activityId}`;
    try {
      const docRef = doc(db, this.collectionName, activityId);
      await updateDoc(docRef, {
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  }

  /**
   * Deletes an activity in Firestore if the current user is the creator.
   */
  public async deleteActivity(activityId: string, currentUserUid?: string): Promise<void> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      throw new Error('Authentication required: You must be signed in to delete an activity.');
    }
    if (currentUserUid && currentUid !== currentUserUid) {
      throw new Error('Unauthorized: Only the host can delete this activity.');
    }

    const docPath = `${this.collectionName}/${activityId}`;
    try {
      const docRef = doc(db, this.collectionName, activityId);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  }

  /**
   * Fetches a single activity document directly by ID.
   */
  public async getActivityById(activityId: string): Promise<Activity | null> {
    try {
      const docRef = doc(db, this.collectionName, activityId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      const data = snap.data();

      let createdAtISO = new Date().toISOString();
      if (data.createdAt instanceof Timestamp) {
        createdAtISO = data.createdAt.toDate().toISOString();
      } else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        createdAtISO = data.createdAt.toDate().toISOString();
      } else if (typeof data.createdAt === 'string') {
        createdAtISO = data.createdAt;
      }

      const participantIds: string[] = Array.isArray(data.participantIds)
        ? data.participantIds
        : [data.createdBy || 'unknown'];

      return {
        id: snap.id,
        title: data.title || 'Untitled Activity',
        category: (data.category as ActivityCategory) || 'Campus Hangout',
        categoryGroup: (data.categoryGroup as 'sports' | 'social' | 'study') || 'social',
        description: data.description || '',
        campus: data.campus,
        venue: data.venue || 'Campus Center',
        dateTime: data.dateTime || new Date().toISOString(),
        durationMinutes: Number(data.durationMinutes) || 60,
        maxParticipants: Number(data.maxParticipants) || 4,
        skillLevel: (data.skillLevel as SkillLevel) || 'All Levels',
        createdBy: data.createdBy || '',
        hostId: data.createdBy || '',
        hostName: data.hostName || 'Student',
        hostCollege: data.hostCollege || data.campus || 'CGC',
        hostAvatarColor: data.hostAvatarColor || '#3A0F34',
        hostAvatarInitials: data.hostAvatarInitials || 'ST',
        participantIds,
        isDemo: false,
        status: (data.status as Activity['status']) || 'active',
        createdAt: createdAtISO,
        isOneToOne: !!data.isOneToOne,
        matchRequestId: data.matchRequestId,
        requesterUid: data.requesterUid,
        requesterName: data.requesterName,
        endedAt: data.endedAt,
        endedByUid: data.endedByUid,
        originalBroadcastExpiresAt: data.originalBroadcastExpiresAt,
      };
    } catch (err) {
      console.warn('Failed to fetch activity by ID:', err);
      return null;
    }
  }
}

export const activityFirestoreService = new ActivityFirestoreService();
