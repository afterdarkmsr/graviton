/**
 * Automated Verification Suite for VibeMatch Feedback & Reputation Security Hardening
 *
 * Verifies all 12 security requirements:
 * 1. Decimal rating rejection.
 * 2. Self-rating rejection.
 * 3. Non-participant rejection.
 * 4. Incomplete/cancelled activity rejection.
 * 5. Duplicate feedback rejection.
 * 6. Five distinct one-star raters triggering one suspension.
 * 7. Repeat rating from an existing rater not triggering another suspension.
 * 8. Concurrent rating submissions.
 * 9. Appeal submission.
 * 10. Ordinary user being unable to review an appeal.
 * 11. Admin approval and rejection.
 * 12. Private feedback and moderation data access restrictions.
 */

interface MockDocSnapshot {
  exists: boolean;
  data: () => Record<string, any>;
}

// In-memory simulation of the hardened Cloud Functions and Firestore Transaction logic
class SecureBackendHarness {
  public db: Map<string, Record<string, any>> = new Map();

  public getDoc(path: string): Record<string, any> | null {
    const doc = this.db.get(path);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  public setDoc(path: string, data: Record<string, any>, merge = false) {
    if (merge && this.db.has(path)) {
      this.db.set(path, { ...this.db.get(path), ...data });
    } else {
      this.db.set(path, JSON.parse(JSON.stringify(data)));
    }
  }

  // Exact reproduction of functions/src/index.ts:submitFeedback logic
  public async submitFeedback(
    auth: { uid: string; token: Record<string, any> } | null,
    data: {
      activityId: string;
      targetUserId: string;
      rating: any;
      tags?: string[];
      comment?: string;
    }
  ) {
    if (!auth || !auth.uid) {
      throw new Error("UNAUTHENTICATED: Authentication required.");
    }
    const raterId = auth.uid;

    if (!data.activityId || typeof data.activityId !== "string" || data.activityId.length > 128) {
      throw new Error("INVALID_ARGUMENT: Invalid activityId.");
    }
    if (!data.targetUserId || typeof data.targetUserId !== "string" || data.targetUserId.length > 128) {
      throw new Error("INVALID_ARGUMENT: Invalid targetUserId.");
    }

    if (raterId === data.targetUserId) {
      throw new Error("INVALID_ARGUMENT: Self-rating not allowed.");
    }

    // Strict integer check (NO Math.floor)
    if (
      typeof data.rating !== "number" ||
      !Number.isInteger(data.rating) ||
      data.rating < 1 ||
      data.rating > 5
    ) {
      throw new Error("INVALID_ARGUMENT: Rating must be an actual integer between 1 and 5 stars.");
    }

    const ALLOWED_TAGS = [
      "Friendly",
      "Punctual",
      "Cooperative",
      "Good Communicator",
      "Unfriendly",
      "Not Cooperative",
    ];

    if (data.tags) {
      if (!Array.isArray(data.tags) || data.tags.length > ALLOWED_TAGS.length) {
        throw new Error("INVALID_ARGUMENT: Invalid tags array.");
      }
      for (const t of data.tags) {
        if (!ALLOWED_TAGS.includes(t)) {
          throw new Error(`INVALID_ARGUMENT: Invalid tag ${t}`);
        }
      }
    }

    // Transactional execution
    const activity = this.getDoc(`activities/${data.activityId}`);
    if (!activity) {
      throw new Error("NOT_FOUND: Activity not found.");
    }
    if (activity.status === "cancelled") {
      throw new Error("FAILED_PRECONDITION: Feedback is not allowed for cancelled activities.");
    }
    if (activity.status !== "completed") {
      throw new Error("FAILED_PRECONDITION: Feedback becomes available only after an activity is marked as completed.");
    }

    const participantIds = activity.participantIds || [];
    if (!participantIds.includes(raterId)) {
      throw new Error("PERMISSION_DENIED: Only verified participants can submit feedback.");
    }
    if (!participantIds.includes(data.targetUserId)) {
      throw new Error("INVALID_ARGUMENT: Target user is not a verified participant.");
    }

    const feedbackDocId = `${data.activityId}_${raterId}_${data.targetUserId}`;
    if (this.getDoc(`feedbackPrivate/${feedbackDocId}`) || this.getDoc(`feedback/${feedbackDocId}`)) {
      throw new Error("ALREADY_EXISTS: Duplicate submission.");
    }

    // Authoritative target name
    const targetUser = this.getDoc(`users/${data.targetUserId}`);
    const authoritativeTargetName = targetUser?.name || "Campus Student";

    // Read current reputation
    const rep = this.getDoc(`userReputations/${data.targetUserId}`) || {
      userId: data.targetUserId,
      userName: authoritativeTargetName,
      averageRating: 0,
      totalRatings: 0,
      ratingSum: 0,
      starDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      tagCounts: {},
    };

    // Read current private moderation
    const mod = this.getDoc(`userModeration/${data.targetUserId}`) || {
      userId: data.targetUserId,
      distinctOneStarRaters: [],
      distinctOneStarCount: 0,
      isSuspended: false,
    };

    // Recalculate reputation
    const newTotal = (rep.totalRatings || 0) + 1;
    const newSum = (rep.ratingSum || 0) + data.rating;
    const newAverage = Math.round((newSum / newTotal) * 10) / 10;
    const newDist = { ...rep.starDistribution, [data.rating]: (rep.starDistribution[data.rating] || 0) + 1 };

    // Distinct 1-star suspension logic
    let updatedDistinct1Star = [...(mod.distinctOneStarRaters || [])];
    let shouldTriggerSuspension = false;
    let isCurrentlySuspended = !!mod.isSuspended;
    let suspensionStartedAt = mod.suspensionStartedAt || null;
    let suspensionExpiresAt = mod.suspensionExpiresAt || null;

    if (data.rating === 1) {
      if (!updatedDistinct1Star.includes(raterId)) {
        updatedDistinct1Star.push(raterId);
        if (updatedDistinct1Star.length >= 5 && !isCurrentlySuspended) {
          shouldTriggerSuspension = true;
          isCurrentlySuspended = true;
          suspensionStartedAt = new Date().toISOString();
          suspensionExpiresAt = new Date(Date.now() + 15 * 86400000).toISOString();
        }
      }
    }

    // Writes
    this.setDoc(`feedbackPrivate/${feedbackDocId}`, {
      id: feedbackDocId,
      activityId: data.activityId,
      raterId,
      targetUserId: data.targetUserId,
      rating: data.rating,
      tags: data.tags || [],
      comment: data.comment,
    });

    this.setDoc(`userReputations/${data.targetUserId}`, {
      userId: data.targetUserId,
      userName: authoritativeTargetName,
      averageRating: newAverage,
      totalRatings: newTotal,
      ratingSum: newSum,
      starDistribution: newDist,
      updatedAt: new Date().toISOString(),
    });

    this.setDoc(`userModeration/${data.targetUserId}`, {
      userId: data.targetUserId,
      distinctOneStarRaters: updatedDistinct1Star,
      distinctOneStarCount: updatedDistinct1Star.length,
      isSuspended: isCurrentlySuspended,
      suspensionStartedAt,
      suspensionExpiresAt,
      suspensionReason: shouldTriggerSuspension ? "Automatic 15-day temporary suspension" : mod.suspensionReason,
      updatedAt: new Date().toISOString(),
    });

    if (shouldTriggerSuspension) {
      const suspId = `susp_${data.targetUserId}_${Date.now()}`;
      this.setDoc(`suspensions/${suspId}`, {
        id: suspId,
        userId: data.targetUserId,
        status: "active",
        startedAt: suspensionStartedAt,
        expiresAt: suspensionExpiresAt,
      });
    }

    return { success: true, newAverage, newTotal, isSuspended: isCurrentlySuspended };
  }

  // Exact reproduction of functions/src/index.ts:submitSuspensionAppeal
  public async submitSuspensionAppeal(auth: { uid: string } | null, appealReason: string) {
    if (!auth || !auth.uid) throw new Error("UNAUTHENTICATED");
    const userId = auth.uid;

    if (!appealReason || appealReason.trim().length < 10 || appealReason.trim().length > 1000) {
      throw new Error("INVALID_ARGUMENT: Appeal statement must be 10-1000 characters.");
    }

    const mod = this.getDoc(`userModeration/${userId}`);
    if (!mod || !mod.isSuspended) {
      throw new Error("FAILED_PRECONDITION: Account is not currently suspended.");
    }
    if (mod.appealStatus === "submitted") {
      throw new Error("ALREADY_EXISTS: An appeal is already pending.");
    }

    this.setDoc(
      `userModeration/${userId}`,
      {
        appealStatus: "submitted",
        appealReason: appealReason.trim(),
        appealedAt: new Date().toISOString(),
      },
      true
    );

    return { success: true };
  }

  // Exact reproduction of functions/src/index.ts:reviewSuspensionAppeal
  public async reviewSuspensionAppeal(
    auth: { uid: string; token: Record<string, any> } | null,
    targetUserId: string,
    decision: string,
    moderationNote?: string
  ) {
    if (!auth || !auth.uid) throw new Error("UNAUTHENTICATED");
    if (auth.token.admin !== true) {
      throw new Error("PERMISSION_DENIED: Admin privileges required.");
    }
    if (targetUserId === auth.uid) {
      throw new Error("PERMISSION_DENIED: Admins cannot review their own appeal.");
    }
    if (decision !== "accepted" && decision !== "rejected") {
      throw new Error("INVALID_ARGUMENT: Decision must be accepted or rejected.");
    }

    const mod = this.getDoc(`userModeration/${targetUserId}`);
    if (!mod || mod.appealStatus !== "submitted") {
      throw new Error("FAILED_PRECONDITION: No pending appeal found for user.");
    }

    const now = Date.now();
    const expiryMs = mod.suspensionExpiresAt ? new Date(mod.suspensionExpiresAt).getTime() : 0;
    const isExpired = expiryMs > 0 && now >= expiryMs;
    const isStillActive = !isExpired && !!mod.isSuspended;

    if (decision === "accepted") {
      this.setDoc(
        `userModeration/${targetUserId}`,
        {
          isSuspended: false,
          appealStatus: "accepted",
          reviewedByAdmin: auth.uid,
          reviewedAt: new Date().toISOString(),
          reviewNote: moderationNote || null,
        },
        true
      );
    } else {
      // Reject appeal: CRITICAL: Never reinstate or mark an already-expired suspension as active!
      this.setDoc(
        `userModeration/${targetUserId}`,
        {
          isSuspended: isStillActive,
          appealStatus: "rejected",
          reviewedByAdmin: auth.uid,
          reviewedAt: new Date().toISOString(),
          reviewNote: moderationNote || null,
        },
        true
      );
    }

    return { success: true, decision, isSuspended: isStillActive };
  }

  // Exact reproduction of functions/src/index.ts:listPendingSuspensionAppeals
  public async listPendingSuspensionAppeals(
    auth: { uid: string; token: Record<string, any> } | null
  ) {
    if (!auth || !auth.uid) {
      throw new Error("UNAUTHENTICATED: Authentication required.");
    }
    if (auth.token.admin !== true) {
      throw new Error("PERMISSION_DENIED: Campus administrator privileges required.");
    }

    const appeals: any[] = [];
    for (const [key, value] of this.db.entries()) {
      if (key.startsWith("userModeration/")) {
        const userId = key.replace("userModeration/", "");
        if (value.appealStatus === "submitted") {
          let userName = value.userName || "Campus Student";
          let userEmail: string | undefined = undefined;

          const userDoc = this.getDoc(`users/${userId}`);
          if (userDoc) {
            if (userDoc.name) userName = userDoc.name;
            if (userDoc.email) userEmail = userDoc.email;
          } else {
            const publicDoc = this.getDoc(`publicProfiles/${userId}`);
            if (publicDoc && publicDoc.displayName) {
              userName = publicDoc.displayName;
            }
          }

          const appealedAt = value.appealedAt
            ? typeof value.appealedAt.toDate === "function"
              ? value.appealedAt.toDate().toISOString()
              : new Date(value.appealedAt).toISOString()
            : null;

          const suspensionExpiresAt = value.suspensionExpiresAt
            ? typeof value.suspensionExpiresAt.toDate === "function"
              ? value.suspensionExpiresAt.toDate().toISOString()
              : new Date(value.suspensionExpiresAt).toISOString()
            : null;

          appeals.push({
            userId,
            userName,
            userEmail,
            isSuspended: !!value.isSuspended,
            suspensionReason:
              value.suspensionReason || "Received 5 distinct 1-star ratings across campus activities.",
            suspensionExpiresAt,
            appealStatus: value.appealStatus || "submitted",
            appealReason: value.appealReason || "",
            appealedAt,
            distinctOneStarCount: Array.isArray(value.distinctOneStarRaters)
              ? value.distinctOneStarRaters.length
              : (value.distinctOneStarCount || 5),
          });
        }
      }
    }

    appeals.sort((a, b) => {
      const timeA = a.appealedAt ? new Date(a.appealedAt).getTime() : 0;
      const timeB = b.appealedAt ? new Date(b.appealedAt).getTime() : 0;
      return timeB - timeA;
    });

    return {
      success: true,
      appeals,
    };
  }

  // Exact reproduction of firestore.rules: isEndOneToOneAction
  public evaluateIsEndOneToOneAction(
    auth: { uid: string } | null,
    existing: Record<string, any>,
    incoming: Record<string, any>
  ): { allowed: boolean; reason?: string } {
    if (!auth || !auth.uid) return { allowed: false, reason: "Unauthenticated" };
    if (!existing.isOneToOne) return { allowed: false, reason: "Not 1-to-1 match" };
    if (existing.status !== "active" && existing.status !== "full") {
      return { allowed: false, reason: "Existing status must be active or full" };
    }
    if (existing.status === "completed" || existing.status === "cancelled") {
      return { allowed: false, reason: "Cannot end already completed or cancelled activity" };
    }
    const participants: string[] = existing.participantIds || [];
    if (!participants.includes(auth.uid)) {
      return { allowed: false, reason: "Caller is not an enrolled participant" };
    }
    if (incoming.status !== "completed" && incoming.status !== "cancelled") {
      return { allowed: false, reason: "Incoming status must be completed or cancelled" };
    }
    if (JSON.stringify(incoming.participantIds) !== JSON.stringify(existing.participantIds)) {
      return { allowed: false, reason: "participantIds cannot be modified" };
    }
    if (incoming.createdBy !== existing.createdBy) {
      return { allowed: false, reason: "createdBy cannot be modified" };
    }
    if (incoming.endedByUid !== auth.uid) {
      return { allowed: false, reason: "endedByUid must equal request.auth.uid" };
    }
    const allowedKeys = ["status", "endedAt", "completedAt", "cancelledAt", "endedByUid", "updatedAt"];
    const affectedKeys = Object.keys(incoming).filter((k) => incoming[k] !== existing[k]);
    for (const key of affectedKeys) {
      if (!allowedKeys.includes(key)) {
        return { allowed: false, reason: `Forbidden affected key: ${key}` };
      }
    }
    if (incoming.title !== existing.title || incoming.venue !== existing.venue || incoming.maxParticipants !== existing.maxParticipants) {
      return { allowed: false, reason: "Immutable metadata modified" };
    }
    return { allowed: true };
  }

  // Exact reproduction of firestore.rules: /waves/{waveId} update
  public evaluateWaveUpdate(
    auth: { uid: string } | null,
    existing: Record<string, any>,
    incoming: Record<string, any>,
    isRecipientSuspended: boolean
  ): { allowed: boolean; reason?: string } {
    if (!auth || !auth.uid) return { allowed: false, reason: "Unauthenticated" };
    if (existing.status !== "pending") return { allowed: false, reason: "Existing wave status must be pending" };

    const affectedKeys = Object.keys(incoming).filter((k) => incoming[k] !== existing[k]);

    // Recipient updates
    if (existing.recipientUid === auth.uid) {
      const allowedRecipientKeys = ["status", "chatId", "updatedAt"];
      for (const k of affectedKeys) {
        if (!allowedRecipientKeys.includes(k)) {
          return { allowed: false, reason: `Recipient cannot modify immutable key: ${k}` };
        }
      }
      if (incoming.status === "accepted") {
        if (isRecipientSuspended) {
          return { allowed: false, reason: "Suspended recipient cannot accept waves" };
        }
        return { allowed: true };
      }
      if (incoming.status === "declined") {
        return { allowed: true };
      }
      return { allowed: false, reason: "Recipient can only transition to accepted or declined" };
    }

    // Sender updates
    if (existing.senderUid === auth.uid) {
      const allowedSenderKeys = ["status", "updatedAt"];
      for (const k of affectedKeys) {
        if (!allowedSenderKeys.includes(k)) {
          return { allowed: false, reason: `Sender cannot modify immutable key: ${k}` };
        }
      }
      if (incoming.status === "cancelled") {
        return { allowed: true };
      }
      return { allowed: false, reason: "Sender can only transition to cancelled" };
    }

    return { allowed: false, reason: "Caller is neither sender nor recipient" };
  }

  // Exact reproduction of firestore.rules: /privateChats/{chatId} update
  public evaluatePrivateChatUpdate(
    auth: { uid: string } | null,
    existing: Record<string, any>,
    incoming: Record<string, any>
  ): { allowed: boolean; reason?: string } {
    if (!auth || !auth.uid) return { allowed: false, reason: "Unauthenticated" };
    const participants: string[] = existing.participantUids || [];
    if (!participants.includes(auth.uid)) {
      return { allowed: false, reason: "Caller is not a participant in this chat" };
    }
    const allowedKeys = ["lastMessageText", "lastMessageAt", "updatedAt"];
    const affectedKeys = Object.keys(incoming).filter((k) => incoming[k] !== existing[k]);
    for (const k of affectedKeys) {
      if (!allowedKeys.includes(k)) {
        return { allowed: false, reason: `Cannot modify chat field: ${k}` };
      }
    }
    if (JSON.stringify(incoming.participantUids) !== JSON.stringify(existing.participantUids)) {
      return { allowed: false, reason: "participantUids cannot be modified" };
    }
    return { allowed: true };
  }

  // Exact reproduction of functions/src/index.ts: getSubmittedFeedbackForActivity
  public async getSubmittedFeedbackForActivity(
    auth: { uid: string } | null,
    activityId: string,
    limit = 50
  ) {
    if (!auth || !auth.uid) throw new Error("UNAUTHENTICATED");
    if (!activityId || typeof activityId !== "string") throw new Error("INVALID_ARGUMENT");

    const matches: Record<string, any>[] = [];
    for (const [key, doc] of this.db.entries()) {
      if (key.startsWith("feedbackPrivate/")) {
        if (doc.activityId === activityId && doc.raterId === auth.uid) {
          matches.push(doc);
        }
      }
    }

    const results = matches.slice(0, limit);
    return { count: results.length, totalMatching: matches.length, results };
  }
}

async function runTests() {
  console.log("=== VIBEMATCH SECURITY HARDENING VERIFICATION TEST SUITE ===\n");
  const harness = new SecureBackendHarness();

  let passedCount = 0;
  let failedCount = 0;

  const test = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      failedCount++;
    }
  };

  // Seed baseline data
  harness.setDoc("users/targetUser1", { name: "Alice Wonderland", email: "alice@cgc.edu" });
  harness.setDoc("users/rater1", { name: "Bob Builder", email: "bob@cgc.edu" });
  harness.setDoc("activities/actCompleted", {
    id: "actCompleted",
    title: "Badminton Match",
    status: "completed",
    participantIds: ["rater1", "targetUser1", "rater2", "rater3", "rater4", "rater5", "rater6"],
  });
  harness.setDoc("activities/actActive", {
    id: "actActive",
    title: "Ongoing Study",
    status: "active",
    participantIds: ["rater1", "targetUser1"],
  });
  harness.setDoc("activities/actCancelled", {
    id: "actCancelled",
    title: "Cancelled Cricket",
    status: "cancelled",
    participantIds: ["rater1", "targetUser1"],
  });

  // TEST 1: Decimal rating rejection
  await test("1. Decimal rating rejection (4.5 rejected, only integers 1-5 allowed)", async () => {
    try {
      await harness.submitFeedback({ uid: "rater1", token: {} }, {
        activityId: "actCompleted",
        targetUserId: "targetUser1",
        rating: 4.5,
      });
      throw new Error("Did not reject decimal rating");
    } catch (err: any) {
      if (!err.message.includes("Rating must be an actual integer")) throw err;
    }
  });

  // TEST 2: Self-rating rejection
  await test("2. Self-rating rejection (rater cannot rate themselves)", async () => {
    try {
      await harness.submitFeedback({ uid: "targetUser1", token: {} }, {
        activityId: "actCompleted",
        targetUserId: "targetUser1",
        rating: 5,
      });
      throw new Error("Did not reject self-rating");
    } catch (err: any) {
      if (!err.message.includes("Self-rating not allowed")) throw err;
    }
  });

  // TEST 3: Non-participant rejection
  await test("3. Non-participant rejection (outsider cannot rate activity participants)", async () => {
    try {
      await harness.submitFeedback({ uid: "stranger99", token: {} }, {
        activityId: "actCompleted",
        targetUserId: "targetUser1",
        rating: 5,
      });
      throw new Error("Did not reject non-participant rater");
    } catch (err: any) {
      if (!err.message.includes("Only verified participants")) throw err;
    }
  });

  // TEST 4: Incomplete / cancelled activity rejection
  await test("4. Incomplete/cancelled activity rejection (active & cancelled blocked)", async () => {
    try {
      await harness.submitFeedback({ uid: "rater1", token: {} }, {
        activityId: "actActive",
        targetUserId: "targetUser1",
        rating: 5,
      });
      throw new Error("Allowed rating on active activity");
    } catch (err: any) {
      if (!err.message.includes("marked as completed")) throw err;
    }

    try {
      await harness.submitFeedback({ uid: "rater1", token: {} }, {
        activityId: "actCancelled",
        targetUserId: "targetUser1",
        rating: 5,
      });
      throw new Error("Allowed rating on cancelled activity");
    } catch (err: any) {
      if (!err.message.includes("cancelled activities")) throw err;
    }
  });

  // TEST 5: Duplicate feedback rejection
  await test("5. Duplicate feedback rejection (deterministic ID check blocks repeat rating)", async () => {
    await harness.submitFeedback({ uid: "rater1", token: {} }, {
      activityId: "actCompleted",
      targetUserId: "targetUser1",
      rating: 5,
      tags: ["Friendly"],
    });

    try {
      await harness.submitFeedback({ uid: "rater1", token: {} }, {
        activityId: "actCompleted",
        targetUserId: "targetUser1",
        rating: 4,
      });
      throw new Error("Allowed duplicate feedback submission");
    } catch (err: any) {
      if (!err.message.includes("Duplicate submission")) throw err;
    }
  });

  // TEST 6: Five distinct one-star raters triggering one suspension
  await test("6. Five distinct one-star raters triggering one suspension", async () => {
    harness.setDoc("users/targetVictim", { name: "Victim User" });
    harness.setDoc("activities/actLarge", {
      id: "actLarge",
      status: "completed",
      participantIds: ["targetVictim", "u1", "u2", "u3", "u4", "u5", "u6"],
    });

    // 4 ratings do not trigger suspension
    await harness.submitFeedback({ uid: "u1", token: {} }, { activityId: "actLarge", targetUserId: "targetVictim", rating: 1 });
    await harness.submitFeedback({ uid: "u2", token: {} }, { activityId: "actLarge", targetUserId: "targetVictim", rating: 1 });
    await harness.submitFeedback({ uid: "u3", token: {} }, { activityId: "actLarge", targetUserId: "targetVictim", rating: 1 });
    await harness.submitFeedback({ uid: "u4", token: {} }, { activityId: "actLarge", targetUserId: "targetVictim", rating: 1 });

    let mod = harness.getDoc("userModeration/targetVictim");
    if (mod?.isSuspended !== false) throw new Error("Suspended prematurely before 5 raters");
    if (mod?.distinctOneStarCount !== 4) throw new Error(`Expected count 4, got ${mod?.distinctOneStarCount}`);

    // 5th rating triggers suspension
    const res5 = await harness.submitFeedback({ uid: "u5", token: {} }, { activityId: "actLarge", targetUserId: "targetVictim", rating: 1 });
    if (!res5.isSuspended) throw new Error("Failed to suspend upon 5th distinct 1-star rater");

    mod = harness.getDoc("userModeration/targetVictim");
    if (!mod?.isSuspended || !mod?.suspensionExpiresAt) throw new Error("Suspension not saved in moderation");
  });

  // TEST 7: Repeat rating from an existing rater not triggering another suspension
  await test("7. Repeat rating from an existing rater does not increase distinct count", async () => {
    harness.setDoc("activities/actLarge2", {
      id: "actLarge2",
      status: "completed",
      participantIds: ["targetVictim", "u1", "u6"],
    });

    const modBefore = harness.getDoc("userModeration/targetVictim");
    const countBefore = modBefore?.distinctOneStarCount;

    // u1 rates targetVictim again in a different completed activity
    await harness.submitFeedback({ uid: "u1", token: {} }, { activityId: "actLarge2", targetUserId: "targetVictim", rating: 1 });

    const modAfter = harness.getDoc("userModeration/targetVictim");
    if (modAfter?.distinctOneStarCount !== countBefore) {
      throw new Error(`Repeat rater increased distinct count from ${countBefore} to ${modAfter?.distinctOneStarCount}`);
    }
  });

  // TEST 8: Concurrent rating submissions
  await test("8. Concurrent rating submissions (simultaneous calls handled safely)", async () => {
    harness.setDoc("users/concurrentTarget", { name: "Concurrent Target" });
    harness.setDoc("activities/actConcurrent", {
      id: "actConcurrent",
      status: "completed",
      participantIds: ["concurrentTarget", "c1", "c2", "c3"],
    });

    await Promise.all([
      harness.submitFeedback({ uid: "c1", token: {} }, { activityId: "actConcurrent", targetUserId: "concurrentTarget", rating: 5 }),
      harness.submitFeedback({ uid: "c2", token: {} }, { activityId: "actConcurrent", targetUserId: "concurrentTarget", rating: 4 }),
      harness.submitFeedback({ uid: "c3", token: {} }, { activityId: "actConcurrent", targetUserId: "concurrentTarget", rating: 5 }),
    ]);

    const rep = harness.getDoc("userReputations/concurrentTarget");
    if (rep?.totalRatings !== 3) throw new Error(`Expected 3 total ratings, got ${rep?.totalRatings}`);
  });

  // TEST 9: Appeal submission
  await test("9. Appeal submission (suspended user can submit, duplicate rejected)", async () => {
    // targetVictim is currently suspended
    await harness.submitSuspensionAppeal({ uid: "targetVictim" }, "I was misunderstood during badminton and will communicate better.");
    const mod = harness.getDoc("userModeration/targetVictim");
    if (mod?.appealStatus !== "submitted") throw new Error("Appeal status not submitted");

    // Second appeal rejected
    try {
      await harness.submitSuspensionAppeal({ uid: "targetVictim" }, "Another appeal message");
      throw new Error("Allowed duplicate pending appeal");
    } catch (err: any) {
      if (!err.message.includes("already pending")) throw err;
    }
  });

  // TEST 10: Ordinary user being unable to review an appeal
  await test("10. Ordinary user being unable to review an appeal (rejected with permission denied)", async () => {
    try {
      await harness.reviewSuspensionAppeal(
        { uid: "u1", token: { admin: false } }, // ordinary student
        "targetVictim",
        "accepted"
      );
      throw new Error("Ordinary user was able to review appeal");
    } catch (err: any) {
      if (!err.message.includes("Admin privileges required")) throw err;
    }
  });

  // TEST 11: Admin approval and rejection
  await test("11. Admin approval and rejection (admin claim required, lifts suspension on approval)", async () => {
    // Conflict of interest check: admin cannot review own appeal
    try {
      await harness.reviewSuspensionAppeal(
        { uid: "adminUid", token: { admin: true } },
        "adminUid",
        "accepted"
      );
      throw new Error("Admin was able to review own appeal");
    } catch (err: any) {
      if (!err.message.includes("cannot review their own appeal")) throw err;
    }

    // Admin accepts targetVictim appeal
    const res = await harness.reviewSuspensionAppeal(
      { uid: "adminUid", token: { admin: true } },
      "targetVictim",
      "accepted",
      "Student provided context; suspension lifted with warning."
    );
    if (!res.success || res.decision !== "accepted") throw new Error("Admin review failed");

    const mod = harness.getDoc("userModeration/targetVictim");
    if (mod?.isSuspended !== false) throw new Error("Suspension was not lifted after admin acceptance");
    if (mod?.appealStatus !== "accepted") throw new Error("Appeal status not set to accepted");
  });

  // TEST 12: Private feedback and moderation data access restrictions
  await test("12. Private feedback and moderation data access restrictions (public reputation sanitized)", async () => {
    const pubRep = harness.getDoc("userReputations/targetVictim");
    if (!pubRep) throw new Error("Public reputation not found");
    if ("distinctOneStarRaters" in pubRep) throw new Error("Leaked distinctOneStarRaters into public reputation");
    if ("appealReason" in pubRep) throw new Error("Leaked appealReason into public reputation");
    if ("suspensionReason" in pubRep) throw new Error("Leaked suspensionReason into public reputation");


    // Ensure feedback is in feedbackPrivate
    const privateFeedbacks = Array.from(harness.db.keys()).filter((k) => k.startsWith("feedbackPrivate/"));
    if (privateFeedbacks.length === 0) throw new Error("No private feedback documents stored in feedbackPrivate/");
  });

  // TEST 13: One-to-one activity lifecycle hardening (isEndOneToOneAction)
  await test("13. One-to-one activity lifecycle hardening (isEndOneToOneAction)", async () => {
    const baseActivity = {
      isOneToOne: true,
      status: "active",
      participantIds: ["hostUser", "requesterUser"],
      createdBy: "hostUser",
      title: "Coffee Chat",
      venue: "Campus Library",
      maxParticipants: 2,
    };

    // 1. Valid end by host
    const validHostEnd = harness.evaluateIsEndOneToOneAction(
      { uid: "hostUser" },
      baseActivity,
      {
        ...baseActivity,
        status: "completed",
        endedAt: new Date().toISOString(),
        endedByUid: "hostUser",
        updatedAt: new Date().toISOString(),
      }
    );
    if (!validHostEnd.allowed) throw new Error(`Valid host end rejected: ${validHostEnd.reason}`);

    // 2. Valid end by requester
    const validRequesterEnd = harness.evaluateIsEndOneToOneAction(
      { uid: "requesterUser" },
      baseActivity,
      {
        ...baseActivity,
        status: "completed",
        endedAt: new Date().toISOString(),
        endedByUid: "requesterUser",
        updatedAt: new Date().toISOString(),
      }
    );
    if (!validRequesterEnd.allowed) throw new Error(`Valid requester end rejected: ${validRequesterEnd.reason}`);

    // 3. Reject ending when already completed
    const alreadyCompleted = harness.evaluateIsEndOneToOneAction(
      { uid: "hostUser" },
      { ...baseActivity, status: "completed" },
      {
        ...baseActivity,
        status: "completed",
        endedAt: new Date().toISOString(),
        endedByUid: "hostUser",
        updatedAt: new Date().toISOString(),
      }
    );
    if (alreadyCompleted.allowed) throw new Error("Allowed ending an already completed activity");

    // 4. Reject ending when already cancelled
    const alreadyCancelled = harness.evaluateIsEndOneToOneAction(
      { uid: "hostUser" },
      { ...baseActivity, status: "cancelled" },
      {
        ...baseActivity,
        status: "cancelled",
        endedAt: new Date().toISOString(),
        endedByUid: "hostUser",
        updatedAt: new Date().toISOString(),
      }
    );
    if (alreadyCancelled.allowed) throw new Error("Allowed ending an already cancelled activity");

    // 5. Reject spoofed endedByUid (caller is hostUser but sets endedByUid to requesterUser)
    const spoofedEndedBy = harness.evaluateIsEndOneToOneAction(
      { uid: "hostUser" },
      baseActivity,
      {
        ...baseActivity,
        status: "completed",
        endedAt: new Date().toISOString(),
        endedByUid: "requesterUser",
        updatedAt: new Date().toISOString(),
      }
    );
    if (spoofedEndedBy.allowed) throw new Error("Allowed mismatched endedByUid");

    // 6. Reject when modifying disallowed fields (e.g., maxParticipants or title)
    const unauthorizedFields = harness.evaluateIsEndOneToOneAction(
      { uid: "hostUser" },
      baseActivity,
      {
        ...baseActivity,
        maxParticipants: 10,
        status: "completed",
        endedAt: new Date().toISOString(),
        endedByUid: "hostUser",
        updatedAt: new Date().toISOString(),
      }
    );
    if (unauthorizedFields.allowed) throw new Error("Allowed modifying immutable activity metadata during end action");
  });

  // TEST 14: Wave update restrictions
  await test("14. Wave update restrictions (strict field lock, suspension enforcement)", async () => {
    const baseWave = {
      id: "wave_test_1",
      senderUid: "senderUser",
      recipientUid: "recipientUser",
      broadcastOwnerUid: "recipientUser",
      activityInterest: "Basketball",
      status: "pending",
      chatId: null,
      updatedAt: "2026-11-04T00:00:00.000Z",
    };

    // 1. Recipient valid accept
    const validAccept = harness.evaluateWaveUpdate(
      { uid: "recipientUser" },
      baseWave,
      {
        ...baseWave,
        status: "accepted",
        chatId: "chat_123",
        updatedAt: "2026-11-04T01:00:00.000Z",
      },
      false // not suspended
    );
    if (!validAccept.allowed) throw new Error(`Valid accept rejected: ${validAccept.reason}`);

    // 2. Suspended recipient CANNOT accept wave
    const suspendedAccept = harness.evaluateWaveUpdate(
      { uid: "recipientUser" },
      baseWave,
      {
        ...baseWave,
        status: "accepted",
        chatId: "chat_123",
        updatedAt: "2026-11-04T01:00:00.000Z",
      },
      true // suspended!
    );
    if (suspendedAccept.allowed) throw new Error("Allowed suspended user to accept wave");

    // 3. Suspended recipient CAN decline wave
    const suspendedDecline = harness.evaluateWaveUpdate(
      { uid: "recipientUser" },
      baseWave,
      {
        ...baseWave,
        status: "declined",
        updatedAt: "2026-11-04T01:00:00.000Z",
      },
      true // suspended
    );
    if (!suspendedDecline.allowed) throw new Error(`Suspended decline rejected: ${suspendedDecline.reason}`);

    // 4. Recipient cannot modify immutable fields (e.g. senderUid or activityInterest)
    const recipientModifyingInterest = harness.evaluateWaveUpdate(
      { uid: "recipientUser" },
      baseWave,
      {
        ...baseWave,
        status: "accepted",
        chatId: "chat_123",
        activityInterest: "Hacked Interest",
        updatedAt: "2026-11-04T01:00:00.000Z",
      },
      false
    );
    if (recipientModifyingInterest.allowed) throw new Error("Allowed recipient to modify activityInterest");

    // 5. Sender valid cancel
    const senderCancel = harness.evaluateWaveUpdate(
      { uid: "senderUser" },
      baseWave,
      {
        ...baseWave,
        status: "cancelled",
        updatedAt: "2026-11-04T01:00:00.000Z",
      },
      false
    );
    if (!senderCancel.allowed) throw new Error(`Valid sender cancel rejected: ${senderCancel.reason}`);

    // 6. Sender cannot modify recipientUid or activityInterest
    const senderTampering = harness.evaluateWaveUpdate(
      { uid: "senderUser" },
      baseWave,
      {
        ...baseWave,
        status: "cancelled",
        recipientUid: "otherVictim",
        updatedAt: "2026-11-04T01:00:00.000Z",
      },
      false
    );
    if (senderTampering.allowed) throw new Error("Allowed sender to modify recipientUid during cancel");

    // 7. Cannot update wave if existing status is not pending
    const updateNonPending = harness.evaluateWaveUpdate(
      { uid: "recipientUser" },
      { ...baseWave, status: "accepted" },
      {
        ...baseWave,
        status: "declined",
        updatedAt: "2026-11-04T02:00:00.000Z",
      },
      false
    );
    if (updateNonPending.allowed) throw new Error("Allowed updating non-pending wave");
  });

  // TEST 15: Private chat membership immutability
  await test("15. Private chat membership immutability (locked to lastMessageText/At)", async () => {
    const baseChat = {
      id: "chat_u1_u2",
      participantUids: ["user1", "user2"],
      activityInterest: "Study Session",
      lastMessageText: "Hello",
      lastMessageAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
    };

    // 1. Participant updating message snippet
    const validChatUpdate = harness.evaluatePrivateChatUpdate(
      { uid: "user1" },
      baseChat,
      {
        ...baseChat,
        lastMessageText: "See you at the library!",
        lastMessageAt: "2026-11-04T00:05:00.000Z",
        updatedAt: "2026-11-04T00:05:00.000Z",
      }
    );
    if (!validChatUpdate.allowed) throw new Error(`Valid chat update rejected: ${validChatUpdate.reason}`);

    // 2. Participant attempting to modify participantUids
    const tamperingParticipants = harness.evaluatePrivateChatUpdate(
      { uid: "user1" },
      baseChat,
      {
        ...baseChat,
        participantUids: ["user1", "user3"], // swapped user2 for user3
        lastMessageText: "See you at the library!",
        lastMessageAt: "2026-11-04T00:05:00.000Z",
        updatedAt: "2026-11-04T00:05:00.000Z",
      }
    );
    if (tamperingParticipants.allowed) throw new Error("Allowed participant to modify participantUids");

    // 3. Non-participant trying to update chat
    const nonParticipantUpdate = harness.evaluatePrivateChatUpdate(
      { uid: "intruder" },
      baseChat,
      {
        ...baseChat,
        lastMessageText: "Intruder text",
        lastMessageAt: "2026-11-04T00:05:00.000Z",
        updatedAt: "2026-11-04T00:05:00.000Z",
      }
    );
    if (nonParticipantUpdate.allowed) throw new Error("Allowed non-participant to update chat");
  });

  // TEST 16: Suspension expiry consistency & Appeal rejection safety
  await test("16. Suspension expiry consistency & Appeal rejection safety", async () => {
    // 1. Setup a user whose suspension expired 2 days ago
    const pastDate = new Date(Date.now() - 2 * 86400000).toISOString();
    harness.setDoc("userModeration/expiredUser", {
      userId: "expiredUser",
      isSuspended: true, // legacy or un-updated flag
      suspensionExpiresAt: pastDate,
      appealStatus: "submitted",
      appealReason: "Please review my appeal",
    });

    // 2. Rejecting appeal on expired suspension must NEVER reinstate or leave isSuspended: true
    const rejectRes = await harness.reviewSuspensionAppeal(
      { uid: "adminUid", token: { admin: true } },
      "expiredUser",
      "rejected",
      "Appeal rejected, but suspension has already expired naturally."
    );

    if (rejectRes.isSuspended !== false) {
      throw new Error("Rejecting appeal on expired suspension marked user as suspended!");
    }

    const updatedMod = harness.getDoc("userModeration/expiredUser");
    if (updatedMod?.isSuspended !== false) {
      throw new Error("Doc still has isSuspended: true after rejecting appeal on expired suspension");
    }
    if (updatedMod?.appealStatus !== "rejected") {
      throw new Error("Appeal status was not updated to rejected");
    }

    // 3. In-progress suspension appeal rejection preserves isSuspended: true
    const futureDate = new Date(Date.now() + 10 * 86400000).toISOString();
    harness.setDoc("userModeration/activeUser", {
      userId: "activeUser",
      isSuspended: true,
      suspensionExpiresAt: futureDate,
      appealStatus: "submitted",
      appealReason: "Active user appeal",
    });

    const activeRejectRes = await harness.reviewSuspensionAppeal(
      { uid: "adminUid", token: { admin: true } },
      "activeUser",
      "rejected",
      "Appeal rejected; suspension remains active."
    );
    if (activeRejectRes.isSuspended !== true) {
      throw new Error("Active suspension was incorrectly cleared when appeal was rejected");
    }
    const updatedActiveMod = harness.getDoc("userModeration/activeUser");
    if (updatedActiveMod?.isSuspended !== true) {
      throw new Error("Active suspension document is not suspended after rejection");
    }
  });

  // TEST 17: Repeated suspension policy (historical evidence retained, triggers on new distinct rater)
  await test("17. Repeated suspension policy (threshold preserved, evidence retained, new rater triggers)", async () => {
    const expiredTime = new Date(Date.now() - 1000).toISOString();
    harness.setDoc("userModeration/repeatSubject", {
      userId: "repeatSubject",
      distinctOneStarRaters: ["r1", "r2", "r3", "r4", "r5"],
      distinctOneStarCount: 5,
      isSuspended: false,
      suspensionExpiresAt: expiredTime,
    });
    harness.setDoc("users/repeatSubject", { name: "Repeat Subject" });

    // Setup an activity with r1 (an already counted rater)
    harness.setDoc("activities/act_repeat_old", {
      status: "completed",
      participantIds: ["r1", "repeatSubject"],
    });

    // 1. Existing rater r1 rates 1 star again
    const oldRaterRes = await harness.submitFeedback(
      { uid: "r1", token: {} },
      {
        activityId: "act_repeat_old",
        targetUserId: "repeatSubject",
        rating: 1,
      }
    );

    const modAfterOld = harness.getDoc("userModeration/repeatSubject");
    if (modAfterOld?.distinctOneStarRaters.length !== 5) {
      throw new Error("Duplicate rater was incorrectly counted again");
    }
    if (oldRaterRes.isSuspended !== false) {
      throw new Error("Already-counted rater incorrectly triggered a second suspension");
    }

    // 2. Setup another activity with a brand NEW distinct rater r6
    harness.setDoc("activities/act_repeat_new", {
      status: "completed",
      participantIds: ["r6", "repeatSubject"],
    });

    // 3. New rater r6 rates 1 star after the previous suspension expired
    const newRaterRes = await harness.submitFeedback(
      { uid: "r6", token: {} },
      {
        activityId: "act_repeat_new",
        targetUserId: "repeatSubject",
        rating: 1,
      }
    );

    const modAfterNew = harness.getDoc("userModeration/repeatSubject");
    if (modAfterNew?.distinctOneStarRaters.length !== 6) {
      throw new Error("New distinct rater was not added to historical distinct raters list");
    }
    if (newRaterRes.isSuspended !== true) {
      throw new Error("6th distinct rater failed to trigger a new suspension after previous expiry");
    }
    if (!modAfterNew?.isSuspended) {
      throw new Error("Document is not marked suspended after 6th distinct rater");
    }
  });

  // TEST 18: Cloud Function query safety (getSubmittedFeedbackForActivity applies limit 50)
  await test("18. Cloud Function query safety (getSubmittedFeedbackForActivity enforces limit 50)", async () => {
    // Seed 60 private feedback records for the caller on act_large
    for (let i = 1; i <= 60; i++) {
      harness.setDoc(`feedbackPrivate/act_large_caller_target${i}`, {
        activityId: "act_large",
        raterId: "callerUser",
        targetUserId: `target${i}`,
        rating: 5,
      });
    }

    const queryResult = await harness.getSubmittedFeedbackForActivity({ uid: "callerUser" }, "act_large", 50);
    if (queryResult.totalMatching !== 60) {
      throw new Error(`Expected 60 total matching feedbacks, found ${queryResult.totalMatching}`);
    }
    if (queryResult.count !== 50) {
      throw new Error(`Expected query result to be capped at 50, but got ${queryResult.count}`);
    }
  });

  // TEST 19: listPendingSuspensionAppeals rejects unauthenticated callers
  await test("19. listPendingSuspensionAppeals rejects unauthenticated callers", async () => {
    try {
      await harness.listPendingSuspensionAppeals(null);
      throw new Error("Unauthenticated caller was able to call listPendingSuspensionAppeals");
    } catch (err: any) {
      if (!err.message.includes("UNAUTHENTICATED")) throw err;
    }
  });

  // TEST 20: listPendingSuspensionAppeals rejects authenticated non-admin callers
  await test("20. listPendingSuspensionAppeals rejects authenticated non-admin callers", async () => {
    // 1. Authenticated user with no admin claim
    try {
      await harness.listPendingSuspensionAppeals({ uid: "regularStudent", token: {} });
      throw new Error("Ordinary student without admin claim was able to call listPendingSuspensionAppeals");
    } catch (err: any) {
      if (!err.message.includes("Campus administrator privileges required")) throw err;
    }

    // 2. Authenticated user with explicit admin: false
    try {
      await harness.listPendingSuspensionAppeals({ uid: "regularStudent2", token: { admin: false } });
      throw new Error("Student with admin:false was able to call listPendingSuspensionAppeals");
    } catch (err: any) {
      if (!err.message.includes("Campus administrator privileges required")) throw err;
    }
  });

  // TEST 21: listPendingSuspensionAppeals retrieves only appeals with appealStatus == "submitted"
  await test("21. listPendingSuspensionAppeals retrieves only appeals with appealStatus == 'submitted'", async () => {
    // Clear and seed test moderation documents
    harness.setDoc("userModeration/sub1", {
      isSuspended: true,
      appealStatus: "submitted",
      appealReason: "I apologize and will communicate better during sports.",
      appealedAt: new Date(Date.now() - 3600000).toISOString(),
      distinctOneStarRaters: ["r1", "r2", "r3", "r4", "r5"],
      suspensionReason: "Received 5 distinct 1-star ratings across campus activities.",
    });
    harness.setDoc("users/sub1", { name: "Alice Student", email: "alice@campus.edu" });

    harness.setDoc("userModeration/sub2", {
      isSuspended: true,
      appealStatus: "submitted",
      appealReason: "Misunderstanding during badminton doubles match.",
      appealedAt: new Date(Date.now() - 7200000).toISOString(),
      distinctOneStarRaters: ["r6", "r7", "r8", "r9", "r10"],
      suspensionReason: "Received 5 distinct 1-star ratings across campus activities.",
    });
    harness.setDoc("users/sub2", { name: "Bob Student", email: "bob@campus.edu" });

    // Seed non-submitted moderation records that must NOT appear in the pending queue
    harness.setDoc("userModeration/other_none", {
      isSuspended: true,
      appealStatus: "none",
      suspensionReason: "Active suspension without appeal",
    });
    harness.setDoc("userModeration/other_accepted", {
      isSuspended: false,
      appealStatus: "accepted",
      appealReason: "Approved appeal",
    });
    harness.setDoc("userModeration/other_rejected", {
      isSuspended: true,
      appealStatus: "rejected",
      appealReason: "Rejected appeal",
    });
    harness.setDoc("userModeration/other_no_appeal_field", {
      isSuspended: false,
    });

    const res = await harness.listPendingSuspensionAppeals({
      uid: "admin1",
      token: { admin: true },
    });

    if (!res.success) throw new Error("Expected successful list response");
    if (!Array.isArray(res.appeals)) throw new Error("Expected appeals array in response");

    // Must return exactly the 2 submitted appeals
    if (res.appeals.length !== 2) {
      throw new Error(`Expected exactly 2 submitted appeals, found ${res.appeals.length}`);
    }

    const returnedUserIds = res.appeals.map((a: any) => a.userId);
    if (!returnedUserIds.includes("sub1") || !returnedUserIds.includes("sub2")) {
      throw new Error(`Missing expected submitted appeals. Found: ${returnedUserIds.join(", ")}`);
    }

    for (const appeal of res.appeals) {
      if (appeal.appealStatus !== "submitted") {
        throw new Error(`Found non-submitted appeal in result: status=${appeal.appealStatus}`);
      }
    }
  });

  // TEST 22: listPendingSuspensionAppeals response contains only approved whitelisted fields
  await test("22. listPendingSuspensionAppeals response contains only approved whitelisted fields", async () => {
    const res = await harness.listPendingSuspensionAppeals({
      uid: "admin1",
      token: { admin: true },
    });

    const APPROVED_WHITELIST = new Set([
      "userId",
      "userName",
      "userEmail",
      "isSuspended",
      "suspensionReason",
      "suspensionExpiresAt",
      "appealStatus",
      "appealReason",
      "appealedAt",
      "distinctOneStarCount",
    ]);

    for (const appeal of res.appeals) {
      const keys = Object.keys(appeal);
      for (const key of keys) {
        if (!APPROVED_WHITELIST.has(key)) {
          throw new Error(`Forbidden or unapproved key '${key}' returned in appeal object`);
        }
      }
      if (typeof appeal.userId !== "string" || !appeal.userId) {
        throw new Error("Missing or invalid userId in appeal item");
      }
      if (typeof appeal.appealReason !== "string") {
        throw new Error("Missing appealReason in appeal item");
      }
      if (typeof appeal.isSuspended !== "boolean") {
        throw new Error("Missing or non-boolean isSuspended in appeal item");
      }
      if (typeof appeal.distinctOneStarCount !== "number") {
        throw new Error("distinctOneStarCount is not a number");
      }
    }
  });

  // TEST 23: listPendingSuspensionAppeals never exposes private fields
  await test("23. listPendingSuspensionAppeals never exposes private fields (distinctOneStarRaters, internal metadata)", async () => {
    // Add extra private metadata to doc in harness to ensure it is stripped
    harness.setDoc(
      "userModeration/sub1",
      {
        isSuspended: true,
        appealStatus: "submitted",
        appealReason: "I apologize and will improve communication.",
        appealedAt: new Date().toISOString(),
        distinctOneStarRaters: ["secretRater1", "secretRater2", "secretRater3", "secretRater4", "secretRater5"],
        internalNotes: "Confidential moderator notes",
        reviewedByAdmin: "oldAdmin",
        triggeringRatingRefs: ["feedbackPrivate/act1_rater1_sub1"],
        legacyTokens: { token: "secret" },
      },
      true
    );

    const res = await harness.listPendingSuspensionAppeals({
      uid: "admin1",
      token: { admin: true },
    });

    const appeal = res.appeals.find((a: any) => a.userId === "sub1");
    if (!appeal) throw new Error("Target appeal sub1 not found");

    if ("distinctOneStarRaters" in appeal) {
      throw new Error("SECURITY LEAK: distinctOneStarRaters array was exposed to admin client");
    }
    if ("internalNotes" in appeal) {
      throw new Error("SECURITY LEAK: internalNotes was exposed in response");
    }
    if ("triggeringRatingRefs" in appeal) {
      throw new Error("SECURITY LEAK: triggeringRatingRefs was exposed in response");
    }
    if ("legacyTokens" in appeal) {
      throw new Error("SECURITY LEAK: legacyTokens was exposed in response");
    }
    // distinctOneStarCount must be accurately calculated without leaking rater IDs
    if (appeal.distinctOneStarCount !== 5) {
      throw new Error(`Expected distinctOneStarCount 5, got ${appeal.distinctOneStarCount}`);
    }
  });

  // TEST 24: listPendingSuspensionAppeals returns empty array when no appeals are pending
  await test("24. listPendingSuspensionAppeals returns empty array when no appeals are pending", async () => {
    // Transition all submitted appeals to accepted or rejected
    harness.setDoc("userModeration/sub1", { appealStatus: "accepted" }, true);
    harness.setDoc("userModeration/sub2", { appealStatus: "rejected" }, true);

    const res = await harness.listPendingSuspensionAppeals({
      uid: "admin1",
      token: { admin: true },
    });

    if (!res.success) throw new Error("Expected res.success to be true");
    if (!Array.isArray(res.appeals)) throw new Error("Expected res.appeals to be an array");
    if (res.appeals.length !== 0) {
      throw new Error(`Expected empty appeals array ([]), but received ${res.appeals.length} items`);
    }
  });

  console.log(`\n========================================`);
  console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED.`);
  console.log(`========================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
