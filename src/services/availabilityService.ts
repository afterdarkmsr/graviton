import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
  getDoc,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { AvailabilityBroadcast, UserProfile } from '../types';

export interface PublishBroadcastInput {
  durationMinutes: number; // 15 to 240 minutes
  statusNote: string;
  locationHint: string;
  activityInterest?: string;
}

export class AvailabilityService {
  private readonly collectionName = 'availabilityBroadcasts';

  /**
   * Helper to safely extract milliseconds from Firestore Timestamp or legacy value
   */
  public getMillisFromTimestamp(val: any): number {
    if (!val) return 0;
    if (typeof val.toMillis === 'function') {
      return val.toMillis();
    }
    if (typeof val.seconds === 'number') {
      return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1000000);
    }
    if (typeof val === 'number') {
      return val;
    }
    if (val instanceof Date) {
      return val.getTime();
    }
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Publishes an active availability broadcast under /availabilityBroadcasts/{uid}.
   * Uses authoritative Firebase Auth UID for document ID and ownerUid.
   * Inspects existing doc: if active & unexpired, prevents overwrite;
   * if cancelled or expired, deletes old doc first so setDoc executes as an authoritative CREATE.
   */
  public async publishBroadcast(
    input: PublishBroadcastInput,
    currentUser: UserProfile
  ): Promise<void> {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !firebaseUser.uid) {
      throw new Error('Authentication required: You must be signed in to broadcast availability.');
    }
    const currentUid = firebaseUser.uid;

    if (currentUid !== currentUser.id) {
      throw new Error('Identity mismatch: Current authenticated user does not match the broadcasting profile.');
    }

    const rawDuration =
      typeof input.durationMinutes === 'number' && !isNaN(input.durationMinutes)
        ? input.durationMinutes
        : 60;
    const duration = Math.min(240, Math.max(15, Math.round(rawDuration)));
    const trimmedNote = input.statusNote.trim().slice(0, 300) || 'Free for spontaneous campus hangout or study!';
    const trimmedLocation = input.locationHint.trim().slice(0, 150) || 'Student Union / Quad';
    const trimmedInterest =
      input.activityInterest?.trim().slice(0, 100) ||
      (currentUser.interests && currentUser.interests.length > 0
        ? currentUser.interests[0]
        : 'Campus Hangout');

    const docPath = `${this.collectionName}/${currentUid}`;
    const docRef = doc(db, this.collectionName, currentUid);

    // 1. Inspect existing broadcast document before writing
    let existingSnap;
    try {
      existingSnap = await getDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, docPath);
    }

    if (existingSnap && existingSnap.exists()) {
      const existingData = existingSnap.data();
      const existingExpiresMs = this.getMillisFromTimestamp(existingData?.expiresAt);
      const isExistingActiveAndUnexpired =
        existingData?.isActive === true && existingExpiresMs > Date.now();

      if (isExistingActiveAndUnexpired) {
        const minutesRemaining = Math.max(1, Math.ceil((existingExpiresMs - Date.now()) / 60000));
        throw new Error(
          `You already have an active availability broadcast with ~${minutesRemaining}m remaining. End your current broadcast before broadcasting a new one.`
        );
      }

      // Existing broadcast is expired or cancelled: delete it so setDoc executes a genuine CREATE
      try {
        await deleteDoc(docRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, docPath);
      }
    }

    // 2. Fetch authoritative publicProfile to avoid spoofing
    let authoritativeName = currentUser.name || firebaseUser.displayName || 'Campus Student';
    let authoritativeAvatarColor = currentUser.avatarColor || '#3A0F34';
    let authoritativeAvatarInitials = currentUser.avatarInitials || 'ST';
    let authoritativeYear = currentUser.year || undefined;

    try {
      const publicSnap = await getDoc(doc(db, 'publicProfiles', currentUid));
      if (publicSnap.exists()) {
        const pubData = publicSnap.data();
        if (pubData.displayName) authoritativeName = pubData.displayName;
        if (pubData.avatarColor) authoritativeAvatarColor = pubData.avatarColor;
        if (pubData.avatarInitials) authoritativeAvatarInitials = pubData.avatarInitials;
        if (pubData.year) authoritativeYear = pubData.year;
      }
    } catch {
      // Fallback to validated currentUser profile
    }

    const expiresAtMillis = Date.now() + duration * 60 * 1000;
    const expiresAtTimestamp = Timestamp.fromMillis(expiresAtMillis);

    const broadcastPayload: Record<string, any> = {
      ownerUid: currentUid,
      displayName: authoritativeName,
      photoURL: firebaseUser.photoURL || null,
      avatarColor: authoritativeAvatarColor,
      avatarInitials: authoritativeAvatarInitials,
      college: currentUser.college || currentUser.campus || 'Campus Community',
      campus: currentUser.campus || currentUser.college || 'Campus Community',
      activityInterest: trimmedInterest,
      statusNote: trimmedNote,
      locationHint: trimmedLocation,
      durationMinutes: duration,
      createdAt: serverTimestamp(),
      expiresAt: expiresAtTimestamp,
      isActive: true,
      updatedAt: serverTimestamp(),
    };

    if (authoritativeYear) {
      broadcastPayload.year = authoritativeYear;
    }

    // 3. Perform genuine CREATE on clean path
    try {
      await setDoc(docRef, broadcastPayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, docPath);
    }
  }

  /**
   * Cancels the active availability broadcast for the authenticated user by deleting the document.
   * Only the owner can delete their own broadcast document.
   */
  public async cancelBroadcast(ownerUid: string): Promise<void> {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      throw new Error('Authentication required: Sign in to cancel broadcast.');
    }

    if (currentUid !== ownerUid) {
      throw new Error('Permission denied: You can only cancel your own availability broadcast.');
    }

    const docPath = `${this.collectionName}/${ownerUid}`;
    try {
      const docRef = doc(db, this.collectionName, ownerUid);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }

  /**
   * Subscribes to all active broadcasts in real-time.
   * Returns an unsubscribe function.
   */
  public subscribeToActiveBroadcasts(
    callback: (broadcasts: AvailabilityBroadcast[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const q = query(
      collection(db, this.collectionName),
      where('isActive', '==', true)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const broadcasts: AvailabilityBroadcast[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ownerUid: data.ownerUid || docSnap.id,
            displayName: data.displayName || 'Campus Student',
            photoURL: data.photoURL || null,
            avatarColor: data.avatarColor || '#3A0F34',
            avatarInitials: data.avatarInitials || 'ST',
            college: data.college || data.campus || 'Campus Community',
            campus: data.campus || data.college || 'Campus Community',
            activityInterest: data.activityInterest || 'Campus Hangout',
            statusNote: data.statusNote || 'Free on campus right now!',
            locationHint: data.locationHint || 'Campus Center / Quad',
            durationMinutes: Number(data.durationMinutes) || 60,
            createdAt: data.createdAt,
            expiresAt: data.expiresAt,
            isActive: !!data.isActive,
            updatedAt: data.updatedAt,
          };
        });

        callback(broadcasts);
      },
      (error) => {
        console.error('Error in availability broadcasts subscription:', error);
        if (onError) {
          onError(error);
        } else {
          handleFirestoreError(error, OperationType.LIST, this.collectionName);
        }
      }
    );
  }
}

export const availabilityService = new AvailabilityService();
