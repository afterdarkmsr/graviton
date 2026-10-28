/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, testConnection } from './lib/firebase';
import { authService } from './services/authService';
import { ActiveTab, Activity, ActivityCategory, SkillLevel, UserProfile } from './types';
import { storageService } from './services/storageService';
import { DEFAULT_DEMO_USER } from './data/seedData';
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
  const [profile, setProfile] = useState<UserProfile>(() => {
    return storageService.getProfile() || DEFAULT_DEMO_USER;
  });
  const [activities, setActivities] = useState<Activity[]>(() => storageService.getActivities());

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
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Sync activities and local state
  const syncData = () => {
    setActivities(storageService.getActivities());
  };

  // Initial connection test
  useEffect(() => {
    testConnection();
  }, []);

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
              college: 'Stanford University', // default placeholder for picker
              year: 'Sophomore',
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
          // If Firestore fails, check local cache
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
        const cached = storageService.getProfile();
        if (cached && cached.isSampleUser && storageService.isOnboarded()) {
          // User chose guest demo exploration
          setProfile(cached);
          setCurrentView('main');
        } else {
          setCurrentView('welcome');
        }
      }

      setIsAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute joined activities count for badge
  const joinedCount = activities.filter(
    (act) =>
      act.participantIds.includes(profile.id) &&
      act.hostId !== profile.id &&
      act.status !== 'cancelled'
  ).length;

  const hostedCount = activities.filter(
    (act) => act.hostId === profile.id && act.status !== 'cancelled'
  ).length;

  // Handlers
  const handleGoogleSignInSuccess = async (user: User) => {
    showToast(`Signed in with Google as ${user.email}! Loading profile...`, 'info');
  };

  const handleExploreDemo = () => {
    storageService.saveProfile(DEFAULT_DEMO_USER);
    storageService.setOnboarded(true);
    setProfile(DEFAULT_DEMO_USER);
    setCurrentView('main');
    showToast('Viewing sample Stanford campus activities as Guest Student Alex Chen.', 'info');
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
      showToast(`Profile ready! Welcome to ${updatedProfile.college}.`);
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
      setCurrentView('welcome');
      showToast('Signed out of VibeMatch.', 'info');
    } else {
      showToast(res.error || 'Sign out failed.', 'error');
    }
  };

  const handleSelectActivity = (activity: Activity) => {
    setSelectedActivityId(activity.id);
  };

  const handleJoinActivity = (activityId: string) => {
    const res = storageService.joinActivity(activityId, profile);
    if (res.success) {
      showToast('You joined this squad! Open squad chat to coordinate.');
      syncData();
    } else {
      showToast(res.error || 'Could not join activity.', 'error');
    }
  };

  const handleCreateActivitySubmit = (data: {
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
    const created = storageService.createActivity(data, profile);
    syncData();
    setSelectedActivityId(created.id);
    setActiveTab('discover');
    showToast(`"${created.title}" published! You are set as host.`);
  };

  const handleCreateWithStudent = (suggestedNote: string, venueHint: string) => {
    setCreatePrefill({ suggestedNote, venueHint });
    setSelectedActivityId(null);
    setActiveTab('create');
  };

  const handleResetData = () => {
    storageService.resetToSeedData();
    setProfile(DEFAULT_DEMO_USER);
    setActivities(storageService.getActivities());
    setSelectedActivityId(null);
    setActiveTab('discover');
    showToast('App reset to initial sample seed activities and messages.');
  };

  // Auth checking loading indicator
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#DDE3E8] flex flex-col items-center justify-center p-6 text-[#3A0F34]">
        <div className="w-12 h-12 rounded-2xl bg-[#3A0F34] flex items-center justify-center text-[#EAAA00] mb-4 shadow-lg">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <h2 className="text-xl font-bold font-display">VibeMatch</h2>
        <p className="text-xs text-slate-500 mt-1">Connecting to Firebase Authentication...</p>
      </div>
    );
  }

  // Render Welcome or Onboarding
  if (currentView === 'welcome') {
    return (
      <WelcomeScreen
        onGoogleSignInSuccess={handleGoogleSignInSuccess}
        onExploreDemo={handleExploreDemo}
      />
    );
  }

  if (currentView === 'onboarding') {
    return (
      <OnboardingScreen
        initialProfile={profile}
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

  return (
    <div className="min-h-screen bg-[#DDE3E8] flex flex-col selection:bg-[#EAAA00]/40 selection:text-[#3A0F34]">
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
            onBack={() => setSelectedActivityId(null)}
            onActivityUpdated={syncData}
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
            onProfileUpdated={() => {
              const updated = storageService.getProfile();
              if (updated) setProfile(updated);
              syncData();
            }}
            onCreateActivityWithStudent={handleCreateWithStudent}
            onSelectActivity={handleSelectActivity}
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
            onActivityUpdated={syncData}
          />
        ) : (
          <ProfileScreen
            profile={profile}
            joinedCount={joinedCount}
            hostedCount={hostedCount}
            onProfileUpdated={(up) => {
              setProfile(up);
              storageService.saveProfile(up);
              syncData();
            }}
            onResetData={handleResetData}
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
