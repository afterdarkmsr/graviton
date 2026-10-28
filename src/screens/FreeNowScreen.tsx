import React, { useState, useEffect } from 'react';
import { Activity, FreeNowStudent, UserProfile } from '../types';
import { storageService } from '../services/storageService';
import {
  Zap,
  Clock,
  MapPin,
  Sparkles,
  PlusCircle,
  HandMetal,
  Check,
  StopCircle,
} from 'lucide-react';

interface FreeNowScreenProps {
  currentUser: UserProfile;
  onProfileUpdated: () => void;
  onCreateActivityWithStudent: (suggestedNote: string, venueHint: string) => void;
  onSelectActivity: (activity: Activity) => void;
  activities: Activity[];
}

export const FreeNowScreen: React.FC<FreeNowScreenProps> = ({
  currentUser,
  onProfileUpdated,
  onCreateActivityWithStudent,
}) => {
  const [students, setStudents] = useState<FreeNowStudent[]>(() =>
    storageService.getFreeNowStudents(currentUser.college)
  );

  const [selectedDuration, setSelectedDuration] = useState<number>(60);
  const [customNote, setCustomNote] = useState<string>('');
  const [locationHint, setLocationHint] = useState<string>('Student Union / Quad');
  const [waveSuccessMap, setWaveSuccessMap] = useState<Record<string, boolean>>({});

  // Active status of current user
  const now = Date.now();
  const isCurrentlyFree = !!(currentUser.freeUntil && currentUser.freeUntil > now);
  const minutesLeft = isCurrentlyFree
    ? Math.max(1, Math.round((currentUser.freeUntil! - now) / 60000))
    : 0;

  // Refresh students list on mount or interval
  useEffect(() => {
    const refreshList = () => {
      setStudents(storageService.getFreeNowStudents(currentUser.college));
    };

    refreshList();
    const interval = setInterval(refreshList, 15000); // 15 sec refresh
    return () => clearInterval(interval);
  }, [currentUser.college]);

  const handleBroadcast = (duration: number) => {
    const note =
      customNote.trim() ||
      `Free for ${currentUser.interests.slice(0, 2).join(' or ')} on campus right now!`;
    storageService.setFreeNowStatus(currentUser, duration, note, locationHint.trim());
    onProfileUpdated();
    setStudents(storageService.getFreeNowStudents(currentUser.college));
  };

  const handleStopBroadcast = () => {
    storageService.setFreeNowStatus(currentUser, null);
    onProfileUpdated();
    setStudents(storageService.getFreeNowStudents(currentUser.college));
  };

  const handleWave = (studentId: string, studentName: string) => {
    setWaveSuccessMap((prev) => ({ ...prev, [studentId]: true }));
    setTimeout(() => {
      setWaveSuccessMap((prev) => ({ ...prev, [studentId]: false }));
    }, 2500);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12 space-y-6">
      {/* Broadcast Status Card */}
      <section className="bg-[#3A0F34] text-white rounded-3xl p-6 sm:p-8 shadow-lg border border-[#52184A] relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-[#EAAA00] flex items-center justify-center text-[#240720]">
              <Zap className="w-4 h-4 fill-current" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-display text-white">
                Who&apos;s Free Right Now
              </h1>
              <p className="text-xs text-[#DDE3E8]/80">
                Spontaneous campus availability broadcast · {currentUser.college}
              </p>
            </div>
          </div>

          {isCurrentlyFree && (
            <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold tabular-nums">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{minutesLeft}m active</span>
            </div>
          )}
        </div>

        {/* Broadcast Form or Active State */}
        {isCurrentlyFree ? (
          <div className="mt-5 p-4 bg-white/10 backdrop-blur-xs rounded-2xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs text-[#EAAA00] font-bold uppercase tracking-wider block">
                  You are broadcasting availability
                </span>
                <p className="text-sm text-white font-medium mt-0.5">
                  &quot;{currentUser.freeStatusNote || 'Free for sports or coffee!'}&quot;
                </p>
              </div>
              <button
                onClick={handleStopBroadcast}
                className="py-2 px-4 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-400/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <StopCircle className="w-4 h-4" />
                <span>End Broadcast</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-xs sm:text-sm text-[#DDE3E8]/90 max-w-lg">
              Got a break between lectures? Set yourself as free for 30, 60, or 120 minutes so peers on campus know you&apos;re down to hang out or play.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#EAAA00] uppercase tracking-wider mb-1">
                  What are you down for?
                </label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder={`e.g. Free for quick ${currentUser.interests[0] || 'badminton'} or iced coffee!`}
                  className="w-full px-3.5 py-2 text-xs bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#EAAA00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#EAAA00] uppercase tracking-wider mb-1">
                  Where are you right now? (Public venue)
                </label>
                <input
                  type="text"
                  value={locationHint}
                  onChange={(e) => setLocationHint(e.target.value)}
                  placeholder="e.g. Student Union patio or Rec Center"
                  className="w-full px-3.5 py-2 text-xs bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#EAAA00]"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#DDE3E8]/70 mr-1">Duration:</span>
                {[30, 60, 120].map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setSelectedDuration(dur)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
                      selectedDuration === dur
                        ? 'bg-[#EAAA00] text-[#240720]'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {dur}m
                  </button>
                ))}
              </div>

              <button
                onClick={() => handleBroadcast(selectedDuration)}
                className="py-2.5 px-6 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4 fill-current" />
                <span>Broadcast I&apos;m Free ({selectedDuration}m)</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Free Students Live Feed */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#3A0F34] font-display">
              Peers Available Right Now ({students.length})
            </h2>
            <p className="text-xs text-slate-500">
              Students at {currentUser.college} ready for spontaneous meetups
            </p>
          </div>

          <span className="text-xs text-slate-400 font-medium">Auto-expires</span>
        </div>

        {students.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {students.map((st) => {
              const isMe = st.id === currentUser.id;
              const hasWaved = waveSuccessMap[st.id];

              return (
                <div
                  key={st.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Avatar, Name, Time Left */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-xs shrink-0"
                          style={{ backgroundColor: st.avatarColor || '#3A0F34' }}
                        >
                          {st.avatarInitials}
                        </div>
                        <div>
                          <span className="text-sm font-bold text-[#3A0F34] block">
                            {isMe ? `${st.name} (You)` : st.name}
                          </span>
                          <span className="text-[11px] text-slate-500">{st.college}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg font-semibold tabular-nums">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{st.minutesRemaining}m left</span>
                      </div>
                    </div>

                    {/* What they're looking for */}
                    <p className="text-xs font-medium text-slate-700 bg-[#EEF3F7] p-3 rounded-xl leading-relaxed">
                      &quot;{st.lookingFor}&quot;
                    </p>

                    {/* Location hint */}
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-[#EAAA00] shrink-0" />
                      <span className="truncate">{st.locationHint}</span>
                    </div>

                    {/* Interests tags - unboxed metadata */}
                    <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span>Interests:</span>
                      {st.interests.map((int, i) => (
                        <span key={int} className="text-slate-600 font-medium">
                          {int}
                          {i < st.interests.length - 1 ? ' · ' : ''}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions for this student */}
                  {!isMe && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => handleWave(st.id, st.name)}
                        className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                          hasWaved
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-white hover:bg-slate-50 border-slate-200 text-[#3A0F34]'
                        }`}
                      >
                        {hasWaved ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Waved! (Demo notice)</span>
                          </>
                        ) : (
                          <>
                            <HandMetal className="w-3.5 h-3.5 text-[#EAAA00]" />
                            <span>Wave / Say Hi</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() =>
                          onCreateActivityWithStudent(st.lookingFor, st.locationHint)
                        }
                        className="py-2 px-3.5 bg-[#3A0F34] hover:bg-[#52184A] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1 shadow-xs"
                        title="Create an activity tailored for this student right now"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Squad Up</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 max-w-md mx-auto my-6">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#3A0F34]">No one currently broadcasting</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Be the first to broadcast your free time on {currentUser.college} above!
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
