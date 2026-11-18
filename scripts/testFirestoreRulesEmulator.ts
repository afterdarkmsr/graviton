/**
 * Dedicated Firebase Emulator Security Rules Test Suite
 *
 * Executes against the ACTUAL Cloud Firestore Emulator running firestore.rules
 * using @firebase/rules-unit-testing.
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";
import * as path from "path";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, Timestamp, serverTimestamp } from "firebase/firestore";

const PROJECT_ID = "vibematch-emulator-test";

let testEnv: RulesTestEnvironment;

async function runEmulatorTestSuite() {
  console.log("=================================================================");
  console.log("FIRESTORE RULES REAL EMULATOR VERIFICATION SUITE");
  console.log("=================================================================\n");

  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: "127.0.0.1",
      port: 8080,
    },
  });

  let passed = 0;
  let failed = 0;

  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err?.message || err}`);
      failed++;
    }
  }

  // 1. Suspended user cannot create or join activities
  await check("1. Suspended user cannot create an activity (assertFails)", async () => {
    // Seed active suspension document
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "userModeration", "suspUser1"), {
        userId: "suspUser1",
        isSuspended: true,
        suspensionExpiresAt: Timestamp.fromMillis(Date.now() + 10 * 86400000),
      });
    });

    const suspDb = testEnv.authenticatedContext("suspUser1").firestore();
    const actRef = doc(suspDb, "activities", "act_susp_create");
    await assertFails(
      setDoc(actRef, {
        createdBy: "suspUser1",
        title: "Suspended Meetup",
        category: "Study",
        venue: "Campus Library",
        maxParticipants: 4,
        hostName: "Suspended Student",
        participantIds: ["suspUser1"],
        status: "active",
      })
    );
  });

  await check("2. Suspended user cannot join an active activity (assertFails)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "activities", "act_to_join"), {
        createdBy: "hostStudent1",
        title: "Campus Hangout",
        category: "Hangout",
        venue: "Student Center",
        dateTime: "2026-11-04T12:00:00.000Z",
        maxParticipants: 4,
        hostName: "Host Student",
        participantIds: ["hostStudent1"],
        status: "active",
      });
    });

    const suspDb = testEnv.authenticatedContext("suspUser1").firestore();
    const actRef = doc(suspDb, "activities", "act_to_join");
    await assertFails(
      updateDoc(actRef, {
        participantIds: ["hostStudent1", "suspUser1"],
        status: "active",
      })
    );
  });

  // 2. Expired suspension permits normal activity creation and joining
  await check("3. Expired suspension permits normal activity creation (assertSucceeds)", async () => {
    // Seed an expired suspension (expiresAt in the past)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "userModeration", "recoveringUser"), {
        userId: "recoveringUser",
        isSuspended: true, // flag present but expired
        suspensionExpiresAt: Timestamp.fromMillis(Date.now() - 2 * 86400000),
      });
    });

    const recDb = testEnv.authenticatedContext("recoveringUser").firestore();
    const actRef = doc(recDb, "activities", "act_recovered_create");
    await assertSucceeds(
      setDoc(actRef, {
        createdBy: "recoveringUser",
        title: "Recovered Student Event",
        category: "Sports",
        venue: "Sports Complex",
        maxParticipants: 4,
        hostName: "Recovered Student",
        participantIds: ["recoveringUser"],
        status: "active",
      })
    );
  });

  await check("4. Expired suspension permits normal activity joining (assertSucceeds)", async () => {
    const recDb = testEnv.authenticatedContext("recoveringUser").firestore();
    const actRef = doc(recDb, "activities", "act_to_join");
    await assertSucceeds(
      updateDoc(actRef, {
        participantIds: ["hostStudent1", "recoveringUser"],
        status: "active",
      })
    );
  });

  // 3. Suspended recipient cannot accept a wave but can decline it
  await check("5. Suspended recipient cannot accept a wave (assertFails)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "userModeration", "suspRecipient"), {
        userId: "suspRecipient",
        isSuspended: true,
        suspensionExpiresAt: Timestamp.fromMillis(Date.now() + 10 * 86400000),
      });
      await setDoc(doc(db, "waves", "wave_test_susp"), {
        senderUid: "activeSender",
        recipientUid: "suspRecipient",
        broadcastOwnerUid: "suspRecipient",
        activityInterest: "Study Session",
        status: "pending",
      });
    });

    const suspRecDb = testEnv.authenticatedContext("suspRecipient").firestore();
    const waveRef = doc(suspRecDb, "waves", "wave_test_susp");
    await assertFails(
      updateDoc(waveRef, {
        status: "accepted",
        chatId: "chat_123",
        updatedAt: Timestamp.now(),
      })
    );
  });

  await check("6. Suspended recipient can decline a wave (assertSucceeds)", async () => {
    const suspRecDb = testEnv.authenticatedContext("suspRecipient").firestore();
    const waveRef = doc(suspRecDb, "waves", "wave_test_susp");
    await assertSucceeds(
      updateDoc(waveRef, {
        status: "declined",
        updatedAt: Timestamp.now(),
      })
    );
  });

  // 4. Sender can cancel a pending wave
  await check("7. Sender can cancel a pending wave (assertSucceeds)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "waves", "wave_cancel_demo"), {
        senderUid: "activeSender",
        recipientUid: "someRecipient",
        broadcastOwnerUid: "someRecipient",
        activityInterest: "Gaming",
        status: "pending",
      });
    });

    const senderDb = testEnv.authenticatedContext("activeSender").firestore();
    const waveRef = doc(senderDb, "waves", "wave_cancel_demo");
    await assertSucceeds(
      updateDoc(waveRef, {
        status: "cancelled",
        updatedAt: Timestamp.now(),
      })
    );
  });

  await check("8. Non-sender / non-recipient cannot cancel or tamper wave (assertFails)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "waves", "wave_tamper_demo"), {
        senderUid: "activeSender",
        recipientUid: "someRecipient",
        broadcastOwnerUid: "someRecipient",
        activityInterest: "Gaming",
        status: "pending",
      });
    });

    const intruderDb = testEnv.authenticatedContext("intruderUser").firestore();
    const waveRef = doc(intruderDb, "waves", "wave_tamper_demo");
    await assertFails(
      updateDoc(waveRef, {
        status: "cancelled",
        updatedAt: Timestamp.now(),
      })
    );
  });

  // 5. Chat participants cannot modify participantUids
  await check("9. Chat participant can update lastMessageText and lastMessageAt (assertSucceeds)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "privateChats", "chat_room_1"), {
        participantUids: ["studentAlice", "studentBob"],
        activityInterest: "Project",
        lastMessageText: "Hello",
        lastMessageAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const aliceDb = testEnv.authenticatedContext("studentAlice").firestore();
    const chatRef = doc(aliceDb, "privateChats", "chat_room_1");
    await assertSucceeds(
      updateDoc(chatRef, {
        lastMessageText: "See you at 3pm",
        lastMessageAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    );
  });

  await check("10. Chat participant cannot modify participantUids (assertFails)", async () => {
    const aliceDb = testEnv.authenticatedContext("studentAlice").firestore();
    const chatRef = doc(aliceDb, "privateChats", "chat_room_1");
    await assertFails(
      updateDoc(chatRef, {
        participantUids: ["studentAlice", "studentCharlie"],
        lastMessageText: "Swapped member",
        lastMessageAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    );
  });

  // 6. Non-participants cannot access private chat messages
  await check("11. Chat participant can read private chat messages (assertSucceeds)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "privateChats", "chat_room_1", "messages", "msg_1"), {
        senderId: "studentBob",
        text: "Private project notes",
        senderName: "Bob",
      });
    });

    const aliceDb = testEnv.authenticatedContext("studentAlice").firestore();
    const msgRef = doc(aliceDb, "privateChats", "chat_room_1", "messages", "msg_1");
    await assertSucceeds(getDoc(msgRef));
  });

  await check("12. Non-participant cannot access private chat messages (assertFails)", async () => {
    const outsiderDb = testEnv.authenticatedContext("outsiderStudent").firestore();
    const msgRef = doc(outsiderDb, "privateChats", "chat_room_1", "messages", "msg_1");
    await assertFails(getDoc(msgRef));
  });

  // 7. Clients cannot read or write feedbackPrivate
  await check("13. Clients cannot read feedbackPrivate collection (assertFails)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "feedbackPrivate", "fp_doc_1"), {
        raterId: "studentAlice",
        targetUserId: "studentBob",
        rating: 5,
      });
    });

    const aliceDb = testEnv.authenticatedContext("studentAlice").firestore();
    const fpRef = doc(aliceDb, "feedbackPrivate", "fp_doc_1");
    await assertFails(getDoc(fpRef));
  });

  await check("14. Clients cannot write feedbackPrivate collection (assertFails)", async () => {
    const aliceDb = testEnv.authenticatedContext("studentAlice").firestore();
    const fpRef = doc(aliceDb, "feedbackPrivate", "fp_doc_hack");
    await assertFails(
      setDoc(fpRef, {
        raterId: "studentAlice",
        targetUserId: "studentBob",
        rating: 5,
      })
    );
  });

  // 8. Clients cannot write userReputations or userModeration
  await check("15. Clients cannot write userReputations (assertFails)", async () => {
    const aliceDb = testEnv.authenticatedContext("studentAlice").firestore();
    const repRef = doc(aliceDb, "userReputations", "studentBob");
    await assertFails(
      setDoc(repRef, {
        averageRating: 5.0,
        totalRatings: 100,
      })
    );
  });

  await check("16. Clients can read userReputations public aggregates (assertSucceeds)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "userReputations", "studentBob"), {
        userId: "studentBob",
        averageRating: 4.8,
        totalRatings: 12,
      });
    });

    const aliceDb = testEnv.authenticatedContext("studentAlice").firestore();
    const repRef = doc(aliceDb, "userReputations", "studentBob");
    await assertSucceeds(getDoc(repRef));
  });

  await check("17. Clients cannot write userModeration (assertFails)", async () => {
    const bobDb = testEnv.authenticatedContext("studentBob").firestore();
    const modRef = doc(bobDb, "userModeration", "studentBob");
    await assertFails(
      setDoc(modRef, {
        isSuspended: false,
      })
    );
  });

  // 9. Ordinary users cannot access another student's moderation document
  await check("18. Affected student can read their own userModeration doc (assertSucceeds)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "userModeration", "studentBob"), {
        userId: "studentBob",
        isSuspended: false,
      });
    });

    const bobDb = testEnv.authenticatedContext("studentBob").firestore();
    const modRef = doc(bobDb, "userModeration", "studentBob");
    await assertSucceeds(getDoc(modRef));
  });

  await check("19. Ordinary user cannot read another student's userModeration doc (assertFails)", async () => {
    const aliceDb = testEnv.authenticatedContext("studentAlice").firestore();
    const modRef = doc(aliceDb, "userModeration", "studentBob");
    await assertFails(getDoc(modRef));
  });

  // 10. Only authorized admins can read moderation records and review appeals
  await check("20. Authorized admin can read any student's userModeration doc (assertSucceeds)", async () => {
    const adminDb = testEnv
      .authenticatedContext("campusAdmin1", { admin: true })
      .firestore();
    const modRef = doc(adminDb, "userModeration", "studentBob");
    await assertSucceeds(getDoc(modRef));
  });

  await check("21. Authorized admin can list userModeration collection (assertSucceeds)", async () => {
    const adminDb = testEnv
      .authenticatedContext("campusAdmin1", { admin: true })
      .firestore();
    const colRef = collection(adminDb, "userModeration");
    await assertSucceeds(getDocs(colRef));
  });

  await check("22. Ordinary student cannot list userModeration collection (assertFails)", async () => {
    const aliceDb = testEnv.authenticatedContext("studentAlice").firestore();
    const colRef = collection(aliceDb, "userModeration");
    await assertFails(getDocs(colRef));
  });

  // 11. One-to-one activity end lifecycle checks in real emulator
  await check("23. 1-to-1 match end action allows host or requester with endedByUid (assertSucceeds)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "activities", "act_one_to_one"), {
        createdBy: "hostA",
        title: "1-on-1 Coffee",
        venue: "Campus Cafe",
        maxParticipants: 2,
        participantIds: ["hostA", "guestB"],
        isOneToOne: true,
        hostName: "Host A",
        status: "active",
      });
    });

    const hostDb = testEnv.authenticatedContext("hostA").firestore();
    const actRef = doc(hostDb, "activities", "act_one_to_one");
    await assertSucceeds(
      updateDoc(actRef, {
        status: "completed",
        endedAt: new Date().toISOString(),
        endedByUid: "hostA",
        updatedAt: new Date().toISOString(),
      })
    );
  });

  await check("24. 1-to-1 match end action rejects modifying already completed activity (assertFails)", async () => {
    const guestDb = testEnv.authenticatedContext("guestB").firestore();
    const actRef = doc(guestDb, "activities", "act_one_to_one");
    await assertFails(
      updateDoc(actRef, {
        status: "completed",
        endedAt: new Date().toISOString(),
        endedByUid: "guestB",
        updatedAt: new Date().toISOString(),
      })
    );
  });

  // 12. Activity create validation rules
  await check("25. Authenticated non-suspended student can create valid regular activity (assertSucceeds)", async () => {
    const hostDb = testEnv.authenticatedContext("hostStudent2").firestore();
    await assertSucceeds(
      setDoc(doc(hostDb, "activities", "act_valid_create"), {
        createdBy: "hostStudent2",
        title: "Evening Badminton Doubles",
        category: "Badminton",
        venue: "CGC Sports Complex",
        dateTime: "2026-11-10T17:00:00.000Z",
        maxParticipants: 4,
        hostName: "Host Two",
        participantIds: ["hostStudent2"],
        status: "active",
      })
    );
  });

  await check("26. Activity create rejects spoofed createdBy or invalid initial status/capacity (assertFails)", async () => {
    const attackerDb = testEnv.authenticatedContext("attacker1").firestore();
    await assertFails(
      setDoc(doc(attackerDb, "activities", "act_spoofed_host"), {
        createdBy: "hostStudent2",
        title: "Spoofed Event",
        category: "Study",
        venue: "Library",
        maxParticipants: 4,
        hostName: "Attacker",
        participantIds: ["hostStudent2"],
        status: "active",
      })
    );
    await assertFails(
      setDoc(doc(attackerDb, "activities", "act_bad_status"), {
        createdBy: "attacker1",
        title: "Pre-completed Event",
        category: "Study",
        venue: "Library",
        maxParticipants: 4,
        hostName: "Attacker",
        participantIds: ["attacker1"],
        status: "completed",
      })
    );
    await assertFails(
      setDoc(doc(attackerDb, "activities", "act_too_big"), {
        createdBy: "attacker1",
        title: "Huge Event",
        category: "Study",
        venue: "Library",
        maxParticipants: 51,
        hostName: "Attacker",
        participantIds: ["attacker1"],
        status: "active",
      })
    );
  });

  // 13. Activity join & leave transitions
  await check("27. Valid join transitions active->full at capacity and blocks further joins (assertSucceeds/assertFails)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "activities", "act_join_cap2"), {
        createdBy: "capHost",
        title: "2-Player Chess",
        category: "Chess",
        venue: "Student Lounge",
        dateTime: "2026-11-10T14:00:00.000Z",
        maxParticipants: 2,
        hostName: "Cap Host",
        participantIds: ["capHost"],
        status: "active",
      });
    });

    // Host cannot self-join
    const hostDb = testEnv.authenticatedContext("capHost").firestore();
    await assertFails(
      updateDoc(doc(hostDb, "activities", "act_join_cap2"), {
        participantIds: ["capHost", "capHost"],
        status: "full",
      })
    );

    // Non-host student joins and transitions status to 'full'
    const joinerDb = testEnv.authenticatedContext("joinerA").firestore();
    await assertSucceeds(
      updateDoc(doc(joinerDb, "activities", "act_join_cap2"), {
        participantIds: ["capHost", "joinerA"],
        status: "full",
      })
    );

    // Another student cannot join a 'full' activity
    const joinerBDb = testEnv.authenticatedContext("joinerB").firestore();
    await assertFails(
      updateDoc(doc(joinerBDb, "activities", "act_join_cap2"), {
        participantIds: ["capHost", "joinerA", "joinerB"],
        status: "full",
      })
    );
  });

  await check("28. Join rejects tampering with immutable fields like title (assertFails)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "activities", "act_join_immutable"), {
        createdBy: "immHost",
        title: "Original Squad",
        category: "Study",
        venue: "Block 3",
        dateTime: "2026-11-10T15:00:00.000Z",
        maxParticipants: 5,
        hostName: "Imm Host",
        participantIds: ["immHost"],
        status: "active",
      });
    });

    const joinerDb = testEnv.authenticatedContext("joinerA").firestore();
    await assertFails(
      updateDoc(doc(joinerDb, "activities", "act_join_immutable"), {
        participantIds: ["immHost", "joinerA"],
        status: "active",
        title: "Hijacked Title",
      })
    );
  });

  await check("29. Enrolled participant can leave a full activity restoring active; host and non-participant cannot leave", async () => {
    const joinerDb = testEnv.authenticatedContext("joinerA").firestore();
    await assertSucceeds(
      updateDoc(doc(joinerDb, "activities", "act_join_cap2"), {
        participantIds: ["capHost"],
        status: "active",
      })
    );

    // Non-participant cannot leave
    const outsiderDb = testEnv.authenticatedContext("outsider99").firestore();
    await assertFails(
      updateDoc(doc(outsiderDb, "activities", "act_join_cap2"), {
        participantIds: ["capHost"],
        status: "active",
      })
    );

    // Host cannot leave
    const hostDb = testEnv.authenticatedContext("capHost").firestore();
    await assertFails(
      updateDoc(doc(hostDb, "activities", "act_join_cap2"), {
        participantIds: [],
        status: "active",
      })
    );
  });

  // 14. Regular squad host completion rules (Path A of isValidHostUpdate)
  await check("30. Host can mark an active or overdue full regular squad completed with serverTimestamp (assertSucceeds)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "activities", "act_reg_active"), {
        createdBy: "regHost",
        title: "Group Study Session",
        category: "Study",
        venue: "Main Library",
        dateTime: "2026-11-01T10:00:00.000Z",
        maxParticipants: 4,
        hostName: "Reg Host",
        participantIds: ["regHost", "member1"],
        status: "active",
      });
      await setDoc(doc(db, "activities", "act_reg_full_overdue"), {
        createdBy: "regHost",
        title: "Overdue Full Badminton",
        category: "Badminton",
        venue: "Court 1",
        dateTime: "2026-11-01T08:00:00.000Z",
        maxParticipants: 2,
        hostName: "Reg Host",
        participantIds: ["regHost", "member1"],
        status: "full",
      });
    });

    const hostDb = testEnv.authenticatedContext("regHost").firestore();
    await assertSucceeds(
      updateDoc(doc(hostDb, "activities", "act_reg_active"), {
        status: "completed",
        completedAt: serverTimestamp(),
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      updateDoc(doc(hostDb, "activities", "act_reg_full_overdue"), {
        status: "completed",
        completedAt: serverTimestamp(),
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  await check("31. Non-host cannot complete regular squad; host cannot spoof timestamps or re-edit completed squad (assertFails)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "activities", "act_reg_guard"), {
        createdBy: "regHost2",
        title: "Coding Sprint",
        category: "Coding",
        venue: "Innovation Lab",
        dateTime: "2026-11-10T11:00:00.000Z",
        maxParticipants: 4,
        hostName: "Reg Host 2",
        participantIds: ["regHost2", "member2"],
        status: "active",
      });
    });

    // Enrolled non-host member cannot complete a regular (non-1to1) squad
    const memberDb = testEnv.authenticatedContext("member2").firestore();
    await assertFails(
      updateDoc(doc(memberDb, "activities", "act_reg_guard"), {
        status: "completed",
        completedAt: serverTimestamp(),
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Host cannot complete using client-side Timestamp instead of serverTimestamp() (request.time)
    const hostDb = testEnv.authenticatedContext("regHost2").firestore();
    await assertFails(
      updateDoc(doc(hostDb, "activities", "act_reg_guard"), {
        status: "completed",
        completedAt: Timestamp.fromMillis(Date.now() - 86400000),
        endedAt: Timestamp.fromMillis(Date.now() - 86400000),
        updatedAt: Timestamp.fromMillis(Date.now() - 86400000),
      })
    );

    // Host cannot mutate title/roster alongside completion
    await assertFails(
      updateDoc(doc(hostDb, "activities", "act_reg_guard"), {
        status: "completed",
        title: "Changed After Fact",
        completedAt: serverTimestamp(),
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Host cannot transition squad to invalid status (e.g. 'pending')
    await assertFails(
      updateDoc(doc(hostDb, "activities", "act_reg_guard"), {
        status: "pending",
        updatedAt: serverTimestamp(),
      })
    );

    // Host cannot complete without serverTimestamp on completedAt/updatedAt
    await assertFails(
      updateDoc(doc(hostDb, "activities", "act_reg_guard"), {
        status: "completed",
        updatedAt: serverTimestamp(),
      })
    );

    // Host cannot cancel using a client-spoofed cancelledAt timestamp
    await assertFails(
      updateDoc(doc(hostDb, "activities", "act_reg_guard"), {
        status: "cancelled",
        cancelledAt: Timestamp.fromMillis(Date.now() - 86400000),
        updatedAt: serverTimestamp(),
      })
    );

    // Host cannot re-open an already completed squad
    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext("regHost").firestore(), "activities", "act_reg_active"), {
        status: "active",
        updatedAt: serverTimestamp(),
      })
    );
  });

  // 15. matchRequests security rules
  await check("32. Non-suspended student can create valid matchRequest; suspended or spoofed requester fails", async () => {
    const reqDb = testEnv.authenticatedContext("reqUser1").firestore();
    await assertSucceeds(
      setDoc(doc(reqDb, "matchRequests", "mr_valid_1"), {
        hostUid: "hostUser1",
        requesterUid: "reqUser1",
        status: "pending",
        activityInterest: "Badminton",
        requesterName: "Req One",
        requesterYear: "3rd Year",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Self-request rejected
    await assertFails(
      setDoc(doc(reqDb, "matchRequests", "mr_self"), {
        hostUid: "reqUser1",
        requesterUid: "reqUser1",
        status: "pending",
        activityInterest: "Badminton",
        requesterName: "Req One",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Spoofed requesterUid rejected
    await assertFails(
      setDoc(doc(reqDb, "matchRequests", "mr_spoof"), {
        hostUid: "hostUser1",
        requesterUid: "someoneElse",
        status: "pending",
        activityInterest: "Badminton",
        requesterName: "Req One",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Suspended requester rejected
    const suspDb = testEnv.authenticatedContext("suspUser1").firestore();
    await assertFails(
      setDoc(doc(suspDb, "matchRequests", "mr_susp"), {
        hostUid: "hostUser1",
        requesterUid: "suspUser1",
        status: "pending",
        activityInterest: "Badminton",
        requesterName: "Susp One",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  await check("33. matchRequest transitions: requester cancels pending, host declines pending, requester cannot accept", async () => {
    const reqDb = testEnv.authenticatedContext("reqUser1").firestore();
    // Requester cannot self-accept
    await assertFails(
      updateDoc(doc(reqDb, "matchRequests", "mr_valid_1"), {
        status: "accepted",
        activityId: "fake_act",
        updatedAt: serverTimestamp(),
      })
    );

    // Requester can cancel pending
    await assertSucceeds(
      updateDoc(doc(reqDb, "matchRequests", "mr_valid_1"), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      })
    );

    // Seed another pending request for host decline
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "matchRequests", "mr_decline_1"), {
        hostUid: "hostUser1",
        requesterUid: "reqUser1",
        status: "pending",
        activityInterest: "Coffee",
        requesterName: "Req One",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const hostDb = testEnv.authenticatedContext("hostUser1").firestore();
    await assertSucceeds(
      updateDoc(doc(hostDb, "matchRequests", "mr_decline_1"), {
        status: "declined",
        updatedAt: serverTimestamp(),
      })
    );

    // Delete is denied
    await assertFails(deleteDoc(doc(hostDb, "matchRequests", "mr_decline_1")));
  });

  // 16. Safety /reports collection security rules
  await check("34. Signed-in student can submit valid open report for existing activity (assertSucceeds)", async () => {
    const reporterDb = testEnv.authenticatedContext("reporterA").firestore();
    await assertSucceeds(
      setDoc(doc(reporterDb, "reports", "rep_valid_1"), {
        activityId: "act_valid_create",
        activityTitle: "Evening Badminton Doubles",
        reporterUid: "reporterA",
        reason: "Spam or commercial",
        details: "Promotional links posted in description.",
        status: "open",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  await check("35. Report creation rejects spoofed reporter, missing activity, invalid status, or invalid reason (assertFails)", async () => {
    const reporterDb = testEnv.authenticatedContext("reporterA").firestore();
    // Spoofed reporterUid
    await assertFails(
      setDoc(doc(reporterDb, "reports", "rep_spoof"), {
        activityId: "act_valid_create",
        activityTitle: "Evening Badminton Doubles",
        reporterUid: "someoneElse",
        reason: "Harassment",
        details: "Test",
        status: "open",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Non-existent activityId
    await assertFails(
      setDoc(doc(reporterDb, "reports", "rep_missing_act"), {
        activityId: "non_existent_act_999",
        activityTitle: "Missing",
        reporterUid: "reporterA",
        reason: "Harassment",
        details: "Test",
        status: "open",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Initial status != open
    await assertFails(
      setDoc(doc(reporterDb, "reports", "rep_bad_status"), {
        activityId: "act_valid_create",
        activityTitle: "Evening Badminton Doubles",
        reporterUid: "reporterA",
        reason: "Harassment",
        details: "Test",
        status: "reviewed",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Invalid reason enum
    await assertFails(
      setDoc(doc(reporterDb, "reports", "rep_bad_reason"), {
        activityId: "act_valid_create",
        activityTitle: "Evening Badminton Doubles",
        reporterUid: "reporterA",
        reason: "MadeUpReason",
        details: "Test",
        status: "open",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  await check("36. Normal users (including reporter) cannot read, list, update, or delete /reports; admins can read and triage", async () => {
    const reporterDb = testEnv.authenticatedContext("reporterA").firestore();
    await assertFails(getDoc(doc(reporterDb, "reports", "rep_valid_1")));
    await assertFails(getDocs(collection(reporterDb, "reports")));
    await assertFails(
      updateDoc(doc(reporterDb, "reports", "rep_valid_1"), {
        status: "dismissed",
        reviewedByAdmin: "reporterA",
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(deleteDoc(doc(reporterDb, "reports", "rep_valid_1")));

    // Admin can get, list, and triage update
    const adminDb = testEnv.authenticatedContext("campusAdmin1", { admin: true }).firestore();
    await assertSucceeds(getDoc(doc(adminDb, "reports", "rep_valid_1")));
    await assertSucceeds(getDocs(collection(adminDb, "reports")));
    await assertSucceeds(
      updateDoc(doc(adminDb, "reports", "rep_valid_1"), {
        status: "reviewed",
        reviewedByAdmin: "campusAdmin1",
        reviewedAt: serverTimestamp(),
        adminNote: "Verified and actioned.",
        updatedAt: serverTimestamp(),
      })
    );
    // Admin cannot add unapproved shadow fields during report triage
    await assertFails(
      updateDoc(doc(adminDb, "reports", "rep_valid_1"), {
        status: "dismissed",
        reviewedByAdmin: "campusAdmin1",
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        extraField: true,
      })
    );
    // Admin cannot revert report status back to 'open'
    await assertFails(
      updateDoc(doc(adminDb, "reports", "rep_valid_1"), {
        status: "open",
        reviewedByAdmin: "campusAdmin1",
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    // Even admins cannot delete reports (audit trail preserved)
    await assertFails(deleteDoc(doc(adminDb, "reports", "rep_valid_1")));
  });

  console.log("\n=================================================================");
  console.log(`EMULATOR TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================\n");

  await testEnv.cleanup();

  if (failed > 0) {
    process.exit(1);
  }
}

runEmulatorTestSuite().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
