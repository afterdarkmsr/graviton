/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { authService } from './services/authService';
import { activityFirestoreService } from './services/activityService';
import { matchRequestService } from './services/matchRequestService';
import { ActiveTab, Activity, ActivityCategory, MatchRequest, SkillLevel, UserProfile } from './types';
import { storageService } from './services/storageService';
import { collegeVerificationService } from './services/collegeVerificationService';

import { Navbar } from './components/Navbar';
import { RescueMeModal } from './components/RescueMeModal';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { CreateActivityScreen } from './screens/CreateActivityScreen';
import { ActivityDetailScreen } from './screens/ActivityDetailScreen';
import { FreeNowScreen } from './screens/FreeNowScreen';
import { MyActivitiesScreen } from './screens/MyActivitiesScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [profile, setProfile] = useState<UserProfile | null>(() => storageService.getProfile());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [incomingMatchRequests, setIncomingMatchRequests] = useState<MatchRequest[]>([]);

  // Views: 'welcome' | 'onboarding' | 'main'
  const [currentView, setCurrentView] = useState<'welcome' | 'onboarding' | 'main'>('welcome');
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  // Modals & Pre-fills
  const [isRescueModalOpen, setIsRescueModalOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<{
    suggestedNote?: string;
    venueHint?: string;
  } | null>(null);

  // Global Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(
    null
  );

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    let cleanMsg = message;
    try {
      const parsed = JSON.parse(message);
      if (parsed?.error) cleanMsg = parsed.error;
    } catch {
      // not JSON
    }
    setToast({ message: cleanMsg, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Real-time Firestore Activities Listener (cleaned up on unmount or sign-out)
  useEffect(() => {
    if (!authUser) {
      setActivities([]);
      return;
    }

    const unsubscribe = activityFirestoreService.subscribeToActivities(
      (cloudActivities) => {
        setActivities(cloudActivities);
      },
      (err) => {
        console.warn('Real-time activities subscription warning:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [authUser]);

  // Real-time Incoming Match Requests Listener for Navbar Notification Badge
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
  }, [authUser]);

  // Real-time Outgoing Match Requests Listener for Requester Direct Chat Navigation
  useEffect(() => {
    if (!authUser) return;

    const unsubscribe = matchRequestService.subscribeOutgoingRequests(
      authUser.uid,
      (reqs) => {
        const accepted = reqs.find((r) => r.status === 'accepted' && r.activityId);
        if (accepted && accepted.activityId) {
          const navKey = `navigated_match_${accepted.id}`;
          if (!sessionStorage.getItem(navKey)) {
            sessionStorage.setItem(navKey, 'true');
            showToast('Match request accepted! Entering Squad Chat...', 'success');
            setSelectedActivityId(accepted.activityId);
          }
        }
      },
      (err) => {
        console.warn('Outgoing match requests subscription notice:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [authUser]);


  // Safe CGC Email Verification Link Handler
  // Never creates a duplicate account - strictly links credential to active authUser
  useEffect(() => {
    if (!collegeVerificationService.isIncomingVerificationLink()) return;

    if (!authUser) {
      showToast('Please sign in with your primary Google account first to complete college verification.', 'info');
      return;
    }

    collegeVerificationService.completeVerification().then(async (result) => {
      if (result.success) {
        showToast(`CGC college email verified: ${result.linkedEmail}`, 'success');
        try {
          await authUser.reload();
          setAuthUser({ ...auth.currentUser! });
        } catch (e) {
          console.warn('Auth reload warning:', e);
        }
        setActiveTab('profile');
      } else if (result.code === 'NEED_LOGIN') {
        showToast(result.error || 'Please sign in first.', 'info');
      } else if (result.error) {
        showToast(result.error, 'error');
      }
    });
  }, [authUser]);

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
          console.error('Failed to retrieve user profile from Firestore:', err);
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
      showToast('You must be signed in to create an activity.', 'error');
      return;
    }
    const created = await activityFirestoreService.createActivity(data, profile);
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
        onOpenRescueModal={() => setIsRescueModalOpen(true)}
        incomingMatchRequestsCount={incomingMatchRequests.length}
      />

      {/* Toast Notification Banner */}
      {toast && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-18 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top duration-200 border"
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
          <span>{toast.message}</span>
        </aside>
      )}

      {/* Main Content View Switcher */}
      <main className="flex-1 w-full">
        {selectedActivityId ? (
          <ActivityDetailScreen
            activityId={selectedActivityId}
            currentUser={profile}
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
            onOpenRescueModal={() => setIsRescueModalOpen(true)}
            onCreateActivity={() => setActiveTab('create')}
          />
        ) : activeTab === 'free_now' ? (
          <FreeNowScreen
            currentUser={profile}
            activities={activities}
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
            prefill={createPrefill}
            onCreate={(data) => {
              setCreatePrefill(null);
              handleCreateActivitySubmit(data);
            }}
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
          />
        ) : (
          <ProfileScreen
            profile={profile}
            authUser={authUser}
            joinedCount={joinedCount}
            hostedCount={hostedCount}
            onProfileUpdated={(up) => {
              setProfile(up);
              storageService.saveProfile(up);
            }}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      {/* Signature Feature Modal: Rescue Me From Boredom */}
      <RescueMeModal
        isOpen={isRescueModalOpen}
        onClose={() => setIsRescueModalOpen(false)}
        profile={profile}
        activities={activities}
        onSelectActivity={(act) => {
          setSelectedActivityId(act.id);
        }}
        onJoinActivity={handleJoinActivity}
        onCreateActivity={() => {
          setSelectedActivityId(null);
          setActiveTab('create');
        }}
      />
    </div>
  );
}
