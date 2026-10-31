import React, { useState } from 'react';
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
} from 'lucide-react';

interface ProfileScreenProps {
  profile: UserProfile;
  authUser?: User | null;
  joinedCount: number;
  hostedCount: number;
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
  const [isSaving, setIsSaving] = useState(false);

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

  const handleRefreshVerification = async () => {
    setIsCheckingLink(true);
    setVerificationError(null);
    try {
      if (authUser) {
        await authUser.reload();
        // If there is an active verification link in URL, complete it
        if (collegeVerificationService.isIncomingVerificationLink()) {
          const result = await collegeVerificationService.completeVerification();
          if (result.success) {
            setLinkSentEmail(null);
          } else if (result.error) {
            setVerificationError(result.error);
          }
        }
      }
    } catch (err: unknown) {
      console.warn('Verification reload error:', err);
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

    // Save to Firestore for authenticated user
    if (updated.id) {
      try {
        await authService.saveUserProfile(updated);
      } catch (err) {
        console.warn('Could not sync to Firestore:', err);
      }
    }

    storageService.saveProfile(updated);
    onProfileUpdated(updated);
    setIsSaving(false);
    setIsEditing(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12 space-y-6">
      {/* Profile Header Banner */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 relative overflow-hidden">
        {/* Verification Status Pill */}
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-800 font-medium">
            <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-semibold">Firebase Authenticated</span>
            <span aria-hidden="true">·</span>
            <span className="truncate max-w-[200px]">{profile.email || 'Google User'}</span>
          </div>

          <button
            onClick={onSignOut}
            className="py-1.5 px-3 rounded-xl text-xs font-semibold text-slate-500 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-colors flex items-center gap-1.5"
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
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold font-display text-[#3A0F34]">
                  {profile.name}
                </h1>
                {verificationState.isVerified ? (
                  <span className="text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>VERIFIED CGC STUDENT</span>
                  </span>
                ) : (
                  <span className="text-[11px] bg-[#EAAA00]/20 text-[#240720] px-2 py-0.5 rounded-md font-bold">
                    STUDENT
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">
                {profile.year}
              </p>
              <p className="text-xs text-slate-500 mt-2 max-w-md leading-relaxed">
                {profile.bio || 'No campus bio added yet.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsEditing(!isEditing)}
            className="py-2 px-4 rounded-xl text-xs font-bold bg-[#3A0F34] hover:bg-[#52184A] text-white shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Cancel Editing' : 'Edit Profile'}</span>
          </button>
        </div>

        {/* Stats Strip */}
        <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 bg-[#EEF3F7] rounded-xl">
            <span className="text-lg sm:text-xl font-bold text-[#3A0F34] tabular-nums block">
              {joinedCount}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider font-medium">
              Attending
            </span>
          </div>
          <div className="p-2.5 bg-[#EEF3F7] rounded-xl">
            <span className="text-lg sm:text-xl font-bold text-[#3A0F34] tabular-nums block">
              {hostedCount}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider font-medium">
              Hosted
            </span>
          </div>
          <div className="p-2.5 bg-[#FFF9EB] rounded-xl">
            <span className="text-lg sm:text-xl font-bold text-[#EAAA00] tabular-nums block">
              {profile.interests.length}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-600 uppercase tracking-wider font-medium">
              Campus Vibes
            </span>
          </div>
        </div>
      </section>

      {/* Success Notification */}
      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Profile saved and synced with Cloud Firestore!</span>
        </div>
      )}

      {/* Editing Form */}
      {isEditing ? (
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Edit3 className="w-4 h-4 text-[#EAAA00]" />
            <h2 className="text-base font-bold text-[#3A0F34]">Edit Student Profile</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
                Year of Study
              </label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34]"
              >
                {year && !STUDY_YEAR_OPTIONS.includes(year as any) && (
                  <option value={year}>{year} (Current)</option>
                )}
                {STUDY_YEAR_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="Share your interests, sport paces, or campus schedule..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] resize-none"
            />
          </div>

          {/* Interests in editing */}
          <div>
            <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-2">
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
                        ? 'bg-[#3A0F34] text-white border-[#3A0F34]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
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
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider">
                    Sports Skill Level (for fair matches)
                  </label>
                  <span className="text-[11px] font-medium text-slate-500">
                    {selectedSports.length} {selectedSports.length === 1 ? 'sport' : 'sports'} selected
                  </span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedSports.map((sport) => {
                    const icon = CATEGORIES_CONFIG.find((c) => c.category === sport)?.icon;
                    return (
                      <div
                        key={sport}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                      >
                        <span className="font-semibold text-slate-800 flex items-center gap-1.5">
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
                                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
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
            <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-2">
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
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Save Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="py-2 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
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
            <section className="bg-emerald-50/80 border border-emerald-200/90 rounded-3xl p-6 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-emerald-950">Verified CGC Student</h2>
                      <span className="text-[10px] font-bold bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded-full">
                        AUTHENTICATED
                      </span>
                    </div>
                    <p className="text-xs text-emerald-700 mt-0.5 flex items-center gap-1.5 font-medium">
                      <Mail className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{verificationState.collegeEmail}</span>
                    </p>
                  </div>
                </div>

                <div className="text-[11px] text-emerald-800 bg-emerald-100/70 px-3 py-1.5 rounded-xl border border-emerald-200/50 self-start sm:self-auto font-medium">
                  Google UID Preserved · Ownership Confirmed
                </div>
              </div>
              <p className="text-xs text-emerald-800/80 leading-relaxed pt-2 border-t border-emerald-200/60">
                Your campus email ownership has been verified directly via Firebase Auth. Your primary Google login and all VibeMatch activities remain intact.
              </p>
            </section>
          ) : isSkipped ? (
            <section className="bg-slate-50 border border-slate-200 rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#3A0F34]">CGC College Verification</span>
                    <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
                      Optional
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Skipped for now — all VibeMatch features remain fully accessible.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleExpandVerification}
                className="py-1.5 px-3 rounded-xl text-xs font-bold text-[#3A0F34] bg-white hover:bg-slate-100 border border-slate-300 transition-colors shrink-0"
              >
                Verify Now
              </button>
            </section>
          ) : (
            <section className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-[#3A0F34] flex items-center justify-center text-white shadow-xs shrink-0">
                    <Shield className="w-5 h-5 text-[#EAAA00]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-[#3A0F34]">Verify CGC College Email</h2>
                      <span className="text-[10px] font-bold bg-[#EAAA00]/20 text-[#240720] px-2 py-0.5 rounded-full">
                        Optional
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Confirm official enrollment with your @cgcjhanjeri.in address.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSkipVerification}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600 px-2 py-1 transition-colors"
                >
                  Skip for Now
                </button>
              </div>

              {linkSentEmail ? (
                <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Mail className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs text-amber-950">
                      <span className="font-bold block">Verification Link Dispatched</span>
                      <p className="leading-relaxed">
                        We sent a genuine Firebase sign-in verification link to{' '}
                        <strong className="font-semibold text-amber-950">{linkSentEmail}</strong>.
                        Open the email in your college inbox and click the link to confirm ownership.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/60">
                    <button
                      type="button"
                      onClick={handleRefreshVerification}
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
                      className="py-1.5 px-3 rounded-xl text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                    >
                      Use Different Email
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipVerification}
                      className="py-1.5 px-3 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 ml-auto transition-colors"
                    >
                      Skip for Now
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendVerification} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
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
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#3A0F34]/20 focus:border-[#3A0F34]"
                    />
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] text-slate-500">
                        Must end in <strong className="text-slate-700">@cgcjhanjeri.in</strong>
                      </span>
                      {collegeEmailInput && (
                        <span
                          className={`text-[11px] font-semibold ${
                            collegeVerificationService.validateCgcEmail(collegeEmailInput)
                              ? 'text-emerald-600'
                              : 'text-amber-600'
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
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{verificationError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={handleSkipVerification}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Skip for Now
                    </button>
                    <button
                      type="submit"
                      disabled={isSendingLink || !collegeVerificationService.validateCgcEmail(collegeEmailInput)}
                      className="py-2 px-4 rounded-xl text-xs font-bold bg-[#3A0F34] hover:bg-[#52184A] text-white shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{isSendingLink ? 'Sending Link...' : 'Send Verification Link'}</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
                    <strong>Note:</strong> Verification does not change your Google login or account UID. Unverified students retain complete access to all app features.
                  </div>
                </form>
              )}
            </section>
          )}

          {/* Interests & Skill levels card */}
          <section className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#3A0F34] uppercase tracking-wider">
                My Campus Vibes & Skills
              </h2>
              <span className="text-xs text-slate-400">Used for deterministic matching</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {profile.interests.map((int) => {
                const skill = profile.skillLevels?.[int];
                return (
                  <div
                    key={int}
                    className="flex items-center gap-2 bg-[#EEF3F7] px-3 py-1.5 rounded-xl border border-slate-200/60 text-xs font-medium text-[#3A0F34]"
                  >
                    <span>{int}</span>
                    {skill && (
                      <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded-md font-semibold">
                        {skill}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Typical Availability */}
            <div className="pt-3 border-t border-slate-100">
              <span className="text-xs font-bold text-[#3A0F34] uppercase tracking-wider block mb-2">
                Typical Availability Windows
              </span>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                {profile.typicalAvailability.map((slot) => (
                  <span
                    key={slot}
                    className="bg-slate-100 px-2.5 py-1 rounded-lg font-medium"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Privacy & Matching Preferences */}
          <section className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#3A0F34]" />
              <h2 className="text-sm font-bold text-[#3A0F34] uppercase tracking-wider">
                Privacy & Campus Match Settings
              </h2>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#3A0F34] block">
                    Show university to campus peers
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Displays your college affiliation on activity cards.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={privacyPreferences.showCollegeToCampusPeers}
                  onChange={(e) => {
                    const updated = {
                      ...privacyPreferences,
                      showCollegeToCampusPeers: e.target.checked,
                    };
                    setPrivacyPreferences(updated);
                    const newProf = { ...profile, privacyPreferences: updated };
                    storageService.saveProfile(newProf);
                    if (newProf.id) {
                      authService.saveUserProfile(newProf);
                    }
                    onProfileUpdated(newProf);
                  }}
                  className="w-4 h-4 text-[#3A0F34] rounded accent-[#3A0F34]"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#3A0F34] block">
                    Strict skill level matching
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Prioritize activities matching your exact badminton / sport tier.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={privacyPreferences.onlyMatchCompatibleSkills}
                  onChange={(e) => {
                    const updated = {
                      ...privacyPreferences,
                      onlyMatchCompatibleSkills: e.target.checked,
                    };
                    setPrivacyPreferences(updated);
                    const newProf = { ...profile, privacyPreferences: updated };
                    storageService.saveProfile(newProf);
                    if (newProf.id) {
                      authService.saveUserProfile(newProf);
                    }
                    onProfileUpdated(newProf);
                  }}
                  className="w-4 h-4 text-[#3A0F34] rounded accent-[#3A0F34]"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-[#3A0F34] block">
                    Allow spontaneous meetup invites
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Permit campus peers to invite you when you broadcast Free Right Now.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={privacyPreferences.allowDirectInvites}
                  onChange={(e) => {
                    const updated = {
                      ...privacyPreferences,
                      allowDirectInvites: e.target.checked,
                    };
                    setPrivacyPreferences(updated);
                    const newProf = { ...profile, privacyPreferences: updated };
                    storageService.saveProfile(newProf);
                    if (newProf.id) {
                      authService.saveUserProfile(newProf);
                    }
                    onProfileUpdated(newProf);
                  }}
                  className="w-4 h-4 text-[#3A0F34] rounded accent-[#3A0F34]"
                />
              </label>
            </div>
          </section>

          {/* Safety & Integrity Transparency Card */}
          <section className="bg-slate-100 rounded-3xl p-6 border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-[#3A0F34] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-slate-600 leading-relaxed">
                <span className="font-bold text-[#3A0F34] block">Safety & Integrity Transparency</span>
                <p>
                  VibeMatch uses named public campus venues. CGC college-email verification is planned as a future requirement; ordinary Google Sign-In currently enables testing and community access without proving official CGC enrollment. User profiles are secured in Firestore with strict user-level authorization rules.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
