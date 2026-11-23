#!/usr/bin/env node
/**
 * Out-of-band administrator custom claim provisioning script for VibeMatch.
 *
 * Security notes:
 * - Runs strictly outside the frontend via Firebase Admin SDK and Application Default Credentials (ADC).
 * - Never embeds, commits, or accepts inline service-account private keys in the repository.
 * - Preserves any existing custom claims on the target user record.
 *
 * Prerequisites:
 *   1. Install functions dependencies: `npm --prefix functions ci`
 *   2. Authenticate ADC locally (`gcloud auth application-default login` or set `GOOGLE_APPLICATION_CREDENTIALS`
 *      pointing to a local non-committed credential file outside this repo).
 *
 * Usage:
 *   npm --prefix functions run set-admin-claim -- --uid <FIREBASE_UID>
 *   npm --prefix functions run set-admin-claim -- --email <USER_EMAIL>
 *   npm --prefix functions run set-admin-claim -- --uid <FIREBASE_UID> --revoke
 *   npm --prefix functions run set-admin-claim -- --uid <FIREBASE_UID> --dry-run
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const TARGET_PROJECT_ID = 'vibematchcgc';

function parseArgs(argv) {
  const args = {
    uid: null,
    email: null,
    revoke: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--uid' && argv[i + 1]) {
      args.uid = argv[++i].trim();
    } else if (arg === '--email' && argv[i + 1]) {
      args.email = argv[++i].trim().toLowerCase();
    } else if (arg === '--revoke') {
      args.revoke = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(`VibeMatch Admin Custom Claim Provisioning (${TARGET_PROJECT_ID})

Usage:
  node scripts/setAdminClaim.mjs --uid <FIREBASE_UID> [--revoke] [--dry-run]
  node scripts/setAdminClaim.mjs --email <USER_EMAIL> [--revoke] [--dry-run]

Authentication:
  Uses Application Default Credentials (ADC) for project "${TARGET_PROJECT_ID}".
  Authenticate beforehand via \`gcloud auth application-default login\`
  or export \`GOOGLE_APPLICATION_CREDENTIALS\` to a local credential file outside git.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if ((!args.uid && !args.email) || (args.uid && args.email)) {
    printUsage();
    throw new Error('Specify exactly one of --uid <FIREBASE_UID> or --email <USER_EMAIL>.');
  }

  initializeApp({
    credential: applicationDefault(),
    projectId: TARGET_PROJECT_ID,
  });

  const auth = getAuth();
  const user = args.uid
    ? await auth.getUser(args.uid)
    : await auth.getUserByEmail(args.email);

  const existingClaims = { ...(user.customClaims || {}) };
  let nextClaims;
  if (args.revoke) {
    const { admin: _removed, ...rest } = existingClaims;
    nextClaims = rest;
  } else {
    nextClaims = { ...existingClaims, admin: true };
  }

  console.log('Target user:', {
    uid: user.uid,
    email: user.email || null,
    existingClaims,
    nextClaims,
    dryRun: args.dryRun,
  });

  if (args.dryRun) {
    console.log('[DRY RUN] No custom claims modified.');
    return;
  }

  await auth.setCustomUserClaims(user.uid, nextClaims);
  const updatedUser = await auth.getUser(user.uid);

  console.log(
    args.revoke
      ? `Revoked admin claim for uid=${updatedUser.uid}.`
      : `Granted admin: true claim for uid=${updatedUser.uid}.`
  );
  console.log('Verified customClaims:', updatedUser.customClaims || {});
  console.log(
    'Note: The user must sign out and sign back in (or call getIdToken(true)) for the updated claim to take effect.'
  );
}

main().catch((err) => {
  console.error('Admin claim provisioning failed:', err?.message || err);
  process.exitCode = 1;
});
