import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Production named database ID requirement
export const EXPECTED_FIRESTORE_DATABASE_ID = 'ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9';
export const FIRESTORE_DATABASE_ID =
  firebaseConfig.firestoreDatabaseId || EXPECTED_FIRESTORE_DATABASE_ID;

if (!FIRESTORE_DATABASE_ID || FIRESTORE_DATABASE_ID.trim() === '' || FIRESTORE_DATABASE_ID === '(default)') {
  throw new Error(
    `[VibeMatch Security Error] Invalid Firestore configuration: Explicit named database ID '${EXPECTED_FIRESTORE_DATABASE_ID}' is required. Silent fallback to (default) is strictly prohibited.`
  );
}

// Initialize Firestore with experimentalForceLongPolling to prevent 10s WebSocket timeouts in preview/proxy environments,
// strictly bound to the verified named database ID without silent fallback
let firestoreDb;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    FIRESTORE_DATABASE_ID
  );
} catch {
  firestoreDb = getFirestore(app, FIRESTORE_DATABASE_ID);
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const functions: Functions = getFunctions(app, 'us-central1');


// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Operation Types for error context
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Standard Firestore error handler conforming to skill requirements
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

