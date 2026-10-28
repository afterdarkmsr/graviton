import {
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile } from '../types';

export class AuthService {
  /**
   * Signs in user with Google popup
   */
  public async signInWithGoogle(): Promise<{ user?: User; error?: string }> {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return { user: result.user };
    } catch (err: unknown) {
      console.error('Google Sign-in failed:', err);

      let errorMessage = 'Google Sign-In failed. Please try again.';
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code;
        if (code === 'auth/popup-closed-by-user') {
          errorMessage = 'Sign-in was cancelled before completion.';
        } else if (code === 'auth/popup-blocked') {
          errorMessage = 'Sign-in popup was blocked by your browser. Please allow popups for this domain.';
        } else if (code === 'auth/unauthorized-domain') {
          errorMessage = 'This domain is not yet authorized in Firebase Console (Authentication > Settings > Authorized Domains).';
        } else if (code === 'auth/network-request-failed') {
          errorMessage = 'Network connection problem. Please check your internet connection.';
        } else if (code === 'auth/cancelled-popup-request') {
          errorMessage = 'Previous sign-in request was replaced by a new one.';
        } else if (code === 'auth/operation-not-allowed') {
          errorMessage = 'Google Sign-In is not enabled yet in your Firebase project console. Please enable Google provider in Firebase Console > Authentication > Sign-in method.';
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      return { error: errorMessage };
    }
  }

  /**
   * Signs out current user
   */
  public async signOutUser(): Promise<{ success: boolean; error?: string }> {
    try {
      await signOut(auth);
      return { success: true };
    } catch (err) {
      console.error('Sign-out failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Sign out failed' };
    }
  }

  /**
   * Retrieves user profile from Firestore by user ID
   */
  public async getUserProfile(userId: string): Promise<UserProfile | null> {
    const docPath = `users/${userId}`;
    try {
      const docRef = doc(db, 'users', userId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data();
      return {
        id: userId,
        userId: userId,
        email: data.email || '',
        name: data.name || '',
        college: data.college || '',
        year: data.year || 'Sophomore',
        bio: data.bio || '',
        avatarColor: data.avatarColor || '#3A0F34',
        avatarInitials: data.avatarInitials || 'ST',
        interests: data.interests || [],
        skillLevels: data.skillLevels || {},
        typicalAvailability: data.typicalAvailability || [],
        privacyPreferences: data.privacyPreferences || {
          showCollegeToCampusPeers: true,
          onlyMatchCompatibleSkills: false,
          allowDirectInvites: true,
        },
        freeUntil: data.freeUntil || null,
        freeStatusNote: data.freeStatusNote || null,
        isOnboarded: data.isOnboarded ?? true,
        isSampleUser: false,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, docPath);
    }
  }

  /**
   * Saves or updates user profile in Firestore under /users/{userId}
   */
  public async saveUserProfile(profile: UserProfile): Promise<void> {
    const userId = profile.id;
    const docPath = `users/${userId}`;

    const profileData = {
      userId: userId,
      email: profile.email || '',
      name: profile.name,
      college: profile.college,
      year: profile.year,
      bio: profile.bio || '',
      avatarColor: profile.avatarColor || '#3A0F34',
      avatarInitials: profile.avatarInitials || 'ST',
      interests: profile.interests || [],
      skillLevels: profile.skillLevels || {},
      typicalAvailability: profile.typicalAvailability || [],
      privacyPreferences: profile.privacyPreferences,
      freeUntil: profile.freeUntil,
      freeStatusNote: profile.freeStatusNote,
      isOnboarded: profile.isOnboarded ?? true,
      updatedAt: new Date().toISOString(),
      createdAt: profile.createdAt || new Date().toISOString(),
    };

    try {
      const docRef = doc(db, 'users', userId);
      await setDoc(docRef, profileData, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, docPath);
    }
  }
}

export const authService = new AuthService();
