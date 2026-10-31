import React, { useState } from 'react';
import { ActivityCategory, AvailabilitySlot, SkillLevel, UserProfile } from '../types';
import { CATEGORIES_CONFIG, STUDY_YEAR_OPTIONS } from '../data/seedData';
import { ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

interface OnboardingScreenProps {
  initialProfile: UserProfile;
  onComplete: (profile: UserProfile) => void;
  onCancel: () => void;
}

const AVAILABILITY_OPTIONS: AvailabilitySlot[] = [
  'Mornings (8AM - 12PM)',
  'Afternoons (12PM - 5PM)',
  'Evenings (5PM - 9PM)',
  'Late Night (9PM+)',
  'Weekends',
];

const AVATAR_COLORS = [
  '#3A0F34',
  '#EAAA00',
  '#52184A',
  '#240720',
  '#0F4C81',
  '#2A6F97',
  '#2E7D32',
];

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  initialProfile,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState<string>(initialProfile.name || '');
  const [year, setYear] = useState<string>(initialProfile.year || STUDY_YEAR_OPTIONS[0]);
  const [bio, setBio] = useState<string>(initialProfile.bio || '');
  const [avatarColor, setAvatarColor] = useState<string>(initialProfile.avatarColor || '#EAAA00');
  const [interests, setInterests] = useState<ActivityCategory[]>(
    initialProfile.interests || ['Badminton', 'Coffee', 'Basketball']
  );
  const [skillLevels, setSkillLevels] = useState<Partial<Record<ActivityCategory, SkillLevel>>>(
    initialProfile.skillLevels || { Badminton: 'Intermediate', Basketball: 'Beginner' }
  );
  const [typicalAvailability, setTypicalAvailability] = useState<AvailabilitySlot[]>(
    initialProfile.typicalAvailability || ['Afternoons (12PM - 5PM)', 'Evenings (5PM - 9PM)']
  );

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

  const toggleAvailability = (slot: AvailabilitySlot) => {
    if (typicalAvailability.includes(slot)) {
      setTypicalAvailability(typicalAvailability.filter((s) => s !== slot));
    } else {
      setTypicalAvailability([...typicalAvailability, slot]);
    }
  };

  const selectedSports = interests.filter((i) =>
    CATEGORIES_CONFIG.some((c) => c.category === i && c.group === 'sports')
  );

  const handleFinish = () => {
    const initials = name
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

    const updatedProfile: UserProfile = {
      ...initialProfile,
      id: initialProfile.id,
      userId: initialProfile.userId || initialProfile.id,
      email: initialProfile.email || '',
      name: name.trim() || 'Campus Student',
      year: year || '1st Year',
      bio: bio.trim(),
      avatarColor,
      avatarInitials: initials,
      interests,
      skillLevels: cleanedSkillLevels,
      typicalAvailability,
      isOnboarded: true,
      isSampleUser: false,
      updatedAt: new Date().toISOString(),
    };

    onComplete(updatedProfile);
  };

  return (
    <div className="min-h-screen bg-[#DDE3E8] dark:bg-[#0A0E17] text-[#3A0F34] dark:text-slate-100 py-8 px-4 flex flex-col justify-center items-center transition-colors">
      <div className="w-full max-w-xl flex justify-end mb-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Progress Bar & Header */}
        <div className="bg-[#3A0F34] text-white p-6 relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#EAAA00] flex items-center justify-center text-[#240720]">
                <Sparkles className="w-3.5 h-3.5 fill-current" />
              </span>
              <h2 className="text-xl font-bold font-display text-white">Join VibeMatch</h2>
            </div>
            <span className="text-xs font-semibold text-[#DDE3E8]/80 tabular-nums">
              Step {step} of 3
            </span>
          </div>

          {/* Stepper Dots */}
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  s <= step ? 'bg-[#EAAA00]' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step Body */}
        <div className="p-6 sm:p-8">
          {/* STEP 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h3 className="text-lg font-bold text-[#3A0F34] dark:text-white">Tell us about yourself</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Your student identity helps match you with verified university peers.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Chen"
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] text-[#3A0F34] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Year of Study
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] text-[#3A0F34] dark:text-slate-100"
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

                <div>
                  <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Avatar Accent
                  </label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {AVATAR_COLORS.slice(0, 5).map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setAvatarColor(color)}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          avatarColor === color ? 'ring-2 ring-offset-2 ring-[#3A0F34] dark:ring-[#EAAA00] scale-110' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Interests Selection */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h3 className="text-lg font-bold text-[#3A0F34] dark:text-white">Select your favorite vibes</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pick at least 2 activities you enjoy or want to try on campus.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {CATEGORIES_CONFIG.map(({ category, icon }) => {
                  const selected = interests.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleInterest(category)}
                      className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                        selected
                          ? 'border-[#3A0F34] bg-[#3A0F34] dark:border-[#EAAA00] dark:bg-purple-950 text-white shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span className="text-lg">{icon}</span>
                      <span className="text-xs font-semibold truncate">{category}</span>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic sports skill level mapping for EVERY selected sport */}
              {selectedSports.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-[#3A0F34] dark:text-slate-300 uppercase tracking-wider">
                      Sports Skill Level (for fair matches)
                    </h4>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {selectedSports.length} {selectedSports.length === 1 ? 'sport' : 'sports'} selected
                    </span>
                  </div>
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {selectedSports.map((sport) => {
                      const icon = CATEGORIES_CONFIG.find((c) => c.category === sport)?.icon;
                      return (
                        <div
                          key={sport}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2.5 bg-slate-50 dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
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
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                    (skillLevels[sport] || 'Casual') === lvl
                                      ? 'bg-[#EAAA00] text-[#240720] font-bold shadow-xs'
                                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
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
          )}

          {/* STEP 3: Availability & Bio */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h3 className="text-lg font-bold text-[#3A0F34] dark:text-white">When are you usually free?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Helps our deterministic match engine suggest squads that fit your college schedule.
                </p>
              </div>

              <div className="space-y-2">
                {AVAILABILITY_OPTIONS.map((slot) => {
                  const active = typicalAvailability.includes(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => toggleAvailability(slot)}
                      className={`w-full p-3 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                        active
                          ? 'border-[#3A0F34] bg-[#3A0F34] dark:border-[#EAAA00] dark:bg-purple-950 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span>{slot}</span>
                      {active && <Check className="w-4 h-4 text-[#EAAA00]" />}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Bio (Optional)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. CS major, always down for badminton rallies or iced matcha breaks..."
                  rows={3}
                  className="w-full px-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] text-[#3A0F34] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none"
                />
              </div>
            </div>
          )}

          {/* Stepper Buttons */}
          <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="py-2.5 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancel}
                className="py-2.5 px-4 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}

            {step < 3 ? (
              <div className="flex items-center gap-2">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={handleFinish}
                    className="py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#3A0F34] dark:hover:text-white transition-colors cursor-pointer"
                  >
                    Skip to finish
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && !name.trim()}
                  className="py-2.5 px-6 rounded-xl text-xs font-bold bg-[#3A0F34] hover:bg-[#52184A] dark:bg-[#52184A] dark:hover:bg-[#73456D] text-white shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="py-2.5 px-6 rounded-xl text-xs font-bold bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 fill-current" />
                <span>Finish & Discover Campus</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
