import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { PrivateChat, PrivateChatMessage, UserProfile, WaveRequest } from '../types';

export class WaveService {
  private readonly wavesCollection = 'waves';
  private readonly chatsCollection = 'privateChats';

  /**
   * Generates a deterministic wave ID based on sender and recipient.
   */
  public getWaveId(senderUid: string, recipientUid: string): string {
    return `wave_${senderUid}_${recipientUid}`;
  }

  /**
   * Generates a deterministic private chat ID for two users.
   */
  public getPrivateChatId(uidA: string, uidB: string): string {
    const sorted = [uidA, uidB].sort();
    return `chat_${sorted[0]}_${sorted[1]}`;
  }

  /**
   * Creates or refreshes a Wave request from user A to user B.
   */
  public async sendWave(
    recipientUid: string,
    recipientName: string,
    activityInterest: string,
    currentUser: UserProfile
  ): Promise<WaveRequest> {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !firebaseUser.uid) {
      throw new Error('Authentication required: Sign in to send a wave.');
    }
    const senderUid = firebaseUser.uid;

    if (senderUid === recipientUid) {
      throw new Error('You cannot send a wave to yourself.');
    }

    const waveId = this.getWaveId(senderUid, recipientUid);
    const wavePath = `${this.wavesCollection}/${waveId}`;
    const waveRef = doc(db, this.wavesCollection, waveId);

    // Check existing wave status to prevent duplicate pending waves.
    // Note: If document does not exist yet, getDoc should not abort the creation flow.
    let existingDoc = null;
    try {
      existingDoc = await getDoc(waveRef);
    } catch (err) {
      console.warn('[WaveService] Notice checking existing wave (document may not exist yet):', err);
    }

    if (existingDoc && existingDoc.exists()) {
      const existingData = existingDoc.data();
      if (existingData.status === 'pending') {
        throw new Error(
          `You already have a pending wave with ${recipientName}. Please wait for their response.`
        );
      }

      // If existing wave is declined or cancelled, clean it up first so setDoc triggers a clean CREATE
      try {
        await deleteDoc(waveRef);
        console.log(`[WaveService] Cleaned up previous ${existingData.status} wave: ${waveId}`);
      } catch (err) {
        console.warn('[WaveService] Notice cleaning up prior wave before rewrite:', err);
      }
    }

    // Retrieve sender's public profile if available to ensure accurate display
    let authoritativeName = currentUser.name || firebaseUser.displayName || 'Campus Student';
    let authoritativeAvatarColor = currentUser.avatarColor || '#3A0F34';
    let authoritativeAvatarInitials = currentUser.avatarInitials || 'ST';

    try {
      const publicSnap = await getDoc(doc(db, 'publicProfiles', senderUid));
      if (publicSnap.exists()) {
        const pubData = publicSnap.data();
        if (pubData.displayName) authoritativeName = pubData.displayName;
        if (pubData.avatarColor) authoritativeAvatarColor = pubData.avatarColor;
        if (pubData.avatarInitials) authoritativeAvatarInitials = pubData.avatarInitials;
      }
    } catch {
      // Fallback to currentUser profile
    }

    const payload: Record<string, any> = {
      id: waveId,
      senderUid,
      senderName: authoritativeName,
      senderAvatarColor: authoritativeAvatarColor,
      senderAvatarInitials: authoritativeAvatarInitials,
      recipientUid,
      recipientName: recipientName || 'Campus Student',
      broadcastOwnerUid: recipientUid,
      activityInterest: activityInterest?.trim().slice(0, 100) || 'Campus Hangout',
      status: 'pending',
      chatId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    console.log(`[WaveService] Attempting to setDoc for wave ${waveId} (sender: ${senderUid}, recipient: ${recipientUid})`);

    try {
      await setDoc(waveRef, payload);
      console.log(`[WaveService] Wave write SUCCEEDED for wave ${waveId}`);
      return {
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as WaveRequest;
    } catch (err) {
      console.error(`[WaveService] Failed to setDoc for wave ${waveId}:`, err);
      handleFirestoreError(err, OperationType.CREATE, wavePath);
    }
  }

  /**
   * Responds to an incoming wave (Accept or Decline).
   * Only the designated recipient can accept or decline.
   */
  public async respondToWave(
    waveId: string,
    accept: boolean,
    currentUser: UserProfile
  ): Promise<{ chatId?: string }> {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !firebaseUser.uid) {
      throw new Error('Authentication required: Sign in to respond to a wave.');
    }
    const currentUid = firebaseUser.uid;
    const wavePath = `${this.wavesCollection}/${waveId}`;
    const waveRef = doc(db, this.wavesCollection, waveId);

    let waveSnap;
    try {
      waveSnap = await getDoc(waveRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, wavePath);
    }

    if (!waveSnap || !waveSnap.exists()) {
      throw new Error('Wave request not found.');
    }

    const waveData = waveSnap.data() as WaveRequest;
    if (waveData.recipientUid !== currentUid) {
      throw new Error('Unauthorized: Only the wave recipient can accept or decline.');
    }

    if (waveData.status !== 'pending') {
      throw new Error(`This wave has already been ${waveData.status}.`);
    }

    if (accept) {
      const chatId = this.getPrivateChatId(waveData.senderUid, currentUid);
      const chatPath = `${this.chatsCollection}/${chatId}`;
      const chatRef = doc(db, this.chatsCollection, chatId);

      // 1. Mark wave accepted FIRST so that security rules can verify the accepted wave
      try {
        await updateDoc(waveRef, {
          status: 'accepted',
          chatId,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, wavePath);
      }

      // 2. Create or reuse private chat room after wave status is accepted
      try {
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
          const chatPayload: Record<string, any> = {
            id: chatId,
            participantUids: [waveData.senderUid, currentUid].sort(),
            participants: {
              [waveData.senderUid]: {
                name: waveData.senderName,
                avatarColor: waveData.senderAvatarColor || '#3A0F34',
                avatarInitials: waveData.senderAvatarInitials || 'ST',
              },
              [currentUid]: {
                name: currentUser.name || firebaseUser.displayName || 'Campus Student',
                avatarColor: currentUser.avatarColor || '#3A0F34',
                avatarInitials: currentUser.avatarInitials || 'ST',
              },
            },
            activityInterest: waveData.activityInterest,
            waveId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessageText: `Wave accepted! Ready to coordinate ${waveData.activityInterest}.`,
            lastMessageAt: serverTimestamp(),
          };

          await setDoc(chatRef, chatPayload);

          // Add initial greeting message using authentic recipient UID (prevents forged 'system' messages)
          await addDoc(collection(db, this.chatsCollection, chatId, 'messages'), {
            chatId,
            senderId: currentUid,
            senderName: currentUser.name || firebaseUser.displayName || 'Campus Student',
            senderAvatarColor: currentUser.avatarColor || '#3A0F34',
            senderAvatarInitials: currentUser.avatarInitials || 'ST',
            text: `👋 Hey! I accepted your wave for ${waveData.activityInterest}. Let's coordinate where to meet on campus!`,
            isSystemNotification: false,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, chatPath);
      }

      return { chatId };
    } else {
      // Decline wave
      try {
        await updateDoc(waveRef, {
          status: 'declined',
          updatedAt: serverTimestamp(),
        });
        return {};
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, wavePath);
      }
    }
  }

  /**
   * Subscribes to real-time incoming waves for the current user.
   */
  public subscribeToIncomingWaves(
    recipientUid: string,
    callback: (waves: WaveRequest[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    console.log(`[WaveService] Initializing incoming waves query for recipient: ${recipientUid}`);
    const q = query(
      collection(db, this.wavesCollection),
      where('recipientUid', '==', recipientUid)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        console.log(
          `[WaveService] Incoming waves snapshot update for recipient ${recipientUid}: ${snapshot.docs.length} wave doc(s)`
        );
        const waves: WaveRequest[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            senderUid: data.senderUid,
            senderName: data.senderName || 'Campus Student',
            senderAvatarColor: data.senderAvatarColor || '#3A0F34',
            senderAvatarInitials: data.senderAvatarInitials || 'ST',
            recipientUid: data.recipientUid,
            recipientName: data.recipientName || 'Campus Student',
            broadcastOwnerUid: data.broadcastOwnerUid,
            activityInterest: data.activityInterest || 'Campus Hangout',
            status: data.status || 'pending',
            chatId: data.chatId || null,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        callback(waves);
      },
      (err) => {
        console.error(`[WaveService] Real-time listener ERROR on incoming waves for recipient ${recipientUid}:`, err);
        if (onError) onError(err);
      }
    );
  }

  /**
   * Subscribes to real-time outgoing waves sent by the current user.
   */
  public subscribeToOutgoingWaves(
    senderUid: string,
    callback: (waves: WaveRequest[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    console.log(`[WaveService] Initializing outgoing waves query for sender: ${senderUid}`);
    const q = query(
      collection(db, this.wavesCollection),
      where('senderUid', '==', senderUid)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        console.log(
          `[WaveService] Outgoing waves snapshot update for sender ${senderUid}: ${snapshot.docs.length} wave doc(s)`
        );
        const waves: WaveRequest[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            senderUid: data.senderUid,
            senderName: data.senderName || 'Campus Student',
            senderAvatarColor: data.senderAvatarColor || '#3A0F34',
            senderAvatarInitials: data.senderAvatarInitials || 'ST',
            recipientUid: data.recipientUid,
            recipientName: data.recipientName || 'Campus Student',
            broadcastOwnerUid: data.broadcastOwnerUid,
            activityInterest: data.activityInterest || 'Campus Hangout',
            status: data.status || 'pending',
            chatId: data.chatId || null,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        callback(waves);
      },
      (err) => {
        console.error(`[WaveService] Real-time listener ERROR on outgoing waves for sender ${senderUid}:`, err);
        if (onError) onError(err);
      }
    );
  }

  /**
   * Fetches private chat document details.
   */
  public async getPrivateChat(chatId: string): Promise<PrivateChat | null> {
    const chatRef = doc(db, this.chatsCollection, chatId);
    try {
      const snap = await getDoc(chatRef);
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        id: snap.id,
        participantUids: data.participantUids || [],
        participants: data.participants || {},
        activityInterest: data.activityInterest,
        waveId: data.waveId,
        lastMessageText: data.lastMessageText,
        lastMessageAt: data.lastMessageAt,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${this.chatsCollection}/${chatId}`);
    }
  }

  /**
   * Subscribes to real-time messages in a private one-to-one chat.
   */
  public subscribeToPrivateChat(
    chatId: string,
    callback: (messages: PrivateChatMessage[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const messagesRef = collection(db, this.chatsCollection, chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const messages: PrivateChatMessage[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            chatId: data.chatId || chatId,
            senderId: data.senderId,
            senderName: data.senderName || 'Campus Student',
            senderAvatarColor: data.senderAvatarColor || '#3A0F34',
            senderAvatarInitials: data.senderAvatarInitials || 'ST',
            text: data.text || '',
            isSystemNotification: !!data.isSystemNotification,
            createdAt: data.createdAt,
          };
        });
        callback(messages);
      },
      (err) => {
        console.error(`Error subscribing to private chat ${chatId}:`, err);
        if (onError) onError(err);
      }
    );
  }

  /**
   * Sends a message in a private chat.
   */
  public async sendPrivateMessage(
    chatId: string,
    text: string,
    currentUser: UserProfile
  ): Promise<void> {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !firebaseUser.uid) {
      throw new Error('Authentication required: Sign in to send a message.');
    }
    const senderId = firebaseUser.uid;

    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Message cannot be empty.');
    }
    if (trimmed.length > 1000) {
      throw new Error('Message length exceeds 1000 characters limit.');
    }

    const messagesPath = `${this.chatsCollection}/${chatId}/messages`;
    const chatDocPath = `${this.chatsCollection}/${chatId}`;

    const messagePayload = {
      chatId,
      senderId,
      senderName: currentUser.name || firebaseUser.displayName || 'Campus Student',
      senderAvatarColor: currentUser.avatarColor || '#3A0F34',
      senderAvatarInitials: currentUser.avatarInitials || 'ST',
      text: trimmed,
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, this.chatsCollection, chatId, 'messages'), messagePayload);
      await updateDoc(doc(db, this.chatsCollection, chatId), {
        lastMessageText: trimmed,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, messagesPath);
    }
  }
}

export const waveService = new WaveService();
