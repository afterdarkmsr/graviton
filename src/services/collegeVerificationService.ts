import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  EmailAuthProvider,
  linkWithCredential,
  User,
  ActionCodeSettings,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

const CGC_DOMAIN = '@cgcjhanjeri.in';
const STORAGE_EMAIL_KEY = 'vibematch_cgc_verification_email';
const STORAGE_UID_KEY = 'vibematch_cgc_verification_uid';
const STORAGE_TIME_KEY = 'vibematch_cgc_verification_time';
const STORAGE_SKIPPED_KEY = 'vibematch_cgc_verification_skipped';

export interface VerificationResult {
  success: boolean;
  error?: string;
  code?: 'NEED_LOGIN' | 'WRONG_ACCOUNT' | 'EMAIL_REQUIRED' | 'EXPIRED' | 'COLLISION' | 'UNKNOWN';
  linkedEmail?: string;
}

export class CollegeVerificationService {
  /**
   * Validates if the email strictly ends with the official CGC Jhanjeri campus domain
   */
  public validateCgcEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const clean = email.trim().toLowerCase();
    return /^[a-zA-Z0-9._%+-]+@cgcjhanjeri\.in$/i.test(clean);
  }

  /**
   * Sends a genuine Firebase Email Link to the student's @cgcjhanjeri.in inbox
   * Operates strictly in the context of the active authenticated user
   */
  public async sendVerificationLink(collegeEmail: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = collegeEmail.trim().toLowerCase();

    if (!this.validateCgcEmail(cleanEmail)) {
      return { success: false, error: 'Please enter a valid college email ending in @cgcjhanjeri.in' };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'You must be signed in with Google to verify your college email.' };
    }

    try {
      // Direct return URL preserving current location path with mode flag
      const actionCodeSettings: ActionCodeSettings = {
        url: `${window.location.origin}${window.location.pathname}?mode=verify-cgc`,
        handleCodeInApp: true,
      };

      // Store intent locally to bind incoming link to the current session and email
      localStorage.setItem(STORAGE_EMAIL_KEY, cleanEmail);
      localStorage.setItem(STORAGE_UID_KEY, currentUser.uid);
      localStorage.setItem(STORAGE_TIME_KEY, Date.now().toString());

      await sendSignInLinkToEmail(auth, cleanEmail, actionCodeSettings);
      return { success: true };
    } catch (err: unknown) {
      console.error('Failed to send CGC verification link:', err);
      let errorMsg = 'Failed to send verification email. Please try again.';

      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code;
        if (code === 'auth/invalid-email') {
          errorMsg = 'Invalid email address format.';
        } else if (code === 'auth/missing-continue-uri') {
          errorMsg = 'Missing return URL in verification request.';
        } else if (code === 'auth/unauthorized-continue-uri') {
          errorMsg = 'Domain not authorized for verification links in Firebase Console.';
        }
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Checks whether the current URL contains a Firebase Email Link for CGC verification
   */
  public isIncomingVerificationLink(): boolean {
    return isSignInWithEmailLink(auth, window.location.href);
  }

  /**
   * Completes the credential linking process safely.
   * STRICT SAFETY RULE: NEVER calls signInWithEmailLink, preventing any accidental
   * creation of an orphan or duplicate Firebase account.
   */
  public async completeVerification(manualEmail?: string): Promise<VerificationResult> {
    const url = window.location.href;

    if (!isSignInWithEmailLink(auth, url)) {
      return { success: false, error: 'No active email verification link detected in the URL.' };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      return {
        success: false,
        code: 'NEED_LOGIN',
        error: 'Please sign in with your primary Google account first to complete college email verification.',
      };
    }

    const storedUid = localStorage.getItem(STORAGE_UID_KEY);
    if (storedUid && storedUid !== currentUser.uid) {
      return {
        success: false,
        code: 'WRONG_ACCOUNT',
        error: 'The currently signed-in Google account does not match the account that requested verification.',
      };
    }

    const targetEmail = (manualEmail || localStorage.getItem(STORAGE_EMAIL_KEY) || '').trim().toLowerCase();

    if (!targetEmail) {
      return {
        success: false,
        code: 'EMAIL_REQUIRED',
        error: 'Please confirm your @cgcjhanjeri.in email to finish linking.',
      };
    }

    if (!this.validateCgcEmail(targetEmail)) {
      return {
        success: false,
        error: 'The provided email is not a valid @cgcjhanjeri.in address.',
      };
    }

    try {
      // Build genuine Firebase Email Link credential
      const credential = EmailAuthProvider.credentialWithLink(targetEmail, url);

      // Attach credential to the existing user session without modifying UID or Google login
      await linkWithCredential(currentUser, credential);

      // Clean up localStorage intent markers
      localStorage.removeItem(STORAGE_EMAIL_KEY);
      localStorage.removeItem(STORAGE_UID_KEY);
      localStorage.removeItem(STORAGE_TIME_KEY);
      localStorage.removeItem(STORAGE_SKIPPED_KEY);

      // Clean up URL parameters without full page reload
      window.history.replaceState({}, document.title, window.location.pathname);

      return { success: true, linkedEmail: targetEmail };
    } catch (err: unknown) {
      console.error('Failed to link CGC email credential:', err);
      let errorMsg = 'Failed to complete email linking.';
      let code: VerificationResult['code'] = 'UNKNOWN';

      if (err && typeof err === 'object' && 'code' in err) {
        const errCode = (err as { code: string }).code;
        if (errCode === 'auth/credential-already-in-use' || errCode === 'auth/email-already-in-use') {
          errorMsg = 'This @cgcjhanjeri.in email is already linked to another student account.';
          code = 'COLLISION';
        } else if (errCode === 'auth/invalid-action-code') {
          errorMsg = 'This verification link is invalid, expired, or has already been used.';
          code = 'EXPIRED';
        } else if (errCode === 'auth/expired-action-code') {
          errorMsg = 'This verification link has expired. Please request a new link.';
          code = 'EXPIRED';
        } else if (errCode === 'auth/provider-already-linked') {
          errorMsg = 'A college email provider is already linked to this account.';
          return { success: true, linkedEmail: targetEmail };
        }
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      return { success: false, error: errorMsg, code };
    }
  }

  /**
   * Inspects the authenticated user to verify if they have a linked @cgcjhanjeri.in email
   * Reads from trusted Firebase Auth providerData and user email
   */
  public getVerificationState(user: User | null): { isVerified: boolean; collegeEmail: string | null } {
    if (!user) {
      return { isVerified: false, collegeEmail: null };
    }

    // 1. Check providerData for linked email credential
    if (user.providerData && user.providerData.length > 0) {
      const cgcProvider = user.providerData.find(
        (p) => p.email && p.email.toLowerCase().endsWith(CGC_DOMAIN)
      );
      if (cgcProvider && cgcProvider.email) {
        return { isVerified: true, collegeEmail: cgcProvider.email };
      }
    }

    // 2. Check if primary email is a verified CGC address
    if (user.email && user.email.toLowerCase().endsWith(CGC_DOMAIN) && user.emailVerified) {
      return { isVerified: true, collegeEmail: user.email };
    }

    return { isVerified: false, collegeEmail: null };
  }

  /**
   * Dismissal / "Skip for Now" persistence
   */
  public isDismissedByUser(): boolean {
    return localStorage.getItem(STORAGE_SKIPPED_KEY) === 'true';
  }

  public setDismissedByUser(dismissed: boolean): void {
    if (dismissed) {
      localStorage.setItem(STORAGE_SKIPPED_KEY, 'true');
    } else {
      localStorage.removeItem(STORAGE_SKIPPED_KEY);
    }
  }

  public getPendingEmail(): string | null {
    return localStorage.getItem(STORAGE_EMAIL_KEY);
  }
}

export const collegeVerificationService = new CollegeVerificationService();
