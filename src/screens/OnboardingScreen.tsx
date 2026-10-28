import React, { useState } from 'react';
import { ActivityCategory, AvailabilitySlot, SkillLevel, UserProfile } from '../types';
import { CATEGORIES_CONFIG, COLLEGES } from '../data/seedData';
import { ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';

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
  const [college, setCollege] = useState<string>(initialProfile.college || COLLEGES[0]);
  const [customCollege, setCustomCollege] = useState<string>('');
  const [isCustomCollege, setIsCustomCollege] = useState<boolean>(false);
  const [year, setYear] = useState<string>(initialProfile.year || 'Sophomore');
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
      setInterests(interests.filter((c) => c !== category));
    } else {
      setInterests([...interests, category]);
      if (!skillLevels[category]) {
        setSkillLevels({ ...skillLevels, [category]: 'Casual' });
      }
    }
  };

  const setSkill = (category: ActivityCategory, level: SkillLevel) => {
    setSkillLevels({ ...skillLevels, [category]: level });
  };

  const toggleAvailability = (slot: AvailabilitySlot) => {
    if (typicalAvailability.includes(slot)) {
      setTypicalAvailability(typicalAvailability.filter((s) => s !== slot));
    } else {
      setTypicalAvailability([...typicalAvailability, slot]);
    }
  };

  const handleFinish = () => {
    const activeCollege = isCustomCollege && customCollege.trim() ? customCollege.trim() : college;
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'ST';

    const updatedProfile: UserProfile = {
      ...initialProfile,
      id: initialProfile.id,
      userId: initialProfile.userId || initialProfile.id,
      email: initialProfile.email || '',
      name: name.trim() || 'Campus Student',
      college: activeCollege,
      year: year || 'Sophomore',
      bio: bio.trim(),
      avatarColor,
      avatarInitials: initials,
      interests,
      skillLevels,
      typicalAvailability,
      isOnboarded: true,
      isSampleUser: false,
      updatedAt: new Date().toISOString(),
    };

    onComplete(updatedProfile);
  };

  return (
    <div className="min-h-screen bg-[#DDE3E8] py-8 px-4 flex flex-col justify-center items-center">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
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
                <h3 className="text-lg font-bold text-[#3A0F34]">Tell us about yourself</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your campus identity helps match you with verified university peers.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Chen"
                  className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
                  University / College Campus
                </label>
                {!isCustomCollege ? (
                  <select
                    value={college}
                    onChange={(e) => {
                      if (e.target.value === 'OTHER') {
                        setIsCustomCollege(true);
                      } else {
                        setCollege(e.target.value);
                      }
                    }}
                    className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34]"
                  >
                    {COLLEGES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="OTHER">+ Add other university campus...</option>
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={customCollege}
                      onChange={(e) => setCustomCollege(e.target.value)}
                      placeholder="Type your university name..."
                      className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34]"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomCollege(false)}
                      className="text-xs text-[#3A0F34] underline"
                    >
                      ← Back to campus list
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
                    Year of Study
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34]"
                  >
                    <option value="Freshman">Freshman</option>
                    <option value="Sophomore">Sophomore</option>
                    <option value="Junior">Junior</option>
                    <option value="Senior">Senior</option>
                    <option value="Graduate / PhD">Graduate / PhD</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
                    Avatar Accent
                  </label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {AVATAR_COLORS.slice(0, 5).map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setAvatarColor(color)}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          avatarColor === color ? 'ring-2 ring-offset-2 ring-[#3A0F34] scale-110' : ''
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
                <h3 className="text-lg font-bold text-[#3A0F34]">Select your favorite vibes</h3>
                <p className="text-xs text-slate-500 mt-0.5">
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
                      className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 ${
                        selected
                          ? 'border-[#3A0F34] bg-[#3A0F34] text-white shadow-xs'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-lg">{icon}</span>
                      <span className="text-xs font-semibold truncate">{category}</span>
                    </button>
                  );
                })}
              </div>

              {/* Sports skill level mapping if sports chosen */}
              {interests.some((i) =>
                ['Badminton', 'Cricket', 'Basketball', 'Football', 'Running'].includes(i)
              ) && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-2">
                    Sports Skill Level (for fair matches)
                  </h4>
                  <div className="space-y-2.5">
                    {interests
                      .filter((i) =>
                        ['Badminton', 'Cricket', 'Basketball', 'Football', 'Running'].includes(i)
                      )
                      .slice(0, 3)
                      .map((sport) => (
                        <div key={sport} className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{sport}:</span>
                          <div className="flex gap-1">
                            {(['Beginner', 'Intermediate', 'Advanced', 'Casual'] as SkillLevel[]).map(
                              (lvl) => (
                                <button
                                  key={lvl}
                                  type="button"
                                  onClick={() => setSkill(sport, lvl)}
                                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                    skillLevels[sport] === lvl
                                      ? 'bg-[#EAAA00] text-[#240720] font-bold'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  {lvl}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Availability & Bio */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div>
                <h3 className="text-lg font-bold text-[#3A0F34]">When are you usually free?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
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
                      className={`w-full p-3 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                        active
                          ? 'border-[#3A0F34] bg-[#3A0F34] text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span>{slot}</span>
                      {active && <Check className="w-4 h-4 text-[#EAAA00]" />}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3A0F34] uppercase tracking-wider mb-1.5">
                  Bio (Optional)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="e.g. CS major, always down for badminton rallies or iced matcha breaks..."
                  rows={3}
                  className="w-full px-4 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] resize-none"
                />
              </div>
            </div>
          )}

          {/* Stepper Buttons */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="py-2.5 px-4 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancel}
                className="py-2.5 px-4 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
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
                    className="py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-500 hover:text-[#3A0F34] transition-colors"
                  >
                    Skip to finish
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && !name.trim()}
                  className="py-2.5 px-6 rounded-xl text-xs font-bold bg-[#3A0F34] hover:bg-[#52184A] text-white shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="py-2.5 px-6 rounded-xl text-xs font-bold bg-[#EAAA00] hover:bg-[#D69900] text-[#240720] shadow-md transition-all flex items-center gap-1.5"
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
