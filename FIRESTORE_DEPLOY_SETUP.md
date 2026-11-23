# VibeMatch V1 — Firestore Rules & Indexes Deployment Setup Guide

This guide configures `.github/workflows/deploy-firestore.yml` to deploy **only** Cloud Firestore security rules (`firestore.rules`) and indexes (`firestore.indexes.json`) to the named production database using **GitHub Actions Workload Identity Federation (WIF)** — with **zero service account JSON keys** and a mandatory manual approval gate.

- **Firebase / Google Cloud Project ID:** `vibematchcgc`
- **Target Named Firestore Database ID:** `ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9`
- **Workflow Trigger:** Manual (`workflow_dispatch`) only — never runs automatically on `push`
- **Scope:** `firestore:rules` and `firestore:indexes` only (never deploys Cloud Functions or Hosting)

---

## 1. Prerequisites

Run the Google Cloud setup commands below from a workstation or Google Cloud Shell authenticated as a user with **Owner** or **IAM Admin + Workload Identity Pool Admin** on `vibematchcgc`.

Set shell variables first (replace `<GITHUB_OWNER>` and `<GITHUB_REPO>` with your exact GitHub repository owner and name):

```bash
export PROJECT_ID="vibematchcgc"
export PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
export GITHUB_OWNER="<GITHUB_OWNER>"
export GITHUB_REPO="<GITHUB_REPO>"
export SA_NAME="firestore-deployer"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export WIF_POOL="github-actions-pool"
export WIF_PROVIDER="vibematch-github"

echo "PROJECT_NUMBER=${PROJECT_NUMBER}"
echo "SA_EMAIL=${SA_EMAIL}"
```

---

## 2. Enable Required Google Cloud APIs

These APIs are required for OIDC token exchange and Firestore rules/index deployment (enabling IAM/STS/Rules APIs does not require changing billing):

```bash
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  serviceusage.googleapis.com \
  firebase.googleapis.com \
  firebaserules.googleapis.com \
  firestore.googleapis.com \
  --project="${PROJECT_ID}"
```

---

## 3. Create Dedicated Least-Privilege Service Account

Create a dedicated service account strictly for Firestore rules & indexes deployment (do **not** generate any JSON key file):

```bash
gcloud iam service-accounts create "${SA_NAME}" \
  --project="${PROJECT_ID}" \
  --display-name="VibeMatch Firestore Rules & Indexes Deployer" \
  --description="Least-privilege GitHub Actions WIF deployer for Firestore rules and indexes only."
```

### Grant Least-Privilege IAM Roles on `vibematchcgc`

| IAM Role | Purpose |
| :--- | :--- |
| `roles/firebaserules.admin` | Compile and deploy `firestore.rules` to the named Firestore database |
| `roles/datastore.indexAdmin` | Manage and deploy composite indexes from `firestore.indexes.json` |
| `roles/firebase.viewer` | Read Firebase project metadata during `firebase deploy` initialization |
| `roles/serviceusage.serviceUsageConsumer` | Invoke enabled Google Cloud APIs (`firebaserules`, `firestore`, `firebase`) |
| `roles/firebaseextensions.viewer` *(recommended)* | Read-only check (`firebaseextensions.instances.list`) performed by recent `firebase-tools` releases during deploy startup; prevents spurious `403` errors |

Apply the bindings:

```bash
for ROLE in \
  "roles/firebaserules.admin" \
  "roles/datastore.indexAdmin" \
  "roles/firebase.viewer" \
  "roles/serviceusage.serviceUsageConsumer" \
  "roles/firebaseextensions.viewer"
do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}"
done
```

> **What this service account CANNOT do:** It has no `roles/owner`, `roles/editor`, `roles/firebase.admin`, `roles/datastore.user`, `roles/cloudfunctions.*`, or `roles/firebasehosting.*`. It cannot read/modify/delete student documents, cannot deploy Cloud Functions, and cannot deploy Hosting.

---

## 4. Configure Google Cloud Workload Identity Federation (WIF)

### 4.1 Create the Workload Identity Pool

```bash
gcloud iam workload-identity-pools create "${WIF_POOL}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

### 4.2 Create the GitHub OIDC Provider (Locked to Repo + `production` Environment)

Restricting `--attribute-condition` to both your exact repository **and** the `production` GitHub Environment ensures no pull request, fork, or unapproved workflow job can ever impersonate the service account:

```bash
gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${WIF_POOL}" \
  --display-name="VibeMatch GitHub Actions OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.environment=assertion.environment,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GITHUB_OWNER}/${GITHUB_REPO}' && assertion.environment == 'production'"
```

### 4.3 Bind the GitHub Repository to the Deployment Service Account

```bash
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"
```

### 4.4 Retrieve the Exact Provider Resource Name

```bash
gcloud iam workload-identity-pools providers describe "${WIF_PROVIDER}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${WIF_POOL}" \
  --format="value(name)"
```

It will look like:
`projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-actions-pool/providers/vibematch-github`

---

## 5. Configure GitHub Environment, Variables, and Secrets

### 5.1 Create the `production` GitHub Environment with Manual Approval

1. Open your GitHub repository → **Settings** → **Environments**.
2. Click **New environment** and name it exactly **`production`**.
3. Under **Deployment protection rules**:
   - Enable **Required reviewers** and add the repository maintainer(s) who must manually approve every Firestore production deployment.
   - *(Recommended)* Under **Deployment branches and tags**, restrict deployments to **Selected branches** → `main` (or your release branch) so feature branches cannot deploy to production.
4. Click **Save protection rules**.

### 5.2 GitHub Variables Required (in Environment `production`)

Add the following under **Settings → Environments → `production` → Environment variables** (or **Repository variables** if shared across environments):

| Variable Name | Required? | Exact Value |
| :--- | :--- | :--- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | **Required** | Output of Section 4.4 (`projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-actions-pool/providers/vibematch-github`) |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | **Required** | `firestore-deployer@vibematchcgc.iam.gserviceaccount.com` |
| `FIREBASE_PROJECT_ID` | Optional (checked if set) | `vibematchcgc` |
| `FIRESTORE_DATABASE_ID` | Optional (checked if set) | `ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9` |

### 5.3 GitHub Secrets Required

| Secret Name | Required? | Notes |
| :--- | :--- | :--- |
| *(None)* | **No secrets required** | Workload Identity Federation exchanges short-lived GitHub OIDC tokens (`id-token: write`) at runtime. **Do NOT create or store `GOOGLE_APPLICATION_CREDENTIALS` JSON keys or `FIREBASE_TOKEN` secrets.** |

---

## 6. How to Run a Manual Deployment

1. In GitHub, open the **Actions** tab.
2. Select **Deploy Firestore Rules & Indexes (V1 Production)** (`.github/workflows/deploy-firestore.yml`).
3. Click **Run workflow** on the target release branch (`main`).
4. **Job 1 (`Verify Config & Firestore Rules Security Suite`)** runs automatically:
   - Verifies `.firebaserc` targets `vibematchcgc` and `firebase.json` targets only `ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9` (never `(default)`).
   - Runs Frontend, Cloud Functions, and test script TypeScript checks.
   - Runs the 24 security-hardening tests.
   - Runs all 36 Firestore Emulator security rules tests locally against `demo-vibematch-test`.
   - If **any** check or test fails, the workflow stops immediately and never reaches deployment.
5. Once Job 1 succeeds, **Job 2 (`Deploy Firestore Rules & Indexes to vibematchcgc`)** pauses waiting for **manual approval** from a required reviewer on the `production` environment.
6. After approval, Job 2 authenticates via Workload Identity Federation and runs:
   - `firebase deploy --project vibematchcgc --only firestore:rules --non-interactive`
   - `firebase deploy --project vibematchcgc --only firestore:indexes --non-interactive`

---

## 7. Firestore Enterprise Edition Compatibility Notes (Read Before First Run)

The named database `ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9` is configured as a **Firestore Enterprise edition** named database (preserved unchanged in `firebase.json`). Keep these verified compatibility behaviors in mind:

1. **Security Rules (`firestore:rules`) — Supported, Deployed First:**
   - Cloud Firestore Security Rules (`rules_version = '2'`) are supported on Firestore Enterprise edition (Native/Core operations) and target the named database configured in `firebase.json`.
   - The workflow deploys `firestore:rules` **before** `firestore:indexes` so security hardening takes effect cleanly and any Enterprise index schema issue is clearly isolated in logs.
2. **Composite Indexes (`firestore.indexes.json`) — Potential Enterprise Schema Drift / Rejections:**
   - The existing `firestore.indexes.json` defines 6 composite indexes using classic Standard-edition fields (`queryScope: "COLLECTION"`, `arrayConfig: "CONTAINS"`, `order: "ASCENDING"/"DESCENDING"`, and `"fieldOverrides": []`) without Enterprise-specific `apiScope`, `density` (`DENSE` / `SPARSE_ANY` / `SPARSE_ALL`), or `multikey` attributes.
   - Depending on the live Enterprise database's compatibility mode and Firestore Admin API validation, `firebase deploy --only firestore:indexes` may:
     - Accept the definitions with default Enterprise settings, **or**
     - Report schema/density/multikey validation errors (for example on `arrayConfig: "CONTAINS"` or missing `apiScope`/`density` attributes) and exit non-zero.
   - The workflow intentionally omits `--force` so existing server-side indexes are **never** silently deleted. If `Deploy Firestore indexes` fails with a schema error, inspect the exact Firestore Admin API message and export the live Enterprise index schema via `firebase firestore:indexes --project vibematchcgc --database ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9` before updating `firestore.indexes.json`.
3. **Optional Single-Field Indexing on Enterprise Edition:**
   - Unlike Firestore Standard edition, Firestore Enterprise edition does **not** auto-create single-field indexes for every field; unindexed queries (such as `orderBy('createdAt', 'desc')` on `/reports`, `where('isActive', '==', true)` on `/availabilityBroadcasts`, or `orderBy('timestamp', 'asc')` on `/activities/{id}/messages`) fall back to collection scans instead of failing with a missing-index error.
   - On early V1 campus scale this works functionally, but you should monitor read-unit usage in Google Cloud Console and add explicit indexes if collection sizes grow.
4. **Emulator vs. Enterprise Parity:**
   - The local Firestore Emulator validates `firestore.rules` authorization logic using Standard Firestore emulator semantics; it does **not** emulate Enterprise-specific query planner or Enterprise index API validation.
5. **Spark vs. Enterprise Free Tier & CLI API Access:**
   - Configuring Workload Identity Federation and deploying rules/indexes does not require enabling Blaze billing by itself, **provided** the existing named database on `vibematchcgc` remains active and accessible under your current Firebase plan/quota. If Google Cloud rejects `firestore:indexes` or `firestore:rules` API calls with a plan/edition error on `vibematchcgc`, capture the exact CLI error rather than migrating or recreating the database.
