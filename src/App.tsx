/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { authService } from './services/authService';
import { activityFirestoreService, ActivitySubscriptionMeta } from './services/activityService';
import { matchRequestService } from './services/matchRequestService';
import { ActiveTab, Activity, ActivityCategory, MatchRequest, SkillLevel, UserProfile } from './types';
import { storageService } from './services/storageService';
import { collegeVerificationService } from './services/collegeVerificationService';
import { isActivityPast } from './utils/activityRetention';

import { Navbar } from './components/Navbar';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { CreateActivityScreen } from './screens/CreateActivityScreen';
import { ActivityDetailScreen } from './screens/ActivityDetailScreen';
import { FreeNowScreen } from './screens/FreeNowScreen';
import { MyActivitiesScreen } from './screens/MyActivitiesScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AdminAppealsScreen } from './screens/AdminAppealsScreen';
import { SuspensionNoticeBanner } from './components/SuspensionNoticeBanner';
import { feedbackService } from './services/feedbackService';
import { FEATURES } from './config/features';
import { SuspensionStatusInfo, UserModeration, UserReputation } from './types';
import { CheckCircle2, AlertCircle, Loader2, Mail, X } from 'lucide-react';

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authRefreshTick, setAuthRefreshTick] = useState<number>(0);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [profile, setProfile] = useState<UserProfile | null>(() => storageService.getProfile());
  const [realtimeActivities, setRealtimeActivities] = useState<Activity[]>([]);
  const [extraDiscoveryActivities, setExtraDiscoveryActivities] = useState<Activity[]>([]);
  const [extraUserActivities, setExtraUserActivities] = useState<Activity[]>([]);
  const [activityMeta, setActivityMeta] = useState<ActivitySubscriptionMeta | null>(null);
  const [isLoadingMoreDiscovery, setIsLoadingMoreDiscovery] = useState<boolean>(false);
  const [isLoadingMoreUser, setIsLoadingMoreUser] = useState<boolean>(false);
  const hasPaginatedDiscoveryRef = useRef<boolean>(false);
  const hasPaginatedUserRef = useRef<boolean>(false);
  const [activitiesLoaded, setActivitiesLoaded] = useState<boolean>(false);
  const [incomingMatchRequests, setIncomingMatchRequests] = useState<MatchRequest[]>([]);
  const [outgoingMatchRequests, setOutgoingMatchRequests] = useState<MatchRequest[]>([]);
  const [currentUserReputation, setCurrentUserReputation] = useState<UserReputation | null>(null);
  const [currentUserModeration, setCurrentUserModeration] = useState<UserModeration | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Views: 'welcome' | 'onboarding' | 'main'
  const [currentView, setCurrentView] = useState<'welcome' | 'onboarding' | 'main'>('welcome');
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  // Pre-fills
  const [createPrefill, setCreatePrefill] = useState<{
    suggestedNote?: string;
    venueHint?: string;
  } | null>(null);

  // Cross-browser email link verification confirmation modal state
  const [emailLinkModal, setEmailLinkModal] = useState<{
    open: boolean;
    email: string;
    error: string | null;
    isSubmitting: boolean;
  }>({
    open: false,
    email: '',
    error: null,
    isSubmitting: false,
  });

  // Global Toast Notification (timeout race guarded via ref)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(
    null
  );
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback(
    (message: string, type: 'success' | 'info' | 'error' = 'success') => {
      let cleanMsg = message;
      try {
        const parsed = JSON.parse(message);
        if (parsed?.error) cleanMsg = parsed.error;
      } catch {
        // not JSON
      }
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      setToast({ message: cleanMsg, type });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 4500);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Merge paginated older pages with live real-time snapshots (real-time wins on overlapping IDs)
  const activities = useMemo(() => {
    const merged = new Map<string, Activity>();
    extraDiscoveryActivities.forEach((act) => merged.set(act.id, act));
    extraUserActivities.forEach((act) => merged.set(act.id, act));
    realtimeActivities.forEach((act) => merged.set(act.id, act));
    return Array.from(merged.values()).sort((a, b) => {
      const timeA = new Date(a.dateTime).getTime() || 0;
      const timeB = new Date(b.dateTime).getTime() || 0;
      return timeA - timeB;
    });
  }, [realtimeActivities, extraDiscoveryActivities, extraUserActivities]);

  // Bounded real-time Firestore Activities Listeners (Discovery + Active User + Paginated History)
  useEffect(() => {
    hasPaginatedDiscoveryRef.current = false;
    hasPaginatedUserRef.current = false;

    if (!authUser) {
      setRealtimeActivities([]);
      setExtraDiscoveryActivities([]);
      setExtraUserActivities([]);
      setActivityMeta(null);
      setActivitiesLoaded(false);
      return;
    }

    setExtraDiscoveryActivities([]);
    setExtraUserActivities([]);

    const unsubscribe = activityFirestoreService.subscribeToDiscoveryAndUserActivities(
      authUser.uid,
      (cloudActivities) => {
        setRealtimeActivities(cloudActivities);
        setActivitiesLoaded(true);
      },
      (err) => {
        console.warn('Real-time activities subscription warning:', err);
        setActivitiesLoaded(true);
      },
      (meta) => {
        setActivityMeta((prev) => ({
          recentCutoffISO: meta.recentCutoffISO,
          hasMoreDiscovery:
            prev && hasPaginatedDiscoveryRef.current ? prev.hasMoreDiscovery : meta.hasMoreDiscovery,
          discoveryLastDoc:
            prev && hasPaginatedDiscoveryRef.current ? prev.discoveryLastDoc : meta.discoveryLastDoc,
          hasMoreUserHistory:
            prev && hasPaginatedUserRef.current ? prev.hasMoreUserHistory : meta.hasMoreUserHistory,
          userHistoryLastDoc:
            prev && hasPaginatedUserRef.current ? prev.userHistoryLastDoc : meta.userHistoryLastDoc,
        }));
      }
    );

    return () => {
      unsubscribe();
    };
  }, [authUser?.uid]);

  const handleLoadMoreDiscovery = async () => {
    if (!activityMeta?.discoveryLastDoc || !activityMeta.hasMoreDiscovery || isLoadingMoreDiscovery) {
      return;
    }
    setIsLoadingMoreDiscovery(true);
    try {
      const page = await activityFirestoreService.fetchMoreDiscoveryActivities(
        activityMeta.recentCutoffISO,
        activityMeta.discoveryLastDoc
      );
      hasPaginatedDiscoveryRef.current = true;
      setExtraDiscoveryActivities((prev) => [...prev, ...page.activities]);
      setActivityMeta((prev) =>
        prev
          ? {
              ...prev,
              discoveryLastDoc: page.lastDoc,
              hasMoreDiscovery: page.hasMore,
            }
          : prev
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Unable to load more activities.', 'error');
    } finally {
      setIsLoadingMoreDiscovery(false);
    }
  };

  const handleLoadMoreUserActivities = async () => {
    if (!authUser?.uid || !activityMeta?.userHistoryLastDoc || !activityMeta.hasMoreUserHistory || isLoadingMoreUser) {
      return;
    }
    setIsLoadingMoreUser(true);
    try {
      const page = await activityFirestoreService.fetchMoreUserActivities(
        authUser.uid,
        activityMeta.userHistoryLastDoc
      );
      hasPaginatedUserRef.current = true;
      setExtraUserActivities((prev) => [...prev, ...page.activities]);
      setActivityMeta((prev) =>
        prev
          ? {
              ...prev,
              userHistoryLastDoc: page.lastDoc,
              hasMoreUserHistory: page.hasMore,
            }
          : prev
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Unable to load older squads.', 'error');
    } finally {
      setIsLoadingMoreUser(false);
    }
  };

  // Real-time Incoming Match Requests Listener for Navbar & FreeNowScreen
  useEffect(() => {
    if (!authUser) {
      setIncomingMatchRequests([]);
      return;
    }

    const unsubscribe = matchRequestService.subscribeIncomingRequests(
      authUser.uid,
      (reqs) => {
        setIncomingMatchRequests(reqs);
      },
      (err) => {
        console.warn('Incoming match requests subscription warning:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [authUser?.uid]);

  // Real-time Outgoing Match Requests Listener for Requester & FreeNowScreen
  useEffect(() => {
    if (!authUser) {
      setOutgoingMatchRequests([]);
      return;
    }

    const unsubscribe = matchRequestService.subscribeOutgoingRequests(
      authUser.uid,
      (reqs) => {
        setOutgoingMatchRequests(reqs);
      },
      (err) => {
        console.warn('Outgoing match requests subscription notice:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [authUser?.uid]);

  // Auto-open Squad Chat ONLY for accepted requests linked to a live, non-ended 1-to-1 activity
  useEffect(() => {
    if (!authUser || !activitiesLoaded || outgoingMatchRequests.length === 0) return;

    const accepted = outgoingMatchRequests.find((r) => {
      if (r.status !== 'accepted' || !r.activityId) return false;
      const linkedAct = activities.find((a) => a.id === r.activityId);
      if (!linkedAct) return false;
      if (linkedAct.status !== 'active' || linkedAct.endedAt || isActivityPast(linkedAct)) {
        return false;
      }
      const navKey = `navigated_match_${r.id}`;
      return !localStorage.getItem(navKey);
    });

    if (accepted && accepted.activityId) {
      localStorage.setItem(`navigated_match_${accepted.id}`, 'true');
      showToast('Match request accepted! Entering Squad Chat...', 'success');
      setSelectedActivityId(accepted.activityId);
    }
  }, [authUser?.uid, activitiesLoaded, activities, outgoingMatchRequests]);

  // Real-time Reputation & Suspension Listener for Current User (V2 only)
  useEffect(() => {
    if (!authUser?.uid || !FEATURES.FEEDBACK_AND_APPEALS) {
      setCurrentUserReputation(null);
      setCurrentUserModeration(null);
      return;
    }

    const unsubRep = feedbackService.subscribeUserReputation(authUser.uid, (rep) => {
      setCurrentUserReputation(rep);
    });

    const unsubMod = feedbackService.subscribeUserModeration(
      authUser.uid,
      (mod) => {
        setCurrentUserModeration(mod);
      },
      (err) => {
        console.warn('User moderation subscription error:', err);
      }
    );

    return () => {
      unsubRep();
      unsubMod();
    };
  }, [authUser?.uid]);

  const currentUserSuspension: SuspensionStatusInfo = FEATURES.FEEDBACK_AND_APPEALS
    ? feedbackService.isSuspended(currentUserModeration || currentUserReputation)
    : { isSuspended: false };

  // Check custom claim admin on auth token
  useEffect(() => {
    if (!authUser) {
      setIsAdmin(false);
      return;
    }

    authUser
      .getIdTokenResult()
      .then((idTokenResult) => {
        setIsAdmin(idTokenResult.claims.admin === true);
      })
      .catch((err) => {
        console.warn('Failed to retrieve auth token claims:', err);
        setIsAdmin(false);
      });
  }, [authUser, authRefreshTick]);

  // Safe CGC Email Verification Link Handler
  // Never creates a duplicate account - strictly links credential to active authUser
  useEffect(() => {
    if (!collegeVerificationService.isIncomingVerificationLink()) return;

    if (!authUser) {
      showToast('Please sign in with your primary Google account first to complete campus email linking.', 'info');
      return;
    }

    collegeVerificationService.completeVerification().then(async (result) => {
      if (result.success) {
        showToast(`Campus email linked to your account: ${result.linkedEmail}`, 'success');
        try {
          await authUser.reload();
          setAuthUser(auth.currentUser);
          setAuthRefreshTick((t) => t + 1);
        } catch (e) {
          console.warn('Auth reload warning:', e);
        }
        setActiveTab('profile');
      } else if (result.code === 'EMAIL_REQUIRED') {
        setEmailLinkModal({
          open: true,
          email: '',
          error: null,
          isSubmitting: false,
        });
      } else if (result.code === 'NEED_LOGIN') {
        showToast(result.error || 'Please sign in first.', 'info');
      } else if (result.error) {
        if (result.code === 'EXPIRED' || result.code === 'COLLISION') {
          collegeVerificationService.clearIncomingVerificationUrl();
        }
        showToast(result.error, 'error');
      }
    });
  }, [authUser]);

  const handleConfirmCrossBrowserEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || emailLinkModal.isSubmitting) return;

    const clean = emailLinkModal.email.trim().toLowerCase();
    if (!collegeVerificationService.validateCgcEmail(clean)) {
      setEmailLinkModal((prev) => ({
        ...prev,
        error: 'Please enter the exact @cgcjhanjeri.in email address you used to request this link.',
      }));
      return;
    }

    setEmailLinkModal((prev) => ({ ...prev, isSubmitting: true, error: null }));
    const result = await collegeVerificationService.completeVerification(clean);
    if (result.success) {
      setEmailLinkModal({ open: false, email: '', error: null, isSubmitting: false });
      showToast(`Campus email linked to your account: ${result.linkedEmail}`, 'success');
      try {
        await authUser.reload();
        setAuthUser(auth.currentUser);
        setAuthRefreshTick((t) => t + 1);
      } catch (err) {
        console.warn('Auth reload warning:', err);
      }
      setActiveTab('profile');
    } else {
      if (result.code === 'EXPIRED' || result.code === 'COLLISION') {
        collegeVerificationService.clearIncomingVerificationUrl();
      }
      setEmailLinkModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: result.error || 'Unable to verify email link.',
      }));
    }
  };

  // Firebase Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthUser(firebaseUser);

      if (firebaseUser) {
        try {
          // Check if profile exists in Firestore
          const firestoreProfile = await authService.getUserProfile(firebaseUser.uid);

          if (firestoreProfile && firestoreProfile.isOnboarded) {
            // Returning user with completed profile
            setProfile(firestoreProfile);
            storageService.saveProfile(firestoreProfile);
            storageService.setOnboarded(true);
            setCurrentView('main');

            // Ensure public profile exists in /publicProfiles/{uid} for squad badges & chat
            authService.saveUserProfile(firestoreProfile).catch((err) => {
              console.warn('Public profile sync warning:', err);
            });
          } else {
            // New user or incomplete onboarding
            const initials =
              firebaseUser.displayName
                ? firebaseUser.displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()
                : 'ST';

            const newSkeletonProfile: UserProfile = {
              id: firebaseUser.uid,
              userId: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || 'Campus Student',
              year: '1st Year',
              bio: '',
              avatarColor: '#3A0F34',
              avatarInitials: initials,
              interests: ['Badminton', 'Coffee', 'Basketball'],
              skillLevels: { Badminton: 'Intermediate', Basketball: 'Beginner' },
              typicalAvailability: ['Afternoons (12PM - 5PM)', 'Evenings (5PM - 9PM)'],
              privacyPreferences: {
                showCollegeToCampusPeers: true,
                onlyMatchCompatibleSkills: false,
                allowDirectInvites: true,
              },
              freeUntil: null,
              freeStatusNote: null,
              isOnboarded: false,
              isSampleUser: false,
              createdAt: new Date().toISOString(),
            };

            setProfile(newSkeletonProfile);
            setCurrentView('onboarding');
          }
        } catch (err) {
          console.warn('Notice retrieving user profile from Firestore (falling back to cache):', err);
          const cached = storageService.getProfile();
          if (cached && cached.id === firebaseUser.uid) {
            setProfile(cached);
            setCurrentView('main');
          } else {
            setCurrentView('onboarding');
          }
        }
      } else {
        // Not authenticated
        setProfile(null);
        setCurrentView('welcome');
      }

      setIsAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute joined activities count for badge
  const joinedCount = profile
    ? activities.filter(
        (act) =>
          act.participantIds.includes(profile.id) &&
          act.hostId !== profile.id &&
          act.status !== 'cancelled'
      ).length
    : 0;

  const hostedCount = profile
    ? activities.filter(
        (act) => act.hostId === profile.id && act.status !== 'cancelled'
      ).length
    : 0;

  // Handlers
  const handleGoogleSignInSuccess = async (user: User) => {
    showToast(`Signed in with Google as ${user.email}! Loading profile...`, 'info');
  };

  const handleOnboardingComplete = async (updatedProfile: UserProfile) => {
    // Save to Firestore if authenticated
    if (authUser && updatedProfile.id === authUser.uid) {
      try {
        await authService.saveUserProfile(updatedProfile);
        showToast('Profile created and saved to Cloud Firestore!');
      } catch (err) {
        console.error('Error saving profile to Firestore:', err);
        showToast('Profile saved locally. Cloud sync pending.', 'info');
      }
    } else {
      showToast('Profile ready! Welcome to VibeMatch.');
    }

    storageService.saveProfile(updatedProfile);
    storageService.setOnboarded(true);
    setProfile(updatedProfile);
    setCurrentView('main');
    setActiveTab('discover');
  };

  const handleSignOut = async () => {
    const res = await authService.signOutUser();
    if (res.success) {
      storageService.clearAuthProfile();
      setAuthUser(null);
      setProfile(null);
      setCurrentView('welcome');
      showToast('Signed out of VibeMatch.', 'info');
    } else {
      showToast(res.error || 'Sign out failed.', 'error');
    }
  };

  const handleSelectActivity = (activity: Activity) => {
    setSelectedActivityId(activity.id);
  };

  const handleJoinActivity = async (activityId: string) => {
    if (!profile) return;
    const act = activities.find((a) => a.id === activityId);
    if (!act) return;

    try {
      if (FEATURES.FEEDBACK_AND_APPEALS) {
        const strictSusp = await feedbackService.getSuspensionStatusStrict(profile.id);
        if (strictSusp.isSuspended || currentUserSuspension.isSuspended) {
          const exp = strictSusp.expiresAt || currentUserSuspension.expiresAt;
          showToast(
            `Account suspended: You cannot join squads while under temporary suspension (expires ${
              exp ? new Date(exp).toLocaleDateString() : 'in 15 days'
            }).`,
            'error'
          );
          return;
        }
      }

      showToast('Securing your spot...', 'info');
      await activityFirestoreService.joinActivity(activityId, profile);
      showToast('You joined this squad! Welcome to the Squad Chat.', 'success');
      // Automatically open the existing Squad Chat / Activity Details screen
      setSelectedActivityId(activityId);
    } catch (err: unknown) {
      const errorObj = err as Error;
      let msg = errorObj?.message || 'Could not join activity.';
      if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
        msg = 'Unable to join: Cloud Firestore security rules must be reviewed and deployed for join actions.';
      } else {
        try {
          const parsed = JSON.parse(msg);
          if (parsed?.error) msg = parsed.error;
        } catch {
          // Keep raw message
        }
      }
      showToast(msg, 'error');
    }
  };

  const handleCreateActivitySubmit = async (data: {
    title: string;
    category: ActivityCategory;
    categoryGroup: 'sports' | 'social' | 'study';
    description: string;
    campus: string;
    venue: string;
    dateTime: string;
    durationMinutes: number;
    maxParticipants: number;
    skillLevel: SkillLevel;
  }) => {
    if (!profile || !authUser) {
      const msg = 'You must be signed in to create an activity.';
      showToast(msg, 'error');
      throw new Error(msg);
    }

    if (FEATURES.FEEDBACK_AND_APPEALS) {
      const strictSusp = await feedbackService.getSuspensionStatusStrict(authUser.uid);
      if (strictSusp.isSuspended || currentUserSuspension.isSuspended) {
        const exp = strictSusp.expiresAt || currentUserSuspension.expiresAt;
        const msg = `Account suspended: You cannot create squads while under temporary suspension (expires ${
          exp ? new Date(exp).toLocaleDateString() : 'in 15 days'
        }).`;
        showToast(msg, 'error');
        throw new Error(msg);
      }
    }

    const created = await activityFirestoreService.createActivity(data, profile);
    setCreatePrefill(null);
    setSelectedActivityId(created.id);
    setActiveTab('discover');
    showToast(`"${created.title}" published to Cloud Firestore! You are set as host.`);
  };

  const handleCreateWithStudent = (suggestedNote: string, venueHint: string) => {
    setCreatePrefill({ suggestedNote, venueHint });
    setSelectedActivityId(null);
    setActiveTab('create');
  };

  // Auth checking loading indicator
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#DDE3E8] dark:bg-[#0A0E17] flex flex-col items-center justify-center p-6 text-[#3A0F34] dark:text-slate-100 transition-colors">
        <div className="w-12 h-12 rounded-2xl bg-[#3A0F34] dark:bg-purple-950 flex items-center justify-center text-[#EAAA00] mb-4 shadow-lg border border-transparent dark:border-purple-800/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <h2 className="text-xl font-bold font-display text-[#3A0F34] dark:text-white">VibeMatch</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Connecting to Firebase Authentication...</p>
      </div>
    );
  }

  // Render Welcome or Onboarding
  if (currentView === 'welcome') {
    return (
      <WelcomeScreen
        onGoogleSignInSuccess={handleGoogleSignInSuccess}
        hasPendingVerificationLink={collegeVerificationService.isIncomingVerificationLink()}
      />
    );
  }

  if (currentView === 'onboarding') {
    const fallbackProfile: UserProfile = profile || {
      id: authUser?.uid || '',
      userId: authUser?.uid || '',
      email: authUser?.email || '',
      name: authUser?.displayName || 'Campus Student',
      year: '1st Year',
      bio: '',
      avatarColor: '#3A0F34',
      avatarInitials: 'ST',
      interests: ['Badminton', 'Coffee', 'Basketball'],
      skillLevels: { Badminton: 'Intermediate', Basketball: 'Beginner' },
      typicalAvailability: ['Afternoons (12PM - 5PM)', 'Evenings (5PM - 9PM)'],
      privacyPreferences: {
        showCollegeToCampusPeers: true,
        onlyMatchCompatibleSkills: false,
        allowDirectInvites: true,
      },
      freeUntil: null,
      freeStatusNote: null,
      isOnboarded: false,
      isSampleUser: false,
      createdAt: new Date().toISOString(),
    };

    return (
      <OnboardingScreen
        initialProfile={fallbackProfile}
        onComplete={handleOnboardingComplete}
        onCancel={() => {
          if (authUser) {
            handleSignOut();
          } else {
            setCurrentView('welcome');
          }
        }}
      />
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#DDE3E8] dark:bg-[#0A0E17] flex flex-col items-center justify-center p-6 text-[#3A0F34] dark:text-slate-100 transition-colors">
        <div className="w-12 h-12 rounded-2xl bg-[#3A0F34] dark:bg-purple-950 flex items-center justify-center text-[#EAAA00] mb-4 shadow-lg border border-transparent dark:border-purple-800/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <h2 className="text-xl font-bold font-display text-[#3A0F34] dark:text-white">VibeMatch</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#DDE3E8] dark:bg-[#0A0E17] text-[#3A0F34] dark:text-slate-100 flex flex-col selection:bg-[#EAAA00]/40 selection:text-[#3A0F34] dark:selection:text-[#EAAA00] transition-colors">
      {/* Top Header & Mobile Bottom Nav */}
      <Navbar
        currentTab={activeTab}
        onTabChange={(tab) => {
          setSelectedActivityId(null);
          setActiveTab(tab);
        }}
        profile={profile}
        joinedCount={joinedCount}
        incomingMatchRequestsCount={incomingMatchRequests.length}
        isAdmin={isAdmin}
      />

      {/* Global Suspension Banner (V2 only) */}
      {FEATURES.FEEDBACK_AND_APPEALS && currentUserSuspension.isSuspended && authUser && (
        <SuspensionNoticeBanner
          userId={authUser.uid}
          reason={currentUserSuspension.reason}
          expiresAt={currentUserSuspension.expiresAt}
          remainingDays={currentUserSuspension.remainingDays}
          appealStatus={currentUserSuspension.appealStatus}
        />
      )}

      {/* Toast Notification Banner */}
      {toast && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-16 sm:top-18 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-md px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top duration-200 border break-words"
          style={{
            backgroundColor:
              toast.type === 'error'
                ? '#FEE2E2'
                : toast.type === 'info'
                ? '#3A0F34'
                : '#EAAA00',
            color:
              toast.type === 'error'
                ? '#991B1B'
                : toast.type === 'info'
                ? '#FFFFFF'
                : '#240720',
            borderColor:
              toast.type === 'error'
                ? '#FCA5A5'
                : toast.type === 'info'
                ? '#52184A'
                : '#D69900',
          }}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
        </aside>
      )}

      {/* Main Content View Switcher */}
      <main className="flex-1 w-full">
        {selectedActivityId ? (
          <ActivityDetailScreen
            activityId={selectedActivityId}
            currentUser={profile}
            authUser={authUser}
            currentUserSuspension={currentUserSuspension}
            activities={activities}
            onBack={() => setSelectedActivityId(null)}
            onActivityUpdated={() => {}}
          />
        ) : activeTab === 'discover' ? (
          <DiscoverScreen
            activities={activities}
            currentUser={profile}
            onSelectActivity={handleSelectActivity}
            onJoinActivity={handleJoinActivity}
            onCreateActivity={() => setActiveTab('create')}
            hasMoreActivities={!!activityMeta?.hasMoreDiscovery}
            isLoadingMore={isLoadingMoreDiscovery}
            onLoadMore={handleLoadMoreDiscovery}
          />
        ) : activeTab === 'free_now' ? (
          <FreeNowScreen
            currentUser={profile}
            activities={activities}
            incomingRequests={incomingMatchRequests}
            outgoingRequests={outgoingMatchRequests}
            currentUserSuspension={currentUserSuspension}
            onToast={showToast}
            onProfileUpdated={() => {
              const updated = storageService.getProfile();
              if (updated) setProfile(updated);
            }}
            onCreateActivityWithStudent={handleCreateWithStudent}
            onSelectActivity={handleSelectActivity}
            onSelectActivityId={(id) => setSelectedActivityId(id)}
          />
        ) : activeTab === 'create' ? (
          <CreateActivityScreen
            currentUser={profile}
            currentUserSuspension={currentUserSuspension}
            prefill={createPrefill}
            onCreate={handleCreateActivitySubmit}
            onCancel={() => {
              setCreatePrefill(null);
              setActiveTab('discover');
            }}
          />
        ) : activeTab === 'my_activities' ? (
          <MyActivitiesScreen
            activities={activities}
            currentUser={profile}
            onSelectActivity={handleSelectActivity}
            onExplore={() => setActiveTab('discover')}
            onActivityUpdated={() => {}}
            hasMoreUserActivities={!!activityMeta?.hasMoreUserHistory}
            isLoadingMore={isLoadingMoreUser}
            onLoadMoreUserActivities={handleLoadMoreUserActivities}
          />
        ) : activeTab === 'admin_appeals' ? (
          <AdminAppealsScreen
            authUser={authUser}
            isAdmin={isAdmin}
            onBack={() => setActiveTab('profile')}
            onToast={showToast}
          />
        ) : (
          <ProfileScreen
            profile={profile}
            authUser={authUser}
            joinedCount={joinedCount}
            hostedCount={hostedCount}
            currentUserSuspension={currentUserSuspension}
            appealStatus={currentUserSuspension.appealStatus}
            isAdmin={isAdmin}
            onOpenAdminAppeals={() => setActiveTab('admin_appeals')}
            onRefreshAuthState={() => {
              setAuthUser(auth.currentUser);
              setAuthRefreshTick((t) => t + 1);
            }}
            onProfileUpdated={(up) => {
              setProfile(up);
              storageService.saveProfile(up);
            }}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      {/* Cross-Browser Campus Email Link Confirmation Modal */}
      {emailLinkModal.open && authUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#3A0F34] text-[#EAAA00] flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#3A0F34] dark:text-slate-100">
                    Confirm Campus Email to Link
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cross-browser email verification check
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  collegeVerificationService.clearIncomingVerificationUrl();
                  setEmailLinkModal({ open: false, email: '', error: null, isSubmitting: false });
                }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 cursor-pointer"
                aria-label="Cancel email linking"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCrossBrowserEmail} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1 leading-relaxed">
                <p>
                  Signed in as <strong className="text-[#3A0F34] dark:text-slate-100">{authUser.email || authUser.uid}</strong>.
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Because this link was opened in a different browser or cleared session, re-enter the exact <strong className="text-slate-700 dark:text-slate-200">@cgcjhanjeri.in</strong> email address you used to request it. Your existing account UID will be preserved.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider mb-1.5">
                  Campus Email Address
                </label>
                <input
                  type="email"
                  required
                  value={emailLinkModal.email}
                  onChange={(e) =>
                    setEmailLinkModal((prev) => ({ ...prev, email: e.target.value, error: null }))
                  }
                  placeholder="e.g. rollno.student@cgcjhanjeri.in"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>

              {emailLinkModal.error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{emailLinkModal.error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    collegeVerificationService.clearIncomingVerificationUrl();
                    setEmailLinkModal({ open: false, email: '', error: null, isSubmitting: false });
                  }}
                  className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    emailLinkModal.isSubmitting ||
                    !collegeVerificationService.validateCgcEmail(emailLinkModal.email)
                  }
                  className="py-2 px-4 rounded-xl text-xs font-bold bg-[#EAAA00] hover:bg-[#D69900] text-[#240720] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {emailLinkModal.isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Complete Email Link</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
