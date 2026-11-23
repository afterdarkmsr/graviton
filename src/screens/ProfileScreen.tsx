import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { ActivityCategory, AvailabilitySlot, SkillLevel, UserProfile } from '../types';
import { CATEGORIES_CONFIG, STUDY_YEAR_OPTIONS } from '../data/seedData';
import { storageService } from '../services/storageService';
import { authService } from '../services/authService';
import { collegeVerificationService } from '../services/collegeVerificationService';
import {
  Edit3,
  RotateCcw,
  Shield,
  ShieldCheck,
  Check,
  Save,
  Lock,
  LogOut,
  CloudCheck,
  Mail,
  AlertCircle,
  Star,
  Tag,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { feedbackService } from '../services/feedbackService';
import { SuspensionAppealModal } from '../components/SuspensionAppealModal';
import { FEEDBACK_TAGS, UserReputation } from '../types';
import { FEATURES } from '../config/features';

interface ProfileScreenProps {
  profile: UserProfile;
  authUser?: User | null;
  joinedCount: number;
  hostedCount: number;
  currentUserSuspension?: {
    isSuspended: boolean;
    expiresAt?: string | null;
    reason?: string | null;
    remainingDays?: number;
    appealStatus?: 'none' | 'submitted' | 'rejected' | 'accepted';
  };
  appealStatus?: 'none' | 'submitted' | 'rejected' | 'accepted';
  isAdmin?: boolean;
  onOpenAdminAppeals?: () => void;
  onRefreshAuthState?: () => void;
  onProfileUpdated: (updated: UserProfile) => void;
  onSignOut: () => void;
}

const AVAILABILITY_OPTIONS: AvailabilitySlot[] = [
  'Mornings (8AM - 12PM)',
  'Afternoons (12PM - 5PM)',
  'Evenings (5PM - 9PM)',
  'Late Night (9PM+)',
  'Weekends',
];

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  authUser,
  joinedCount,
  hostedCount,
  currentUserSuspension,
  appealStatus,
  isAdmin = false,
  onOpenAdminAppeals,
  onRefreshAuthState,
  onProfileUpdated,
  onSignOut,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [year, setYear] = useState(profile.year);
  const [bio, setBio] = useState(profile.bio);
  const [interests, setInterests] = useState<ActivityCategory[]>(profile.interests);
  const [skillLevels, setSkillLevels] = useState<Partial<Record<ActivityCategory, SkillLevel>>>(
    profile.skillLevels || {}
  );
  const [typicalAvailability, setTypicalAvailability] = useState<AvailabilitySlot[]>(
    profile.typicalAvailability || []
  );
  const [privacyPreferences, setPrivacyPreferences] = useState(profile.privacyPreferences);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  const resetEditForm = () => {
    setName(profile.name);
    setYear(profile.year);
    setBio(profile.bio);
    setInterests(profile.interests);
    setSkillLevels(profile.skillLevels || {});
    setTypicalAvailability(profile.typicalAvailability || []);
    setPrivacyPreferences(profile.privacyPreferences);
    setProfileSaveError(null);
  };

  useEffect(() => {
    if (!isEditing) {
      setName(profile.name);
      setYear(profile.year);
      setBio(profile.bio);
      setInterests(profile.interests);
      setSkillLevels(profile.skillLevels || {});
      setTypicalAvailability(profile.typicalAvailability || []);
      setPrivacyPreferences(profile.privacyPreferences);
    }
  }, [profile, isEditing]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  // Reputation & Suspension state
  const [reputation, setReputation] = useState<UserReputation | null>(null);
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);

  useEffect(() => {
    if (!profile.id || !FEATURES.FEEDBACK_AND_APPEALS) {
      setReputation(null);
      return;
    }
    const unsub = feedbackService.subscribeUserReputation(profile.id, (rep) => {
      setReputation(rep);
    });
    return () => unsub();
  }, [profile.id]);

  const suspInfo = currentUserSuspension || feedbackService.isSuspended(reputation);
  const effectiveAppealStatus = appealStatus || currentUserSuspension?.appealStatus || suspInfo.appealStatus;

  // College Verification state (100% Optional)
  const [collegeEmailInput, setCollegeEmailInput] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSentEmail, setLinkSentEmail] = useState<string | null>(() =>
    collegeVerificationService.getPendingEmail()
  );
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isSkipped, setIsSkipped] = useState<boolean>(() =>
    collegeVerificationService.isDismissedByUser()
  );
  const [isCheckingLink, setIsCheckingLink] = useState(false);

  const verificationState = collegeVerificationService.getVerificationState(authUser || null);

  const handleSendVerification = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setVerificationError(null);

    const trimmed = collegeEmailInput.trim().toLowerCase();
    if (!collegeVerificationService.validateCgcEmail(trimmed)) {
      setVerificationError('Email must strictly end in @cgcjhanjeri.in');
      return;
    }

    setIsSendingLink(true);
    const res = await collegeVerificationService.sendVerificationLink(trimmed);
    setIsSendingLink(false);

    if (res.success) {
      setLinkSentEmail(trimmed);
      setVerificationError(null);
    } else {
      setVerificationError(res.error || 'Failed to send verification link.');
    }
  };

  const handleSkipVerification = () => {
    collegeVerificationService.setDismissedByUser(true);
    setIsSkipped(true);
  };

  const handleExpandVerification = () => {
    collegeVerificationService.setDismissedByUser(false);
    setIsSkipped(false);
  };

  const [manualLinkEmail, setManualLinkEmail] = useState('');
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  const handleRefreshVerification = async (overrideEmail?: string) => {
    setIsCheckingLink(true);
    setVerificationError(null);
    try {
      if (authUser) {
        await authUser.reload();
        onRefreshAuthState?.();
        // If there is an active verification link in URL, complete it
        if (collegeVerificationService.isIncomingVerificationLink()) {
          const result = await collegeVerificationService.completeVerification(overrideEmail);
          if (result.success) {
            setLinkSentEmail(null);
            setNeedsEmailConfirm(false);
            setManualLinkEmail('');
            await authUser.reload();
            onRefreshAuthState?.();
          } else if (result.code === 'EMAIL_REQUIRED') {
            setNeedsEmailConfirm(true);
            setVerificationError(
              'Because this link was opened in a different browser or cleared session, re-enter the exact @cgcjhanjeri.in email address you used to request it.'
            );
          } else if (result.error) {
            setVerificationError(result.error);
          }
        }
      }
    } catch (err: unknown) {
      console.warn('Verification reload error:', err);
      setVerificationError('Unable to refresh verification status. Please try again.');
    } finally {
      setIsCheckingLink(false);
    }
  };

  const toggleInterest = (category: ActivityCategory) => {
    if (interests.includes(category)) {
      setInterests((prev) => prev.filter((c) => c !== category));
      setSkillLevels((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
    } else {
      setInterests((prev) => [...prev, category]);
      const isSport = CATEGORIES_CONFIG.some((c) => c.category === category && c.group === 'sports');
      if (isSport) {
        setSkillLevels((prev) => ({
          ...prev,
          [category]: prev[category] || 'Casual',
        }));
      }
    }
  };

  const setSkill = (category: ActivityCategory, level: SkillLevel) => {
    setSkillLevels((prev) => ({ ...prev, [category]: level }));
  };

  const selectedSports = interests.filter((i) =>
    CATEGORIES_CONFIG.some((c) => c.category === i && c.group === 'sports')
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const initials =
      name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase() || 'ST';

    // Prune unselected sports from skillLevels to guarantee clean state
    const cleanedSkillLevels: Partial<Record<ActivityCategory, SkillLevel>> = {};
    interests.forEach((cat) => {
      if (skillLevels[cat]) {
        cleanedSkillLevels[cat] = skillLevels[cat];
      }
    });

    const updated: UserProfile = {
      ...profile,
      name: name.trim() || 'Campus Student',
      year,
      bio: bio.trim(),
      avatarInitials: initials,
      interests,
      skillLevels: cleanedSkillLevels,
      typicalAvailability,
      privacyPreferences,
      updatedAt: new Date().toISOString(),
    };

    setProfileSaveError(null);
    // Save to Firestore for authenticated user
    if (updated.id) {
      try {
        await authService.saveUserProfile(updated);
      } catch (err) {
        console.error('Could not sync profile to Firestore:', err);
        setProfileSaveError('Failed to save profile changes to Cloud Firestore. Please try again.');
        setIsSaving(false);
        return;
      }
    }

    storageService.saveProfile(updated);
    onProfileUpdated(updated);
    setIsSaving(false);
    setIsEditing(false);
    setSavedSuccess(true);
    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = window.setTimeout(() => {
      setSavedSuccess(false);
      savedTimerRef.current = null;
    }, 2500);
  };

  const handlePrivacyToggle = async (
    key: keyof UserProfile['privacyPreferences'],
    checked: boolean
  ) => {
    setProfileSaveError(null);
    const previousPrefs = privacyPreferences;
    const updatedPrefs = {
      ...privacyPreferences,
      [key]: checked,
    };
    setPrivacyPreferences(updatedPrefs);
    const newProf = { ...profile, privacyPreferences: updatedPrefs };

    if (newProf.id) {
      try {
        await authService.saveUserProfile(newProf);
      } catch (err) {
        console.error('Failed to update privacy setting in Firestore:', err);
        setPrivacyPreferences(previousPrefs);
        setProfileSaveError('Unable to update privacy setting in Cloud Firestore. Please check your connection and try again.');
        return;
      }
    }

    storageService.saveProfile(newProf);
    onProfileUpdated(newProf);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12 space-y-6">
      {/* Profile Header Banner */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 dark:border-slate-800 relative overflow-hidden">
        {/* Verification Status Pill */}
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-full text-xs text-emerald-800 dark:text-emerald-300 font-medium">
            <CloudCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold">Firebase Authenticated</span>
            <span aria-hidden="true">·</span>
            <span className="truncate max-w-[200px]">{profile.email || 'Google User'}</span>
          </div>

          <button
            onClick={onSignOut}
            className="py-1.5 px-3 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-900/60 transition-colors flex items-center gap-1.5"
            title="Sign out of VibeMatch"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-white text-xl sm:text-2xl font-black shadow-md shrink-0"
              style={{ backgroundColor: profile.avatarColor || '#3A0F34' }}
            >
              {profile.avatarInitials}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold font-display text-[#3A0F34] dark:text-slate-100">
                  {profile.name}
                </h1>
                {verificationState.isVerified ? (
                  <span className="text-[11px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/70 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>LINKED @CGCJHANJERI.IN</span>
                  </span>
                ) : (
                  <span className="text-[11px] bg-[#EAAA00]/20 text-[#240720] dark:text-[#EAAA00] px-2 py-0.5 rounded-md font-bold">
                    STUDENT
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                {profile.year}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md leading-relaxed">
                {profile.bio || 'No campus bio added yet.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              resetEditForm();
              setIsEditing((prev) => !prev);
            }}
            className="py-2 px-4 rounded-xl text-xs font-bold bg-[#3A0F34] hover:bg-[#52184A] dark:bg-[#EAAA00] dark:hover:bg-[#D69900] text-white dark:text-[#240720] shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Cancel Editing' : 'Edit Profile'}</span>
          </button>
        </div>

        {/* Stats Strip */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 bg-[#EEF3F7] dark:bg-slate-800/80 rounded-xl">
            <span className="text-lg sm:text-xl font-bold text-[#3A0F34] dark:text-slate-100 tabular-nums block">
              {joinedCount}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">
              Attending
            </span>
          </div>
          <div className="p-2.5 bg-[#EEF3F7] dark:bg-slate-800/80 rounded-xl">
            <span className="text-lg sm:text-xl font-bold text-[#3A0F34] dark:text-slate-100 tabular-nums block">
              {hostedCount}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">
              Hosted
            </span>
          </div>
          <div className="p-2.5 bg-[#FFF9EB] dark:bg-amber-950/30 rounded-xl border border-transparent dark:border-amber-900/40">
            <span className="text-lg sm:text-xl font-bold text-[#EAAA00] tabular-nums block">
              {profile.interests.length}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider font-medium">
              Campus Vibes
            </span>
          </div>
        </div>
      </section>

      {/* Success Notification */}
      {savedSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Profile saved and synced with Cloud Firestore!</span>
        </div>
      )}

      {profileSaveError && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>{profileSaveError}</span>
        </div>
      )}

      {/* Administrator Moderation Console Card */}
      {isAdmin && (
        <div className="p-5 bg-[#3A0F34]/5 dark:bg-[#3A0F34]/20 border border-[#3A0F34]/20 dark:border-[#EAAA00]/40 rounded-3xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#3A0F34] text-[#EAAA00] flex items-center justify-center shrink-0 shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#3A0F34] dark:text-[#EAAA00]">
                  Campus Administrator Console
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {FEATURES.FEEDBACK_AND_APPEALS
                    ? 'Verified moderation privileges active. Review student appeals and community safety reports.'
                    : 'Administrator privileges active. Review community safety reports submitted across campus activities.'}
                </p>
              </div>
            </div>

            {onOpenAdminAppeals && (
              <button
                type="button"
                onClick={onOpenAdminAppeals}
                className="py-2 px-4 bg-[#3A0F34] hover:bg-[#52184A] text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-[#EAAA00]" />
                <span>{FEATURES.FEEDBACK_AND_APPEALS ? 'Open Moderation Queue' : 'Open Safety Reports'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Suspension Alert Notice if User is Temporarily Suspended */}
      {FEATURES.FEEDBACK_AND_APPEALS && suspInfo.isSuspended && (
        <div className="p-5 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900/60 rounded-3xl space-y-3 animate-in fade-in">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-900 dark:text-red-200">
                  Account Temporarily Suspended ({suspInfo.remainingDays} days remaining)
                </h3>
                <p className="text-xs text-red-700 dark:text-red-300">
                  {suspInfo.reason || 'Temporary moderation restriction active.'}
                </p>
              </div>
            </div>

            {effectiveAppealStatus === 'submitted' ? (
              <span className="px-3 py-1 bg-red-200/80 dark:bg-red-900/60 text-red-900 dark:text-red-200 text-xs font-bold rounded-xl">
                Appeal Submitted
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setIsAppealModalOpen(true)}
                className="py-1.5 px-3.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Submit Appeal
              </button>
            )}
          </div>
          <p className="text-[11px] text-red-600 dark:text-red-400">
            While suspended, you can browse your profile but cannot create squads, join activities, or send match requests.
          </p>
        </div>
      )}

      {/* Campus Reputation & Feedback Section */}
      {FEATURES.FEEDBACK_AND_APPEALS && (
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 dark:border-slate-800 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#EAAA00] uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>Peer Accountability & Reputation</span>
            </div>
            <h2 className="text-xl font-bold font-display text-[#3A0F34] dark:text-slate-100">
              Campus Reputation & Feedback
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregated feedback from students who participated in squads with you.
            </p>
          </div>

          {reputation?.totalRatings ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FFF9EB] dark:bg-amber-950/40 border border-[#EAAA00]/40 rounded-xl">
              <Star className="w-4 h-4 fill-current text-[#EAAA00]" />
              <span className="text-sm font-extrabold text-[#3A0F34] dark:text-amber-200">
                {reputation.averageRating.toFixed(1)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ({reputation.totalRatings} {reputation.totalRatings === 1 ? 'rating' : 'ratings'})
              </span>
            </div>
          ) : null}
        </div>

        {/* Ratings Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-[#EEF3F7] dark:bg-slate-800/80 rounded-2xl">
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              Average Rating
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#3A0F34] dark:text-slate-100 font-display">
                {reputation?.averageRating ? reputation.averageRating.toFixed(1) : '—'}
              </span>
              <span className="text-xs text-slate-400">/ 5.0</span>
            </div>
            <div className="flex items-center gap-0.5 text-[#EAAA00] mt-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    (reputation?.averageRating || 0) >= s
                      ? 'fill-current text-[#EAAA00]'
                      : 'text-slate-300 dark:text-slate-600'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="p-4 bg-[#EEF3F7] dark:bg-slate-800/80 rounded-2xl">
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              Total Reviews
            </span>
            <span className="text-2xl font-black text-[#3A0F34] dark:text-slate-100 font-display block">
              {reputation?.totalRatings || 0}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1.5">
              From verified squad peers
            </span>
          </div>

          <div className="p-4 bg-[#EEF3F7] dark:bg-slate-800/80 rounded-2xl">
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              Community Status
            </span>
            <span
              className={`text-sm font-bold block ${
                suspInfo.isSuspended
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {suspInfo.isSuspended ? 'Temporarily Suspended' : 'Good Standing'}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1.5">
              {suspInfo.isSuspended
                ? `${suspInfo.remainingDays} days remaining`
                : 'Eligible for all squads'}
            </span>
          </div>
        </div>

        {/* Feedback Tags Breakdown */}
        <div>
          <h3 className="text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-[#EAAA00]" />
            <span>Received Feedback Tags</span>
          </h3>

          <div className="flex flex-wrap gap-2">
            {FEEDBACK_TAGS.map((tag) => {
              const count = reputation?.tagCounts?.[tag] || 0;
              const isNegative = tag === 'Unfriendly' || tag === 'Not Cooperative';
              return (
                <div
                  key={tag}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold ${
                    count > 0
                      ? isNegative
                        ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
                        : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <span>{tag}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 text-[11px] font-bold shadow-2xs">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Confidentiality Notice */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed flex items-center gap-2">
          <span>🔒</span>
          <span>
            Reviewer identities and individual written comments are strictly confidential and are never published on student profiles.
          </span>
        </div>
      </section>
      )}

      {/* Editing Form */}
      {isEditing ? (
        <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Edit3 className="w-4 h-4 text-[#EAAA00]" />
            <h2 className="text-base font-bold text-[#3A0F34] dark:text-slate-100">Edit Student Profile</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider mb-1.5">
                Year of Study
              </label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00]"
              >
                {year && !STUDY_YEAR_OPTIONS.includes(year as any) && (
                  <option value={year} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    {year} (Current)
                  </option>
                )}
                {STUDY_YEAR_OPTIONS.map((opt) => (
                  <option
                    key={opt}
                    value={opt}
                    className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider mb-1.5">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="Share your interests, sport paces, or campus schedule..."
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] resize-none"
            />
          </div>

          {/* Interests in editing */}
          <div>
            <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider mb-2">
              Campus Interests & Vibes
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES_CONFIG.map((c) => {
                const active = interests.includes(c.category);
                return (
                  <button
                    key={c.category}
                    type="button"
                    onClick={() => toggleInterest(c.category)}
                    className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      active
                        ? 'bg-[#3A0F34] dark:bg-[#EAAA00] text-white dark:text-[#240720] border-[#3A0F34] dark:border-[#EAAA00]'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span>{c.icon}</span>
                    <span className="truncate">{c.category}</span>
                  </button>
                );
              })}
            </div>

            {/* Dynamic sports skill level selectors in Edit Profile */}
            {selectedSports.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider">
                    Sports Skill Level (for fair matches)
                  </label>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {selectedSports.length} {selectedSports.length === 1 ? 'sport' : 'sports'} selected
                  </span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedSports.map((sport) => {
                    const icon = CATEGORIES_CONFIG.find((c) => c.category === sport)?.icon;
                    return (
                      <div
                        key={sport}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span className="text-base">{icon}</span>
                          <span>{sport}</span>
                        </span>
                        <div className="flex gap-1 flex-wrap">
                          {(['Beginner', 'Intermediate', 'Advanced', 'Casual'] as SkillLevel[]).map(
                            (lvl) => (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => setSkill(sport, lvl)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                  (skillLevels[sport] || 'Casual') === lvl
                                    ? 'bg-[#EAAA00] text-[#240720] font-bold shadow-xs'
                                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {lvl}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Availability in editing */}
          <div>
            <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider mb-2">
              Typical Availability
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY_OPTIONS.map((slot) => {
                const active = typicalAvailability.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      if (active) {
                        setTypicalAvailability(typicalAvailability.filter((s) => s !== slot));
                      } else {
                        setTypicalAvailability([...typicalAvailability, slot]);
                      }
                    }}
                    className={`py-1.5 px-3 rounded-xl border text-xs font-medium transition-colors ${
                      active
                        ? 'bg-[#EAAA00] text-[#240720] font-bold border-[#EAAA00]'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Save Buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                resetEditForm();
                setIsEditing(false);
              }}
              className="py-2 px-4 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="py-2 px-6 bg-[#EAAA00] hover:bg-[#D69900] text-[#240720] font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving to Firestore...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      ) : (
        /* View Mode Sections */
        <>
          {/* Optional CGC College Verification Section */}
          {verificationState.isVerified ? (
            <section className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/90 dark:border-emerald-900/60 rounded-3xl p-6 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">Linked @cgcjhanjeri.in Email</h2>
                      <span className="text-[10px] font-bold bg-emerald-200/70 dark:bg-emerald-900/70 text-emerald-900 dark:text-emerald-200 px-2 py-0.5 rounded-full">
                        EMAIL LINKED
                      </span>
                    </div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5 flex items-center gap-1.5 font-medium">
                      <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{verificationState.collegeEmail}</span>
                    </p>
                  </div>
                </div>

                <div className="text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-200/50 dark:border-emerald-900/60 self-start sm:self-auto font-medium">
                  Google UID Preserved · Optional Self-Link
                </div>
              </div>
              <p className="text-xs text-emerald-800/80 dark:text-emerald-300/90 leading-relaxed pt-2 border-t border-emerald-200/60 dark:border-emerald-900/50">
                Your @cgcjhanjeri.in email address is linked to this Firebase account while keeping your Google login and VibeMatch activities intact. Note: this optional step does not confirm official enrollment or enforce CGC-only access.
              </p>
            </section>
          ) : isSkipped ? (
            <section className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#3A0F34] dark:text-slate-100">Campus Email Link</span>
                    <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold px-2 py-0.5 rounded-full">
                      Optional
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Skipped for now — all VibeMatch features remain accessible.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleExpandVerification}
                className="py-1.5 px-3 rounded-xl text-xs font-bold text-[#3A0F34] dark:text-slate-100 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-colors shrink-0"
              >
                Link Email
              </button>
            </section>
          ) : (
            <section className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-[#3A0F34] flex items-center justify-center text-white shadow-xs shrink-0">
                    <Shield className="w-5 h-5 text-[#EAAA00]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-[#3A0F34] dark:text-slate-100">Link Campus Email (@cgcjhanjeri.in)</h2>
                      <span className="text-[10px] font-bold bg-[#EAAA00]/20 text-[#240720] dark:text-[#EAAA00] px-2 py-0.5 rounded-full">
                        Optional
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Optionally link your @cgcjhanjeri.in email address. Any Google account can currently access VibeMatch.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSkipVerification}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 transition-colors"
                >
                  Skip for Now
                </button>
              </div>

              {linkSentEmail ? (
                <div className="p-4 bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-2xl space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Mail className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs text-amber-950 dark:text-amber-200">
                      <span className="font-bold block">Email Link Dispatched</span>
                      <p className="leading-relaxed">
                        We sent a Firebase sign-in link to{' '}
                        <strong className="font-semibold text-amber-950 dark:text-amber-100">{linkSentEmail}</strong>.
                        Open the email and click the link to attach it to your account. If opened in another browser, you&apos;ll be asked to confirm this email address.
                      </p>
                    </div>
                  </div>

                  {needsEmailConfirm && (
                    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-amber-200/60 dark:border-amber-900/50">
                      <input
                        type="email"
                        value={manualLinkEmail}
                        onChange={(e) => setManualLinkEmail(e.target.value)}
                        placeholder="Re-enter your @cgcjhanjeri.in email"
                        className="flex-1 text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleRefreshVerification(manualLinkEmail)}
                        disabled={isCheckingLink || !collegeVerificationService.validateCgcEmail(manualLinkEmail)}
                        className="py-2 px-3.5 rounded-xl text-xs font-bold bg-[#3A0F34] text-white disabled:opacity-50"
                      >
                        Confirm & Link
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/60 dark:border-amber-900/50">
                    <button
                      type="button"
                      onClick={() => handleRefreshVerification()}
                      disabled={isCheckingLink}
                      className="py-1.5 px-3.5 rounded-xl text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${isCheckingLink ? 'animate-spin' : ''}`} />
                      <span>{isCheckingLink ? 'Checking...' : "I've Clicked the Link"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkSentEmail(null);
                        setVerificationError(null);
                      }}
                      className="py-1.5 px-3 rounded-xl text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                    >
                      Use Different Email
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipVerification}
                      className="py-1.5 px-3 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-auto transition-colors"
                    >
                      Skip for Now
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendVerification} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider mb-1.5">
                      CGC Campus Email Address
                    </label>
                    <input
                      type="email"
                      value={collegeEmailInput}
                      onChange={(e) => {
                        setCollegeEmailInput(e.target.value);
                        setVerificationError(null);
                      }}
                      placeholder="e.g. rollno.student@cgcjhanjeri.in"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#3A0F34]/20 dark:focus:ring-[#EAAA00]/30 focus:border-[#3A0F34] dark:focus:border-[#EAAA00]"
                    />
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Must end in <strong className="text-slate-700 dark:text-slate-200">@cgcjhanjeri.in</strong>
                      </span>
                      {collegeEmailInput && (
                        <span
                          className={`text-[11px] font-semibold ${
                            collegeVerificationService.validateCgcEmail(collegeEmailInput)
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {collegeVerificationService.validateCgcEmail(collegeEmailInput)
                            ? 'Valid CGC domain'
                            : 'Must end in @cgcjhanjeri.in'}
                        </span>
                      )}
                    </div>
                  </div>

                  {verificationError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                      <span>{verificationError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={handleSkipVerification}
                      className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                    >
                      Skip for Now
                    </button>
                    <button
                      type="submit"
                      disabled={isSendingLink || !collegeVerificationService.validateCgcEmail(collegeEmailInput)}
                      className="py-2 px-4 rounded-xl text-xs font-bold bg-[#3A0F34] hover:bg-[#52184A] dark:bg-[#EAAA00] dark:hover:bg-[#D69900] text-white dark:text-[#240720] shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{isSendingLink ? 'Sending Link...' : 'Send Verification Link'}</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-400 leading-relaxed">
                    <strong>Note:</strong> Verification does not change your Google login or account UID. Unverified students retain complete access to all app features.
                  </div>
                </form>
              )}
            </section>
          )}

          {/* Interests & Skill levels card */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#3A0F34] dark:text-slate-100 uppercase tracking-wider">
                My Campus Vibes & Skills
              </h2>
              <span className="text-xs text-slate-400 dark:text-slate-400">Used for deterministic matching</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {profile.interests.map((int) => {
                const skill = profile.skillLevels?.[int];
                return (
                  <div
                    key={int}
                    className="flex items-center gap-2 bg-[#EEF3F7] dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700 text-xs font-medium text-[#3A0F34] dark:text-slate-200"
                  >
                    <span>{int}</span>
                    {skill && (
                      <span className="text-[10px] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-md font-semibold">
                        {skill}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Typical Availability */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider block mb-2">
                Typical Availability Windows
              </span>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                {profile.typicalAvailability.map((slot) => (
                  <span
                    key={slot}
                    className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg font-medium border border-transparent dark:border-slate-700"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Privacy & Matching Preferences */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#3A0F34] dark:text-[#EAAA00]" />
              <h2 className="text-sm font-bold text-[#3A0F34] dark:text-slate-100 uppercase tracking-wider">
                Privacy & Campus Match Settings
              </h2>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#3A0F34] dark:text-slate-100 block">
                    Show university to campus peers
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Displays your college affiliation on activity cards.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={privacyPreferences.showCollegeToCampusPeers}
                  onChange={(e) => handlePrivacyToggle('showCollegeToCampusPeers', e.target.checked)}
                  className="w-4 h-4 text-[#3A0F34] rounded accent-[#3A0F34] dark:accent-[#EAAA00]"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#3A0F34] dark:text-slate-100 block">
                    Strict skill level matching
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Prioritize activities matching your exact badminton / sport tier.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={privacyPreferences.onlyMatchCompatibleSkills}
                  onChange={(e) => handlePrivacyToggle('onlyMatchCompatibleSkills', e.target.checked)}
                  className="w-4 h-4 text-[#3A0F34] rounded accent-[#3A0F34] dark:accent-[#EAAA00]"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#3A0F34] dark:text-slate-100 block">
                    Allow spontaneous meetup invites
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Permit campus peers to invite you when you broadcast Free Right Now.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={privacyPreferences.allowDirectInvites}
                  onChange={(e) => handlePrivacyToggle('allowDirectInvites', e.target.checked)}
                  className="w-4 h-4 text-[#3A0F34] rounded accent-[#3A0F34] dark:accent-[#EAAA00]"
                />
              </label>
            </div>
          </section>

          {/* Safety & Integrity Transparency Card */}
          <section className="bg-slate-100 dark:bg-slate-900/90 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-[#3A0F34] dark:text-[#EAAA00] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <span className="font-bold text-[#3A0F34] dark:text-slate-100 block">Safety & Integrity Transparency</span>
                <p>
                  VibeMatch uses named public campus venues. Any Google account can currently sign in; linking a @cgcjhanjeri.in email is optional and does not enforce CGC-only access or verify official enrollment until server-side domain enforcement is implemented. User profiles are secured in Firestore with user-level authorization rules.
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Suspension Appeal Modal */}
      {FEATURES.FEEDBACK_AND_APPEALS && (
        <SuspensionAppealModal
          isOpen={isAppealModalOpen}
          onClose={() => setIsAppealModalOpen(false)}
          userId={profile.id}
          onAppealSubmitted={() => {
            setIsAppealModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
