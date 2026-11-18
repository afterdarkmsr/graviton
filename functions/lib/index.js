"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPendingSuspensionAppeals = exports.reviewSuspensionAppeal = exports.submitSuspensionAppeal = exports.getSubmittedFeedbackForActivity = exports.submitFeedback = exports.FEEDBACK_TAGS = exports.EXPECTED_DATABASE_ID = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp();
}
// Production named database ID requirement
exports.EXPECTED_DATABASE_ID = "ai-studio-vibematch-09820417-4ebc-451c-a187-a205e2662ff9";
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || exports.EXPECTED_DATABASE_ID;
if (!DATABASE_ID || DATABASE_ID.trim() === "" || DATABASE_ID === "(default)") {
    throw new Error(`[VibeMatch Security Error] Cloud Functions initialization failed: Named production database ID '${exports.EXPECTED_DATABASE_ID}' is required. Silent fallback to (default) is strictly prohibited.`);
}
// Initialize Firestore strictly bound to the verified named database ID without silent fallback
const db = (0, firestore_1.getFirestore)(DATABASE_ID);
// Allowed feedback tags whitelist
exports.FEEDBACK_TAGS = [
    "Friendly",
    "Punctual",
    "Cooperative",
    "Good Communicator",
    "Unfriendly",
    "Not Cooperative",
];
const isValidId = (id) => typeof id === "string" && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
/**
 * Callable Cloud Function: submitFeedback
 * Performs strict server-side validation, verifies genuine participant status on completed activities,
 * stores feedback privately in /feedbackPrivate, recalculates sanitized public reputation in /userReputations,
 * tracks unique 1-star rater UIDs in /userModeration, and triggers automatic 15-day suspensions atomically.
 */
exports.submitFeedback = (0, https_1.onCall)({ cors: true }, async (request) => {
    // 1. Authenticate caller
    if (!request.auth || !request.auth.uid) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required: You must be signed in to submit feedback.");
    }
    const raterId = request.auth.uid;
    const data = request.data || {};
    // 2. Strict ID validation
    if (!isValidId(data.activityId)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid or missing activityId.");
    }
    if (!isValidId(data.targetUserId)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid or missing targetUserId.");
    }
    // 3. Reject self-rating
    if (raterId === data.targetUserId) {
        throw new https_1.HttpsError("invalid-argument", "Self-rating not allowed: Participants cannot rate themselves.");
    }
    // 4. Strict integer rating check (1-5 stars, NO Math.floor)
    if (typeof data.rating !== "number" ||
        !Number.isInteger(data.rating) ||
        data.rating < 1 ||
        data.rating > 5) {
        throw new https_1.HttpsError("invalid-argument", "Rating must be an actual integer between 1 and 5 stars. Decimals and out-of-range values are strictly prohibited.");
    }
    const rating = data.rating;
    // 5. Validate tags against whitelist
    let validatedTags = [];
    if (data.tags !== undefined && data.tags !== null) {
        if (!Array.isArray(data.tags)) {
            throw new https_1.HttpsError("invalid-argument", "Tags must be provided as an array of strings.");
        }
        if (data.tags.length > exports.FEEDBACK_TAGS.length) {
            throw new https_1.HttpsError("invalid-argument", `A maximum of ${exports.FEEDBACK_TAGS.length} tags may be selected.`);
        }
        for (const tag of data.tags) {
            if (typeof tag !== "string" || !exports.FEEDBACK_TAGS.includes(tag)) {
                throw new https_1.HttpsError("invalid-argument", `Invalid feedback tag: '${String(tag)}'. Must be in the authorized whitelist.`);
            }
        }
        validatedTags = Array.from(new Set(data.tags));
    }
    // 6. Validate optional comment (max 500 characters)
    let sanitizedComment = null;
    if (data.comment !== undefined && data.comment !== null) {
        if (typeof data.comment !== "string") {
            throw new https_1.HttpsError("invalid-argument", "Comment must be a text string.");
        }
        const trimmed = data.comment.trim();
        if (trimmed.length > 500) {
            throw new https_1.HttpsError("invalid-argument", "Feedback comment cannot exceed 500 characters.");
        }
        if (trimmed.length > 0) {
            sanitizedComment = trimmed;
        }
    }
    // Deterministic feedback doc ID enforces one rating per rater per target per activity
    const feedbackDocId = `${data.activityId}_${raterId}_${data.targetUserId}`;
    const activityRef = db.collection("activities").doc(data.activityId);
    const feedbackPrivateRef = db.collection("feedbackPrivate").doc(feedbackDocId);
    const legacyFeedbackRef = db.collection("feedback").doc(feedbackDocId);
    const reputationRef = db.collection("userReputations").doc(data.targetUserId);
    const moderationRef = db.collection("userModeration").doc(data.targetUserId);
    const targetUserRef = db.collection("users").doc(data.targetUserId);
    const targetPublicRef = db.collection("publicProfiles").doc(data.targetUserId);
    const raterUserRef = db.collection("users").doc(raterId);
    const now = new Date();
    const nowTimestamp = firestore_1.Timestamp.fromDate(now);
    const nowISO = now.toISOString();
    // 7. Atomic transaction for data integrity
    return await db.runTransaction(async (transaction) => {
        // Step A: Read Activity
        const activitySnap = await transaction.get(activityRef);
        if (!activitySnap.exists) {
            throw new https_1.HttpsError("not-found", "The specified activity was not found.");
        }
        const activityData = activitySnap.data() || {};
        // Reject non-completed activities
        if (activityData.status === "cancelled") {
            throw new https_1.HttpsError("failed-precondition", "Feedback is not allowed for cancelled activities.");
        }
        if (activityData.status !== "completed") {
            throw new https_1.HttpsError("failed-precondition", "Feedback becomes available only after an activity is marked as completed.");
        }
        const participantIds = Array.isArray(activityData.participantIds)
            ? activityData.participantIds
            : [activityData.createdBy || ""];
        // Verify both rater and target are genuine members
        if (!participantIds.includes(raterId)) {
            throw new https_1.HttpsError("permission-denied", "Only verified participants of this activity can submit feedback.");
        }
        if (!participantIds.includes(data.targetUserId)) {
            throw new https_1.HttpsError("invalid-argument", "The target user is not a verified participant of this activity.");
        }
        // Authoritative activity details (never trust client)
        const authoritativeActivityTitle = typeof activityData.title === "string" && activityData.title.trim()
            ? activityData.title.trim()
            : "Campus Squad Activity";
        const isOneToOne = !!activityData.isOneToOne;
        // Step B: Deduplication check
        const privateFeedbackSnap = await transaction.get(feedbackPrivateRef);
        if (privateFeedbackSnap.exists) {
            throw new https_1.HttpsError("already-exists", "Duplicate submission: You have already submitted feedback for this participant in this activity.");
        }
        // Also check legacy feedback doc for backward compatibility
        const legacyFeedbackSnap = await transaction.get(legacyFeedbackRef);
        if (legacyFeedbackSnap.exists) {
            throw new https_1.HttpsError("already-exists", "Duplicate submission: You have already submitted feedback for this participant in this activity.");
        }
        // Step C: Authoritative Identity Resolution
        let authoritativeTargetName = "Campus Student";
        const targetUserSnap = await transaction.get(targetUserRef);
        if (targetUserSnap.exists && targetUserSnap.data()?.name) {
            authoritativeTargetName = targetUserSnap.data().name;
        }
        else {
            const targetPublicSnap = await transaction.get(targetPublicRef);
            if (targetPublicSnap.exists && targetPublicSnap.data()?.displayName) {
                authoritativeTargetName = targetPublicSnap.data().displayName;
            }
        }
        let authoritativeRaterName = request.auth?.token.name || "Campus Student";
        const raterUserSnap = await transaction.get(raterUserRef);
        if (raterUserSnap.exists && raterUserSnap.data()?.name) {
            authoritativeRaterName = raterUserSnap.data().name;
        }
        // Step D: Read Public User Reputation
        const repSnap = await transaction.get(reputationRef);
        const repData = repSnap.exists ? repSnap.data() || {} : {};
        const currentTotal = Number(repData.totalRatings) || 0;
        const currentSum = Number(repData.ratingSum) || 0;
        const currentStarDist = {
            1: Number(repData.starDistribution?.[1]) || 0,
            2: Number(repData.starDistribution?.[2]) || 0,
            3: Number(repData.starDistribution?.[3]) || 0,
            4: Number(repData.starDistribution?.[4]) || 0,
            5: Number(repData.starDistribution?.[5]) || 0,
        };
        const currentTagCounts = {
            Friendly: Number(repData.tagCounts?.Friendly) || 0,
            Punctual: Number(repData.tagCounts?.Punctual) || 0,
            Cooperative: Number(repData.tagCounts?.Cooperative) || 0,
            "Good Communicator": Number(repData.tagCounts?.["Good Communicator"]) || 0,
            Unfriendly: Number(repData.tagCounts?.Unfriendly) || 0,
            "Not Cooperative": Number(repData.tagCounts?.["Not Cooperative"]) || 0,
        };
        // Step E: Read Private User Moderation Data
        const modSnap = await transaction.get(moderationRef);
        const modData = modSnap.exists ? modSnap.data() || {} : {};
        // Migrate distinct 1-star raters from legacy reputation if not yet in userModeration
        const currentDistinct1Star = Array.isArray(modData.distinctOneStarRaters)
            ? [...modData.distinctOneStarRaters]
            : Array.isArray(repData.distinctOneStarRaters)
                ? [...repData.distinctOneStarRaters]
                : [];
        let isCurrentlySuspended = !!(modData.isSuspended ?? repData.isSuspended);
        let suspensionStartedAt = modData.suspensionStartedAt ?? repData.suspensionStartedAt ?? null;
        let suspensionExpiresAt = modData.suspensionExpiresAt ?? repData.suspensionExpiresAt ?? null;
        let suspensionReason = modData.suspensionReason ?? repData.suspensionReason ?? null;
        // Handle natural expiry of past suspension
        if (isCurrentlySuspended && suspensionExpiresAt) {
            const expiryMs = typeof suspensionExpiresAt.toMillis === "function"
                ? suspensionExpiresAt.toMillis()
                : new Date(suspensionExpiresAt).getTime();
            if (expiryMs <= now.getTime()) {
                isCurrentlySuspended = false;
            }
        }
        // Step F: Compute Distinct One-Star Suspension Logic
        let updatedDistinct1Star = [...currentDistinct1Star];
        let shouldTriggerSuspension = false;
        if (rating === 1) {
            const isAlreadyCounted = updatedDistinct1Star.includes(raterId);
            if (!isAlreadyCounted) {
                // Genuinely NEW distinct rater
                updatedDistinct1Star.push(raterId);
                // Suspension triggers only when distinct count reaches 5 or more and user is not already actively suspended
                if (updatedDistinct1Star.length >= 5 && !isCurrentlySuspended) {
                    shouldTriggerSuspension = true;
                    isCurrentlySuspended = true;
                    suspensionStartedAt = nowTimestamp;
                    const expiryDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
                    suspensionExpiresAt = firestore_1.Timestamp.fromDate(expiryDate);
                    suspensionReason =
                        "Automatic 15-day temporary suspension: Received 5 distinct 1-star ratings across campus activities.";
                }
            }
        }
        // Step G: Compute Public Reputation Aggregates
        const newTotal = currentTotal + 1;
        const newSum = currentSum + rating;
        const newAverage = Math.round((newSum / newTotal) * 10) / 10;
        const newStarDist = {
            ...currentStarDist,
            [rating]: (currentStarDist[rating] || 0) + 1,
        };
        const newTagCounts = { ...currentTagCounts };
        validatedTags.forEach((tag) => {
            newTagCounts[tag] = (newTagCounts[tag] || 0) + 1;
        });
        // Step H: Write Private Feedback Document (/feedbackPrivate)
        const privateFeedbackDoc = {
            id: feedbackDocId,
            activityId: data.activityId,
            activityTitle: authoritativeActivityTitle,
            isOneToOne,
            raterId,
            raterName: authoritativeRaterName,
            targetUserId: data.targetUserId,
            targetUserName: authoritativeTargetName,
            rating,
            tags: validatedTags,
            comment: sanitizedComment,
            createdAt: nowTimestamp,
            createdAtISO: nowISO,
        };
        transaction.set(feedbackPrivateRef, privateFeedbackDoc);
        // Step I: Write Sanitized Public User Reputation (/userReputations)
        // Strictly public fields only: NO reviewer UIDs, NO distinctOneStarRaters, NO moderation evidence
        const publicReputationDoc = {
            userId: data.targetUserId,
            userName: authoritativeTargetName,
            averageRating: newAverage,
            totalRatings: newTotal,
            ratingSum: newSum,
            starDistribution: newStarDist,
            tagCounts: newTagCounts,
            updatedAt: nowTimestamp,
        };
        transaction.set(reputationRef, publicReputationDoc, { merge: true });
        // Step J: Write Private Moderation Record (/userModeration)
        const privateModerationDoc = {
            userId: data.targetUserId,
            userName: authoritativeTargetName,
            distinctOneStarRaters: updatedDistinct1Star,
            distinctOneStarCount: updatedDistinct1Star.length,
            isSuspended: isCurrentlySuspended,
            suspensionStartedAt,
            suspensionExpiresAt,
            suspensionReason,
            appealStatus: shouldTriggerSuspension ? "none" : (modData.appealStatus || "none"),
            appealReason: shouldTriggerSuspension ? null : (modData.appealReason || null),
            appealedAt: shouldTriggerSuspension ? null : (modData.appealedAt || null),
            updatedAt: nowTimestamp,
        };
        transaction.set(moderationRef, privateModerationDoc, { merge: true });
        // Step K: Create Suspension Event Record if Triggered
        if (shouldTriggerSuspension) {
            const suspensionId = `susp_${data.targetUserId}_${now.getTime()}`;
            const suspensionRef = db.collection("suspensions").doc(suspensionId);
            transaction.set(suspensionRef, {
                id: suspensionId,
                userId: data.targetUserId,
                userName: authoritativeTargetName,
                reason: suspensionReason,
                startedAt: suspensionStartedAt,
                expiresAt: suspensionExpiresAt,
                triggeringRatingRefs: [feedbackDocId],
                status: "active",
                createdAt: nowTimestamp,
            });
        }
        return {
            success: true,
            feedback: {
                id: feedbackDocId,
                activityId: data.activityId,
                activityTitle: authoritativeActivityTitle,
                isOneToOne,
                raterId,
                raterName: authoritativeRaterName,
                targetUserId: data.targetUserId,
                targetUserName: authoritativeTargetName,
                rating,
                tags: validatedTags,
                comment: sanitizedComment || undefined,
                createdAt: nowISO,
            },
            reputation: {
                averageRating: newAverage,
                totalRatings: newTotal,
            },
        };
    });
});
/**
 * Callable Cloud Function: getSubmittedFeedbackForActivity
 * Securely retrieves feedback submitted by the authenticated caller for an activity.
 * Keeps individual feedback records in /feedbackPrivate confidential from general client reads.
 */
exports.getSubmittedFeedbackForActivity = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth || !request.auth.uid) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    const raterId = request.auth.uid;
    const activityId = request.data?.activityId;
    if (!isValidId(activityId)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid or missing activityId.");
    }
    const snap = await db
        .collection("feedbackPrivate")
        .where("activityId", "==", activityId)
        .where("raterId", "==", raterId)
        .limit(50)
        .get();
    const results = {};
    snap.docs.forEach((doc) => {
        const data = doc.data();
        let createdAtISO = new Date().toISOString();
        if (data.createdAt && typeof data.createdAt.toDate === "function") {
            createdAtISO = data.createdAt.toDate().toISOString();
        }
        else if (data.createdAtISO) {
            createdAtISO = data.createdAtISO;
        }
        results[data.targetUserId] = {
            id: doc.id,
            activityId: data.activityId,
            activityTitle: data.activityTitle,
            isOneToOne: !!data.isOneToOne,
            raterId: data.raterId,
            raterName: data.raterName,
            targetUserId: data.targetUserId,
            targetUserName: data.targetUserName,
            rating: data.rating,
            tags: data.tags || [],
            comment: data.comment || undefined,
            createdAt: createdAtISO,
        };
    });
    return results;
});
/**
 * Callable Cloud Function: submitSuspensionAppeal
 * Allows an actively suspended student to submit an appeal.
 * Prevents users from approving/rejecting their own appeals.
 */
exports.submitSuspensionAppeal = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth || !request.auth.uid) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    const userId = request.auth.uid;
    const appealReason = request.data?.appealReason;
    if (typeof appealReason !== "string" || appealReason.trim().length < 10) {
        throw new https_1.HttpsError("invalid-argument", "Please provide a constructive appeal statement (at least 10 characters).");
    }
    const trimmedReason = appealReason.trim();
    if (trimmedReason.length > 1000) {
        throw new https_1.HttpsError("invalid-argument", "Appeal statement cannot exceed 1000 characters.");
    }
    const moderationRef = db.collection("userModeration").doc(userId);
    const now = new Date();
    const nowTimestamp = firestore_1.Timestamp.fromDate(now);
    return await db.runTransaction(async (transaction) => {
        const modSnap = await transaction.get(moderationRef);
        if (!modSnap.exists) {
            throw new https_1.HttpsError("not-found", "User moderation record was not found.");
        }
        const modData = modSnap.data() || {};
        if (!modData.isSuspended) {
            throw new https_1.HttpsError("failed-precondition", "Your account is not currently suspended.");
        }
        // Check if suspension already expired
        if (modData.suspensionExpiresAt) {
            const expiryMs = typeof modData.suspensionExpiresAt.toMillis === "function"
                ? modData.suspensionExpiresAt.toMillis()
                : new Date(modData.suspensionExpiresAt).getTime();
            if (expiryMs <= now.getTime()) {
                throw new https_1.HttpsError("failed-precondition", "Your suspension has already naturally expired.");
            }
        }
        // Prevent duplicate pending appeals
        if (modData.appealStatus === "submitted") {
            throw new https_1.HttpsError("already-exists", "An appeal has already been submitted and is currently pending campus review.");
        }
        // 1. Update private moderation document
        transaction.update(moderationRef, {
            appealStatus: "submitted",
            appealReason: trimmedReason,
            appealedAt: nowTimestamp,
            updatedAt: nowTimestamp,
        });
        return {
            success: true,
            message: "Suspension appeal submitted successfully for campus review.",
        };
    });
});
/**
 * Callable Cloud Function: reviewSuspensionAppeal
 * Allows trusted campus administrators to review and decide on suspension appeals.
 * Requires Firebase Auth custom claim `request.auth.token.admin === true`.
 * Rejects ordinary users and prevents self-review.
 */
exports.reviewSuspensionAppeal = (0, https_1.onCall)({ cors: true }, async (request) => {
    // 1. Authenticate caller
    if (!request.auth || !request.auth.uid) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required.");
    }
    // 2. Strict Custom Claim Verification: request.auth.token.admin === true
    if (request.auth.token.admin !== true) {
        throw new https_1.HttpsError("permission-denied", "Unauthorized: Campus administrator privileges required.");
    }
    const adminUid = request.auth.uid;
    const data = request.data || {};
    // 3. Validate target user ID
    if (!isValidId(data.targetUserId)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid or missing targetUserId.");
    }
    // 4. Prevent administrators from reviewing their own appeal
    if (data.targetUserId === adminUid) {
        throw new https_1.HttpsError("permission-denied", "Conflict of interest: Administrators cannot review their own suspension appeal.");
    }
    // 5. Explicit decision: "accepted" or "rejected"
    if (data.decision !== "accepted" && data.decision !== "rejected") {
        throw new https_1.HttpsError("invalid-argument", "Decision must be explicitly set to 'accepted' or 'rejected'.");
    }
    let trimmedNote = null;
    if (data.moderationNote && typeof data.moderationNote === "string") {
        trimmedNote = data.moderationNote.trim().slice(0, 1000);
    }
    const moderationRef = db.collection("userModeration").doc(data.targetUserId);
    const now = new Date();
    const nowTimestamp = firestore_1.Timestamp.fromDate(now);
    return await db.runTransaction(async (transaction) => {
        const modSnap = await transaction.get(moderationRef);
        if (!modSnap.exists) {
            throw new https_1.HttpsError("not-found", "User moderation record not found.");
        }
        const modData = modSnap.data() || {};
        if (modData.appealStatus !== "submitted") {
            throw new https_1.HttpsError("failed-precondition", "No pending appeal found for this user.");
        }
        // Check whether suspension has naturally expired
        const expiryMs = modData.suspensionExpiresAt
            ? typeof modData.suspensionExpiresAt.toMillis === "function"
                ? modData.suspensionExpiresAt.toMillis()
                : new Date(modData.suspensionExpiresAt).getTime()
            : null;
        const isExpired = expiryMs !== null && now.getTime() >= expiryMs;
        // If suspension expired, it must remain inactive; otherwise keep its current status
        const isStillActive = !isExpired && !!modData.isSuspended;
        if (data.decision === "accepted") {
            // Lift the suspension
            transaction.update(moderationRef, {
                isSuspended: false,
                appealStatus: "accepted",
                appealDecision: "accepted",
                reviewedByAdmin: adminUid,
                reviewedAt: nowTimestamp,
                reviewNote: trimmedNote,
                suspensionLiftedAt: nowTimestamp,
                updatedAt: nowTimestamp,
            });
        }
        else {
            // Reject the appeal.
            // CRITICAL: Rejecting an appeal must NEVER reinstate or mark an already-expired suspension as active!
            transaction.update(moderationRef, {
                isSuspended: isStillActive,
                appealStatus: "rejected",
                appealDecision: "rejected",
                reviewedByAdmin: adminUid,
                reviewedAt: nowTimestamp,
                reviewNote: trimmedNote,
                updatedAt: nowTimestamp,
            });
        }
        return {
            success: true,
            decision: data.decision,
            targetUserId: data.targetUserId,
            reviewedAt: now.toISOString(),
        };
    });
});
/**
 * Callable Cloud Function: listPendingSuspensionAppeals
 * Securely lists all pending suspension appeals for verified campus administrators.
 * Requires Firebase Auth custom claim `request.auth.token.admin === true`.
 * Rejects unauthenticated callers and ordinary students.
 * Does not expose raw moderation documents to unauthorized clients.
 */
exports.listPendingSuspensionAppeals = (0, https_1.onCall)({ cors: true }, async (request) => {
    // 1. Authenticate caller
    if (!request.auth || !request.auth.uid) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required: You must be signed in to view suspension appeals.");
    }
    // 2. Strict Custom Claim Verification: request.auth.token.admin === true
    if (request.auth.token.admin !== true) {
        throw new https_1.HttpsError("permission-denied", "Unauthorized: Campus administrator privileges required.");
    }
    // 3. Query all pending appeals from userModeration
    const querySnap = await db
        .collection("userModeration")
        .where("appealStatus", "==", "submitted")
        .get();
    // 4. Enrich appellant info safely
    const appeals = await Promise.all(querySnap.docs.map(async (docSnap) => {
        const modData = docSnap.data() || {};
        const userId = docSnap.id;
        let userName = modData.userName || "Campus Student";
        let userEmail = undefined;
        try {
            const userDoc = await db.collection("users").doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData?.name)
                    userName = userData.name;
                if (userData?.email)
                    userEmail = userData.email;
            }
            else {
                const publicDoc = await db.collection("publicProfiles").doc(userId).get();
                if (publicDoc.exists && publicDoc.data()?.displayName) {
                    userName = publicDoc.data().displayName;
                }
            }
        }
        catch {
            // Gracefully continue with available name
        }
        const appealedAt = modData.appealedAt
            ? typeof modData.appealedAt.toDate === "function"
                ? modData.appealedAt.toDate().toISOString()
                : new Date(modData.appealedAt).toISOString()
            : null;
        const suspensionExpiresAt = modData.suspensionExpiresAt
            ? typeof modData.suspensionExpiresAt.toDate === "function"
                ? modData.suspensionExpiresAt.toDate().toISOString()
                : new Date(modData.suspensionExpiresAt).toISOString()
            : null;
        return {
            userId,
            userName,
            userEmail,
            isSuspended: !!modData.isSuspended,
            suspensionReason: modData.suspensionReason || "Received 5 distinct 1-star ratings across campus activities.",
            suspensionExpiresAt,
            appealStatus: modData.appealStatus || "submitted",
            appealReason: modData.appealReason || "",
            appealedAt,
            distinctOneStarCount: Array.isArray(modData.distinctOneStarRaters)
                ? modData.distinctOneStarRaters.length
                : (modData.distinctOneStarCount || 5),
        };
    }));
    // Sort by most recently appealed first
    appeals.sort((a, b) => {
        const timeA = a.appealedAt ? new Date(a.appealedAt).getTime() : 0;
        const timeB = b.appealedAt ? new Date(b.appealedAt).getTime() : 0;
        return timeB - timeA;
    });
    return {
        success: true,
        appeals,
    };
});
//# sourceMappingURL=index.js.map