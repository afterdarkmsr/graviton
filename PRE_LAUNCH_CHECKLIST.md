# VibeMatch Pre-Launch Checklist (Spark Launch Mode)

Target Firebase Project: `vibematchcgc`  
Target Named Firestore Database: `ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9`

---

## 1. Firebase Plan & Launch Mode Flag
- [ ] Confirm Firebase project `vibematchcgc` plan status in Firebase Console:
  - **Spark (No-Cost) Launch Mode (Default):** Keep `VITE_ENABLE_FEEDBACK_FUNCTIONS=false` (or unset, since the flag defaults to `false`). Cloud Functions in `functions/` are **not** deployed on Spark; peer ratings, reputation displays, automatic reputation-based suspensions, and suspension appeals remain safely disabled in the UI without invoking missing callable endpoints.
  - **Future Blaze Upgrade Path:** Only set `VITE_ENABLE_FEEDBACK_FUNCTIONS=true` after upgrading `vibematchcgc` to the Blaze plan and deploying `functions/`.

## 2. Named Firestore Database Edition & Quota Eligibility
- [ ] In Google Cloud / Firebase Console (`vibematchcgc` -> Firestore), verify database `ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9` is healthy, active, and understand its **edition (Standard vs Enterprise)** and **Spark free-tier quota eligibility**.
  - Do **not** switch or migrate to `(default)` unless intentionally planned and data is migrated cleanly.
  - Note: Spark free-tier daily read/write/delete quotas apply per project/database rules; monitor early traffic in Firebase Usage & Quotas.

## 3. Firebase Authentication Providers
- [ ] Open Firebase Console -> **Authentication -> Sign-in method** for `vibematchcgc`:
  - [ ] Ensure **Google** sign-in provider is **Enabled** with a valid project support email.
  - [ ] Ensure **Email/Password** is **Enabled** AND **Email link (passwordless sign-in)** is **Enabled** (required for optional self-service `@cgcjhanjeri.in` email linking via `sendSignInLinkToEmail` / `linkWithCredential`).
- [ ] Note: Currently any Google account can sign in. Optional `@cgcjhanjeri.in` email linking does not enforce CGC-only access until server-side Auth blocking / domain enforcement is added.

## 4. Firebase Auth Authorized Domains
- [ ] Open Firebase Console -> **Authentication -> Settings -> Authorized domains** and verify all live origins are listed:
  - [ ] `vibematchcgc.web.app`
  - [ ] `vibematchcgc.firebaseapp.com`
  - [ ] Any custom domain or preview hosting origin used by testers/students.

## 5. Firestore Rules & Composite Indexes Deployment
- [ ] Confirm local config files still target the intended project and named DB:
  - `.firebaserc` -> `"default": "vibematchcgc"`
  - `firebase.json` -> Firestore entry with `"database": "ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9"`, `"rules": "firestore.rules"`, `"indexes": "firestore.indexes.json"`
- [ ] Verify automated security tests pass on CI (`.github/workflows/firestore-rules-tests.yml` — all 36 Firestore Emulator rules tests).
- [ ] Deploy rules and composite indexes to the named database when ready to publish:
  ```bash
  firebase deploy --only firestore --project vibematchcgc
  ```
- [ ] Wait until all composite indexes finish building (`Enabled`) in Firebase Console before announcing launch.

## 6. Out-of-Band Admin Custom Claim Provisioning
- [ ] Install Functions dependencies in a trusted admin shell:
  ```bash
  npm --prefix functions ci
  ```
- [ ] Authenticate with Application Default Credentials (never commit service-account JSON keys to the repository):
  ```bash
  gcloud auth application-default login
  ```
- [ ] Grant `admin: true` to designated campus moderator account(s):
  ```bash
  npm --prefix functions run set-admin-claim -- --uid <MODERATOR_FIREBASE_UID>
  ```
- [ ] Have each moderator sign out and sign back in so the updated ID token claim (`admin === true`) takes effect.
- [ ] Verify the moderator can open **Safety Reports & Moderation Queue** and triage `/reports` documents (`open` -> `reviewed` / `dismissed`).

## 7. Hosting Build & Deploy
- [ ] Verify production environment has `VITE_ENABLE_FEEDBACK_FUNCTIONS=false` (or unset) for Spark mode.
- [ ] Run clean production build and verify zero TypeScript/bundler errors:
  ```bash
  npm ci
  npx tsc --noEmit
  npm run build
  ```
- [ ] Deploy static bundle to Firebase Hosting when ready:
  ```bash
  firebase deploy --only hosting --project vibematchcgc
  ```

## 8. Post-Deploy Smoke Checks (Spark Mode)
- [ ] Sign in with Google on the live URL -> complete onboarding -> confirm Discover, Who's Free, Create Squad, Join/Leave, Squad Chat, and 1-on-1 Chat all work against the named database.
- [ ] Submit a test Safety Report on a test activity -> confirm an admin user sees it in the **Safety Reports** tab and can mark it `reviewed` or `dismissed`.
- [ ] Confirm **no** calls to missing Cloud Functions (`submitFeedback`, `getSubmittedFeedbackForActivity`, `submitSuspensionAppeal`, `reviewSuspensionAppeal`, `listPendingSuspensionAppeals`) appear in browser DevTools Network tab.
- [ ] Test optional `@cgcjhanjeri.in` email linking both in the same browser and by pasting the emailed link into a second browser/incognito window (while signed in with Google) to verify the email confirmation prompt links cleanly without creating a duplicate UID.
