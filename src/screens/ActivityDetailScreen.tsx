import React, { useState, useEffect, useRef } from 'react';
import { Activity, ActivityMessage, UserProfile } from '../types';
import { storageService } from '../services/storageService';
import { ReportModal } from '../components/ReportModal';
import {
  ArrowLeft,
  MapPin,
  Clock,
  Users,
  Shield,
  Send,
  Lock,
  Flag,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface ActivityDetailScreenProps {
  activityId: string;
  currentUser: UserProfile;
  onBack: () => void;
  onActivityUpdated: () => void;
}

export const ActivityDetailScreen: React.FC<ActivityDetailScreenProps> = ({
  activityId,
  currentUser,
  onBack,
  onActivityUpdated,
}) => {
  const [activity, setActivity] = useState<Activity | undefined>(() =>
    storageService.getActivityById(activityId)
  );
  const [messages, setMessages] = useState<ActivityMessage[]>(() =>
    storageService.getActivityMessages(activityId)
  );
  const [newMsgText, setNewMsgText] = useState('');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Sync state
  const refresh = () => {
    const updated = storageService.getActivityById(activityId);
    setActivity(updated);
    setMessages(storageService.getActivityMessages(activityId));
    onActivityUpdated();
  };

  useEffect(() => {
    refresh();
  }, [activityId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!activity) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h2 className="text-xl font-bold text-[#3A0F34]">Activity not found</h2>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-[#3A0F34] text-white rounded-xl text-xs font-semibold"
        >
          Back to Discover
        </button>
      </div>
    );
  }

  const isHost = activity.hostId === currentUser.id;
  const isJoined = activity.participantIds.includes(currentUser.id);
  const spotsLeft = activity.maxParticipants - activity.participantIds.length;
  const isFull = spotsLeft <= 0;
  const isPast =
    new Date(activity.dateTime).getTime() + activity.durationMinutes * 60000 < Date.now();

  const handleJoin = () => {
    setActionError(null);
    const res = storageService.joinActivity(activity.id, currentUser);
    if (!res.success) {
      setActionError(res.error || 'Unable to join activity.');
    } else {
      setActionSuccess('You joined this squad! Check out the chat below to coordinate.');
      refresh();
    }
  };

  const handleLeave = () => {
    if (!confirm('Are you sure you want to leave this squad? Your spot will be reopened.')) {
      return;
    }
    setActionError(null);
    const res = storageService.leaveActivity(activity.id, currentUser.id, currentUser.name);
    if (!res.success) {
      setActionError(res.error || 'Unable to leave.');
    } else {
      setActionSuccess('You have left this squad.');
      refresh();
    }
  };

  const handleCancel = () => {
    if (!confirm('Are you sure you want to cancel this activity? All participants will be notified.')) {
      return;
    }
    const res = storageService.cancelActivity(activity.id, currentUser.id);
    if (res.success) {
      refresh();
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsgText.trim() || !isJoined) return;

    storageService.sendActivityMessage(activity.id, currentUser, newMsgText.trim());
    setNewMsgText('');
    setMessages(storageService.getActivityMessages(activity.id));
  };

  const formattedDate = new Date(activity.dateTime).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = new Date(activity.dateTime).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12 space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-100 rounded-xl text-xs font-semibold text-[#3A0F34] border border-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          onClick={() => setIsReportOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-700 transition-colors p-2"
        >
          <Flag className="w-3.5 h-3.5" />
          <span>Report</span>
        </button>
      </div>

      {/* Feedback Alerts */}
      {actionError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-xs text-red-700 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 animate-in fade-in">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main Details Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 space-y-6">
        {/* Header & Title */}
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
            {activity.isDemo && (
              <>
                <span className="font-semibold text-slate-400">DEMO</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="font-bold text-[#3A0F34]">{activity.category}</span>
            <span aria-hidden="true">·</span>
            <span>{activity.skillLevel}</span>
            <span aria-hidden="true">·</span>
            <span>{activity.campus}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3A0F34] font-display leading-tight">
            {activity.title}
          </h1>

          <p className="mt-3 text-sm text-slate-700 leading-relaxed">
            {activity.description}
          </p>
        </div>

        {/* Time, Venue & Spots Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#EEF3F7] rounded-2xl text-xs">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-[#EAAA00] shrink-0" />
            <div>
              <span className="block text-slate-400 font-medium">When</span>
              <span className="font-bold text-[#3A0F34]">
                {formattedDate} · {formattedTime}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-[#3A0F34] shrink-0" />
            <div className="min-w-0">
              <span className="block text-slate-400 font-medium">Venue</span>
              <span className="font-bold text-[#3A0F34] truncate block">
                {activity.venue}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="block text-slate-400 font-medium">Capacity</span>
              <span className="font-bold text-[#3A0F34]">
                {activity.participantIds.length} of {activity.maxParticipants} joined
                {spotsLeft > 0 ? ` (${spotsLeft} open)` : ' (Full)'}
              </span>
            </div>
          </div>
        </div>

        {/* Host Profile Info */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0"
              style={{ backgroundColor: activity.hostAvatarColor || '#3A0F34' }}
            >
              {activity.hostAvatarInitials || 'HO'}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-[#3A0F34]">{activity.hostName}</span>
                <span className="text-[10px] bg-[#3A0F34] text-white px-2 py-0.5 rounded-md font-semibold">
                  HOST
                </span>
              </div>
              <span className="text-xs text-slate-500">{activity.hostCollege}</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 block">Created</span>
            <span className="text-xs font-medium text-slate-600">
              {new Date(activity.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Participants Roster */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-[#3A0F34] uppercase tracking-wider">
              Squad Members ({activity.participantIds.length} / {activity.maxParticipants})
            </h3>
            {spotsLeft > 0 && (
              <span className="text-xs text-emerald-700 font-semibold">
                {spotsLeft} spots available
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activity.participantIds.map((id, index) => {
              const isParticipantHost = id === activity.hostId;
              const isCurrentUser = id === currentUser.id;
              const name = isParticipantHost
                ? activity.hostName
                : isCurrentUser
                ? `${currentUser.name} (You)`
                : `Campus Student #${index + 1}`;
              const initials = isParticipantHost
                ? activity.hostAvatarInitials
                : isCurrentUser
                ? currentUser.avatarInitials
                : `S${index + 1}`;
              const color = isParticipantHost
                ? activity.hostAvatarColor
                : isCurrentUser
                ? currentUser.avatarColor
                : '#52184A';

              return (
                <div
                  key={id}
                  className="flex items-center gap-2 bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: color }}
                  >
                    {initials}
                  </div>
                  <span className="text-xs font-medium text-[#3A0F34]">{name}</span>
                  {isParticipantHost && (
                    <span className="text-[9px] text-[#EAAA00] font-bold">★</span>
                  )}
                </div>
              );
            })}

            {/* Empty Spot Placeholders */}
            {Array.from({ length: Math.max(0, spotsLeft) }).map((_, i) => (
              <div
                key={`empty_${i}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-slate-300 text-slate-400 text-xs"
              >
                <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-[10px]">
                  +
                </div>
                <span>Open spot</span>
              </div>
            ))}
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="pt-2">
          {activity.status === 'cancelled' ? (
            <div className="p-3 bg-red-50 text-red-700 text-xs font-medium rounded-xl text-center">
              This activity was cancelled by the host.
            </div>
          ) : isPast ? (
            <div className="p-3 bg-slate-100 text-slate-500 text-xs font-medium rounded-xl text-center">
              This activity has completed.
            </div>
          ) : isHost ? (
            <div className="flex items-center justify-between gap-3 p-4 bg-[#FFF9EB] border border-[#EAAA00]/40 rounded-2xl">
              <div>
                <span className="text-xs font-bold text-[#3A0F34] block">You are the host</span>
                <span className="text-[11px] text-slate-600">
                  Manage your squad and coordinate with classmates in the chat below.
                </span>
              </div>
              <button
                onClick={handleCancel}
                className="py-2 px-4 bg-white hover:bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-xl transition-colors shrink-0"
              >
                Cancel Activity
              </button>
            </div>
          ) : isJoined ? (
            <div className="flex items-center justify-between gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <div>
                <span className="text-xs font-bold text-emerald-900 block flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  You are in this squad!
                </span>
                <span className="text-[11px] text-emerald-700">
                  Meet at {activity.venue} on {formattedDate}.
                </span>
              </div>
              <button
                onClick={handleLeave}
                className="py-2 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl transition-colors shrink-0"
              >
                Leave Squad
              </button>
            </div>
          ) : isFull ? (
            <div className="p-3.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-xl text-center">
              This squad is currently full ({activity.maxParticipants}/{activity.maxParticipants} spots taken).
            </div>
          ) : (
            <button
              onClick={handleJoin}
              className="w-full py-3.5 px-6 bg-[#EAAA00] hover:bg-[#D69900] active:scale-98 text-[#240720] font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>Join This Squad ({spotsLeft} spots remaining)</span>
            </button>
          )}
        </div>

        {/* Campus Safety Reminder */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-2.5 text-xs text-slate-600">
          <Shield className="w-4 h-4 text-[#3A0F34] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Campus Safety:</strong> Activities take place at public campus facilities. Never move meetups to unverified private areas. Respect university guidelines.
          </p>
        </div>
      </div>

      {/* Squad Coordination Chat Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden">
        {/* Chat Header */}
        <div className="bg-[#3A0F34] text-white p-4 sm:p-5 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm sm:text-base font-display">Squad Coordination Chat</h3>
            <span className="text-[11px] text-[#DDE3E8]/80 block">
              Local Demo Chat · Active Members Only
            </span>
          </div>
          <span className="text-xs bg-white/10 px-2.5 py-1 rounded-lg text-[#EAAA00] font-semibold">
            {messages.length} messages
          </span>
        </div>

        {/* Chat Feed */}
        <div className="p-4 sm:p-6 bg-[#F8FAFC] max-h-80 min-h-[160px] overflow-y-auto space-y-3">
          {messages.length > 0 ? (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser.id;
              const isSys = msg.isSystemNotification;

              if (isSys) {
                return (
                  <div key={msg.id} className="text-center my-2">
                    <span className="text-[11px] bg-slate-200/80 text-slate-600 px-3 py-1 rounded-full inline-block">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-xs"
                    style={{ backgroundColor: msg.senderAvatarColor || '#3A0F34' }}
                  >
                    {msg.senderAvatarInitials || 'ST'}
                  </div>
                  <div className={`max-w-[80%] ${isMe ? 'text-right' : ''}`}>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-0.5">
                      <span className="font-semibold text-slate-700">{msg.senderName}</span>
                      <span>·</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div
                      className={`p-3 rounded-2xl text-xs inline-block leading-relaxed ${
                        isMe
                          ? 'bg-[#3A0F34] text-white rounded-tr-xs shadow-xs text-left'
                          : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs shadow-xs text-left'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-xs text-slate-400">
              No chat messages yet. Introduce yourself to the squad!
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat Input */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200">
          {isJoined ? (
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                value={newMsgText}
                onChange={(e) => setNewMsgText(e.target.value)}
                placeholder="Message your squad (e.g. I brought extra shuttles!)..."
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-[#3A0F34] focus:outline-none focus:ring-2 focus:ring-[#3A0F34]"
              />
              <button
                type="submit"
                disabled={!newMsgText.trim()}
                className="p-2.5 bg-[#3A0F34] hover:bg-[#52184A] disabled:opacity-50 text-white rounded-xl transition-colors shadow-xs"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="p-3 bg-slate-100 rounded-xl text-center text-xs text-slate-600 flex items-center justify-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <span>Join this squad to access member-only coordination chat.</span>
            </div>
          )}
        </div>
      </div>

      {/* Safety Report Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        activityId={activity.id}
        activityTitle={activity.title}
        onReportSubmitted={() => {
          refresh();
        }}
      />
    </div>
  );
};
