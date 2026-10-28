import React from 'react';
import { Activity, UserProfile } from '../types';
import { MapPin, Users, ArrowRight, Check } from 'lucide-react';

interface ActivityCardProps {
  activity: Activity;
  currentUser: UserProfile;
  onClick: () => void;
  onJoin: (e: React.MouseEvent, activityId: string) => void;
  matchScore?: number;
  matchReasons?: string[];
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  currentUser,
  onClick,
  onJoin,
  matchScore,
  matchReasons,
}) => {
  const isJoined = activity.participantIds.includes(currentUser.id);
  const isHost = activity.hostId === currentUser.id;
  const spotsLeft = activity.maxParticipants - activity.participantIds.length;
  const isFull = spotsLeft <= 0;
  const isPast = new Date(activity.dateTime).getTime() + activity.durationMinutes * 60000 < Date.now();

  const formattedTime = new Date(activity.dateTime).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <article
      onClick={onClick}
      className="group bg-white rounded-2xl p-5 border border-slate-200/90 hover:border-[#3A0F34]/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
    >
      <div>
        {/* Unboxed Metadata Header with typographic separators */}
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {activity.isDemo && (
              <>
                <span className="font-semibold text-slate-400">DEMO</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="font-semibold text-[#3A0F34]">{activity.category}</span>
            <span aria-hidden="true">·</span>
            <span>{activity.skillLevel}</span>
            <span aria-hidden="true">·</span>
            <span>{activity.durationMinutes} min</span>
          </div>

          {matchScore !== undefined && matchScore > 0 && (
            <span className="font-bold text-emerald-700 tabular-nums">
              {matchScore}% Match
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-bold text-[#3A0F34] group-hover:text-[#52184A] transition-colors leading-snug">
          {activity.title}
        </h3>

        {/* Description snippet */}
        <p className="mt-1.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
          {activity.description}
        </p>

        {/* Venue & Time with unboxed styling */}
        <div className="mt-3.5 space-y-1.5 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">When:</span>
            <span className="font-medium text-slate-800">{formattedTime}</span>
          </div>
          <div className="flex items-start gap-1.5 text-slate-700">
            <MapPin className="w-3.5 h-3.5 text-[#EAAA00] shrink-0 mt-0.5" />
            <span className="line-clamp-1">{activity.venue}</span>
          </div>
        </div>

        {/* Optional match reason line */}
        {matchReasons && matchReasons.length > 0 && (
          <div className="mt-3 py-1.5 px-2.5 bg-[#EEF3F7] rounded-lg text-[11px] text-[#3A0F34] flex items-center gap-1">
            <span className="font-semibold">Why:</span>
            <span className="truncate text-slate-700">{matchReasons[0]}</span>
          </div>
        )}
      </div>

      {/* Footer Area: Host Info & Action Button */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
        {/* Host Info */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-sm"
            style={{ backgroundColor: activity.hostAvatarColor || '#3A0F34' }}
          >
            {activity.hostAvatarInitials || 'ST'}
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-[#3A0F34] block truncate">
              {isHost ? 'You (Host)' : activity.hostName}
            </span>
            <span className="text-[11px] text-slate-500 block truncate">
              {spotsLeft > 0 ? (
                <span className="text-emerald-700 font-medium">
                  {spotsLeft} of {activity.maxParticipants} spots open
                </span>
              ) : (
                <span className="text-slate-400 font-medium">Squad full</span>
              )}
            </span>
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0">
          {isPast ? (
            <span className="text-xs text-slate-400 px-3 py-1.5">Ended</span>
          ) : isHost ? (
            <span className="text-xs font-medium text-[#3A0F34] bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1">
              Hosting
            </span>
          ) : isJoined ? (
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>Joined</span>
            </span>
          ) : isFull ? (
            <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">
              Full
            </span>
          ) : (
            <button
              onClick={(e) => onJoin(e, activity.id)}
              className="py-1.5 px-3.5 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] font-semibold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1"
            >
              <span>Join</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
