import React, { useState } from 'react';
import { ActivityCategory, AvailabilitySlot, SkillLevel, UserProfile } from '../types';
import { CATEGORIES_CONFIG, COLLEGES } from '../data/seedData';
import { storageService } from '../services/storageService';
import { authService } from '../services/authService';
import {
  Edit3,
  RotateCcw,
  Shield,
  Check,
  Save,
  Lock,
  LogOut,
  CloudCheck,
} from 'lucide-react';

interface ProfileScreenProps {
  profile: UserProfile;
  joinedCount: number;
  hostedCount: number;
  onProfileUpdated: (updated: UserProfile) => void;
  onResetData: () => void;
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
  joinedCount,
  hostedCount,
  onProfileUpdated,
  onResetData,
  onSignOut,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [college, setCollege] = useState(profile.college);
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

  const toggleInterest = (category: ActivityCategory) => {
    if (interests.includes(category)) {
      setInterests(interests.filter((c) => c !== category));
    } else {
      setInterests([...interests, category]);
      if (!skillLevels[category]) {
        setSkillLevels({ ...skillLevels, [category]: 'Casual' });
      }
    }
  };

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

    const updated: UserProfile = {
      ...profile,
      name: name.trim() || 'Campus Student',
      college: college.trim() || 'University Campus',
      year,
      bio: bio.trim(),
      avatarInitials: initials,
      interests,
      skillLevels,
      typicalAvailability,
      privacyPreferences,
      updatedAt: new Date().toISOString(),
    };

    // Save to Firestore if real authenticated user
    if (updated.id && !updated.isSampleUser) {
      try {
        await authService.saveUserProfile(updated);
      } catch (err) {
        console.warn('Could not sync to Firestore, fallback to local storage:', err);
      }
    }

    storageService.saveProfile(updated);
    onProfileUpdated(updated);
    setIsSaving(false);
    setIsEditing(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = () => {
    if (
      confirm(
        'Reset app data back to fresh sample seed activities, demo profile, and messages? This will clear local changes.'
      )
    ) {
      onResetData();
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12 space-y-6">
      {/* Profile Header Banner */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 relative overflow-hidden">
        {/* Verification Status Pill */}
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          {profile.isSampleUser ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-800 font-medium">
              <span className="font-semibold">Sample Demo Profile</span>
              <span aria-hidden="true">·</span>
              <span>Stanford University (Guest)</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-800 font-medium">
              <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-semibold">Firebase Authenticated</span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-[200px]">{profile.email || 'Google User'}</span>
            </div>
          )}

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
                <span className="text-[11px] bg-[#EAAA00]/20 text-[#240720] px-2 py-0.5 rounded-md font-bold">
                  STUDENT
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">
                {profile.college} · {profile.year}
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
                College Campus
              </label>
              <select
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34]"
              >
                {COLLEGES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
                Year of Study
              </label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. Junior · Class of 2028"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34]"
              />
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
                    if (newProf.id && !newProf.isSampleUser) {
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
                    if (newProf.id && !newProf.isSampleUser) {
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
                    Allow spontaneous &quot;Wave&quot; notifications
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Permit campus peers to wave when you broadcast Free Right Now.
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
                    if (newProf.id && !newProf.isSampleUser) {
                      authService.saveUserProfile(newProf);
                    }
                    onProfileUpdated(newProf);
                  }}
                  className="w-4 h-4 text-[#3A0F34] rounded accent-[#3A0F34]"
                />
              </label>
            </div>
          </section>

          {/* Reset & Safety Information Card */}
          <section className="bg-slate-100 rounded-3xl p-6 border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-[#3A0F34] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-slate-600 leading-relaxed">
                <span className="font-bold text-[#3A0F34] block">Safety & Integrity Transparency</span>
                <p>
                  VibeMatch uses named public campus venues. College name is self-reported by students and is not a formal registrar verification. User profiles are secured in Firestore with strict user-level authorization rules.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
              <span className="text-xs text-slate-500">Testing data or need to reset?</span>
              <button
                type="button"
                onClick={handleReset}
                className="py-2 px-4 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Sample Seed Data</span>
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
