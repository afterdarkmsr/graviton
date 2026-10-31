import React from 'react';
import { Activity, MatchRecommendation, UserProfile } from '../types';
import { matchService } from '../services/matchService';
import { Sparkles, X, MapPin, Clock, Users, ArrowRight, PlusCircle, CheckCircle2 } from 'lucide-react';

interface RescueMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  activities: Activity[];
  onSelectActivity: (activity: Activity) => void;
  onJoinActivity: (activityId: string) => void;
  onCreateActivity: () => void;
}

export const RescueMeModal: React.FC<RescueMeModalProps> = ({
  isOpen,
  onClose,
  profile,
  activities,
  onSelectActivity,
  onJoinActivity,
  onCreateActivity,
}) => {
  if (!isOpen) return null;

  // Run deterministic recommendations for upcoming activities
  const matches: MatchRecommendation[] = matchService.getRecommendations(
    profile,
    activities,
    { onlyImmediate: true, strictCampus: false }
  );

  const topMatch = matches[0];
  const otherMatches = matches.slice(1, 4);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full sm:max-w-xl max-h-[90vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#DDE3E8]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rescue-modal-title"
      >
        {/* Header - Deep Aubergine with Marigold Accent */}
        <div className="bg-[#3A0F34] text-white p-5 sm:p-6 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-[#EAAA00] flex items-center justify-center text-[#240720]">
                <Sparkles className="w-4 h-4 fill-current" />
              </span>
              <div>
                <h2 id="rescue-modal-title" className="text-xl font-bold font-display tracking-tight text-white">
                  Rescue Me From Boredom
                </h2>
                <p className="text-xs text-[#DDE3E8]/80">
                  Instant smart matches for your free time today
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              aria-label="Close rescue modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-[#DDE3E8]/90 bg-white/10 px-3 py-1.5 rounded-xl">
            <span className="font-semibold text-[#EAAA00]">Matched for {profile.name}</span>
            <span>·</span>
            <span>{profile.year}</span>
            <span>·</span>
            <span>Deterministic compatibility</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 bg-[#F8FAFC]">
          {matches.length > 0 ? (
            <>
              {/* Top Recommended Pick Card */}
              {topMatch && (
                <div className="bg-white rounded-2xl p-5 border-2 border-[#EAAA00] shadow-md relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[#EAAA00] bg-[#FFF9EB] px-2.5 py-1 rounded-md uppercase tracking-wider">
                      Top Match · {topMatch.score}% Compatibility
                    </span>
                    <span className="text-xs text-slate-500">
                      {topMatch.activity.category}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-[#3A0F34] leading-snug">
                    {topMatch.activity.title}
                  </h3>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#EAAA00] shrink-0" />
                      <span>
                        {new Date(topMatch.activity.dateTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        ({topMatch.activity.durationMinutes} min)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#3A0F34] shrink-0" />
                      <span className="truncate">{topMatch.activity.venue}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {topMatch.activity.maxParticipants - topMatch.activity.participantIds.length} spots open of {topMatch.activity.maxParticipants} total
                      </span>
                    </div>
                  </div>

                  {/* Why this matches explanation box */}
                  <div className="mt-3.5 p-3 bg-[#EEF3F7] rounded-xl text-xs text-[#3A0F34] space-y-1">
                    <span className="font-semibold block text-[11px] uppercase tracking-wider text-[#3A0F34]/70">
                      Why this matches:
                    </span>
                    {topMatch.matchReasons.map((reason, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => {
                        onJoinActivity(topMatch.activity.id);
                        onClose();
                      }}
                      className="flex-1 py-2.5 px-4 bg-[#EAAA00] hover:bg-[#D69900] text-[#240720] font-semibold text-sm rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>Join This Squad</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        onSelectActivity(topMatch.activity);
                        onClose();
                      }}
                      className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-[#3A0F34] font-medium text-sm rounded-xl transition-colors"
                    >
                      Details
                    </button>
                  </div>
                </div>
              )}

              {/* Other good options */}
              {otherMatches.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-[#3A0F34]/70 uppercase tracking-wider pt-2">
                    More squads starting soon
                  </h4>
                  {otherMatches.map((match) => (
                    <div
                      key={match.activity.id}
                      onClick={() => {
                        onSelectActivity(match.activity);
                        onClose();
                      }}
                      className="bg-white p-4 rounded-xl border border-slate-200 hover:border-[#EAAA00] transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
                          <span className="font-semibold text-[#3A0F34]">{match.activity.category}</span>
                          <span>·</span>
                          <span className="text-emerald-700 font-medium">{match.score}% Match</span>
                          <span>·</span>
                          <span>
                            {match.activity.maxParticipants - match.activity.participantIds.length} spots
                          </span>
                        </div>
                        <h5 className="font-semibold text-sm text-[#3A0F34] group-hover:text-[#EAAA00] transition-colors truncate">
                          {match.activity.title}
                        </h5>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {match.activity.venue}
                        </p>
                      </div>

                      <div className="shrink-0 text-slate-400 group-hover:text-[#3A0F34] transition-colors">
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Actionable empty state if no squads fit the immediate criteria */
            <div className="text-center py-8 px-4 bg-white rounded-2xl border border-slate-200">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#FFF9EB] flex items-center justify-center text-[#EAAA00] mb-3">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-[#3A0F34]">
                No squads starting in the next few hours
              </h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto mt-1 mb-5">
                Be the spark on your campus! Launch a spontaneous 30 or 60 minute activity and ping fellow students who are free right now.
              </p>
              <button
                onClick={() => {
                  onClose();
                  onCreateActivity();
                }}
                className="inline-flex items-center justify-center gap-2 py-3 px-6 bg-[#EAAA00] hover:bg-[#D69900] text-[#240720] font-bold text-sm rounded-xl shadow-md transition-all active:scale-95"
              >
                <PlusCircle className="w-5 h-5" />
                <span>Host a Quick Activity Now</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer info note */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 text-center">
          <p className="text-[11px] text-slate-500">
            Transparent deterministic matching based on campus, interests, skill tier, and time overlap.
          </p>
        </div>
      </div>
    </div>
  );
};
