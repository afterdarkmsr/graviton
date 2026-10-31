import React, { useState } from 'react';
import { ActivityCategory, SkillLevel, UserProfile } from '../types';
import { CATEGORIES_CONFIG, VENUE_SUGGESTIONS } from '../data/seedData';
import { Sparkles, MapPin, AlertCircle, Plus, Loader2 } from 'lucide-react';

interface CreateActivityScreenProps {
  currentUser: UserProfile;
  prefill?: {
    suggestedNote?: string;
    venueHint?: string;
  } | null;
  onCreate: (activityData: {
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
  }) => Promise<void> | void;
  onCancel: () => void;
}

export const CreateActivityScreen: React.FC<CreateActivityScreenProps> = ({
  currentUser,
  prefill,
  onCreate,
  onCancel,
}) => {
  // Helpers for default date (e.g. today 2 hours from now)
  const getDefaultDateTime = (offsetHours = 2): string => {
    const d = new Date();
    d.setHours(d.getHours() + offsetHours, 0, 0, 0);
    // format as YYYY-MM-DDTHH:mm for datetime-local input
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [title, setTitle] = useState(prefill?.suggestedNote ? `Spontaneous Squad: ${prefill.suggestedNote.slice(0, 30)}` : '');
  const [category, setCategory] = useState<ActivityCategory>('Badminton');
  const [description, setDescription] = useState(prefill?.suggestedNote || '');
  const [venue, setVenue] = useState(prefill?.venueHint || '');
  const [dateTime, setDateTime] = useState<string>(getDefaultDateTime(1));
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [maxParticipants, setMaxParticipants] = useState<number>(4);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('All Levels');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Suggested campus venues
  const campusVenues = [
    ...(VENUE_SUGGESTIONS['CGC Jhanjeri'] || []),
    ...(VENUE_SUGGESTIONS['CGC Mohali'] || []),
    ...(VENUE_SUGGESTIONS['General'] || []),
  ];

  // Quick preset handlers
  const setQuickPresetTime = (hoursFromNow: number) => {
    setDateTime(getDefaultDateTime(hoursFromNow));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (!title.trim() || title.trim().length < 5) {
      setError('Please provide a descriptive title (at least 5 characters).');
      return;
    }

    if (!venue.trim() || venue.trim().length < 2) {
      setError('Please specify a public campus venue (at least 2 characters).');
      return;
    }

    const selectedTime = new Date(dateTime).getTime();
    if (isNaN(selectedTime) || selectedTime <= Date.now()) {
      setError('Please select a scheduled date and time in the future.');
      return;
    }

    if (maxParticipants < 2 || maxParticipants > 24) {
      setError('Participant limit must be between 2 and 24 students.');
      return;
    }

    // Determine category group
    const config = CATEGORIES_CONFIG.find((c) => c.category === category);
    const categoryGroup = config ? config.group : 'social';

    setIsSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        category,
        categoryGroup,
        description:
          description.trim() ||
          `Spontaneous ${category} meetup at ${venue.trim()}. Looking for enthusiastic campus peers!`,
        campus: currentUser.campus || currentUser.college || 'CGC',
        venue: venue.trim(),
        dateTime: new Date(dateTime).toISOString(),
        durationMinutes,
        maxParticipants,
        skillLevel,
      });
    } catch (err) {
      console.error('Error submitting activity:', err);
      let errMsg = 'Failed to publish activity to Cloud Firestore. Please check your connection.';
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          errMsg = parsed.error || err.message;
        } catch {
          errMsg = err.message;
        }
      }
      setError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="bg-[#3A0F34] dark:bg-slate-950 text-white p-6 sm:p-8 border-b dark:border-slate-800">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full bg-[#EAAA00] flex items-center justify-center text-[#240720]">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
            </span>
            <span className="text-xs font-bold text-[#EAAA00] uppercase tracking-wider">
              Host a Squad
            </span>
          </div>
          <h1 className="text-2xl font-bold font-display text-white">Create Campus Activity</h1>
          <p className="text-xs text-[#DDE3E8]/80 dark:text-slate-400 mt-1">
            Publish an activity for CGC students. Fellow students can discover and join in seconds.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {error && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Category Selection */}
          <div>
            <label className="block text-xs font-bold text-[#3A0F34] dark:text-[#EAAA00] uppercase tracking-wider mb-2">
              Select Activity Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES_CONFIG.map((c) => (
                <button
                  key={c.category}
                  type="button"
                  onClick={() => {
                    setCategory(c.category);
                    // auto adjust default participants for sports
                    if (c.category === 'Badminton') setMaxParticipants(4);
                    else if (c.category === 'Basketball') setMaxParticipants(6);
                    else if (c.category === 'Cricket') setMaxParticipants(10);
                    else if (c.category === 'Coffee') setMaxParticipants(4);
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    category === c.category
                      ? 'bg-[#3A0F34] dark:bg-[#EAAA00] text-white dark:text-[#240720] border-[#3A0F34] dark:border-[#EAAA00] shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="text-base">{c.icon}</span>
                  <span className="truncate">{c.category}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Activity Title */}
          <div>
            <label className="block text-xs font-bold text-[#3A0F34] dark:text-[#EAAA00] uppercase tracking-wider mb-1.5">
              Activity Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Casual Doubles Badminton Rally or Quick Union Iced Coffee"
              className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] font-medium"
            />
          </div>

          {/* 3. Description */}
          <div>
            <label className="block text-xs font-bold text-[#3A0F34] dark:text-[#EAAA00] uppercase tracking-wider mb-1.5">
              Squad Details & Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Bring your own racket if you have one, or borrow from gear desk. Open to all paces!"
              rows={3}
              className="w-full px-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] resize-none"
            />
          </div>

          {/* 4. Public Campus Venue */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-[#3A0F34] dark:text-[#EAAA00] uppercase tracking-wider">
                Public Campus Venue
              </label>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Named public spots only</span>
            </div>
            <div className="relative">
              <MapPin className="w-4 h-4 text-[#EAAA00] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Arrillaga Rec Center Court 2 or CoHo Courtyard"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00]"
              />
            </div>

            {/* Quick Venue Suggestion Chips */}
            {campusVenues.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Popular spots:</span>
                {campusVenues.slice(0, 3).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVenue(v)}
                    className="text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded-lg transition-colors truncate max-w-xs cursor-pointer"
                  >
                    {v.split('(')[0]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 5. Date & Time with Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-[#3A0F34] dark:text-[#EAAA00] uppercase tracking-wider">
                Date & Start Time
              </label>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-400 dark:text-slate-500">Quick presets:</span>
                <button
                  type="button"
                  onClick={() => setQuickPresetTime(1)}
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  In 1 hr
                </button>
                <button
                  type="button"
                  onClick={() => setQuickPresetTime(3)}
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  In 3 hrs
                </button>
                <button
                  type="button"
                  onClick={() => setQuickPresetTime(24)}
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Tomorrow
                </button>
              </div>
            </div>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00]"
            />
          </div>

          {/* 6. Duration, Max Participants & Skill Level */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#3A0F34] dark:text-[#EAAA00] uppercase tracking-wider mb-1.5">
                Duration
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00]"
              >
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
                <option value={120}>2 hours</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#3A0F34] dark:text-[#EAAA00] uppercase tracking-wider mb-1.5">
                Max Participants
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={2}
                  max={24}
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(Math.max(2, Math.min(24, Number(e.target.value))))}
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] font-semibold tabular-nums"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">(incl. you)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#3A0F34] dark:text-[#EAAA00] uppercase tracking-wider mb-1.5">
                Skill Level
              </label>
              <select
                value={skillLevel}
                onChange={(e) => setSkillLevel(e.target.value as SkillLevel)}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00]"
              >
                <option value="All Levels">All Levels (Friendly)</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced / Competitive</option>
              </select>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="py-2.5 px-5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-3 px-7 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-[#240720] font-bold text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#240720]" />
                  <span>Publishing to Firestore...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Publish Activity</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
