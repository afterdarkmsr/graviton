import React, { useState, useEffect, useRef } from 'react';
import { Activity, ActivityMessage, UserProfile } from '../types';
import { activityFirestoreService } from '../services/activityService';
import { matchRequestService } from '../services/matchRequestService';
import { authService } from '../services/authService';
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
  Loader2,
  MessageCircle,
  XCircle,
  Sparkles,
} from 'lucide-react';

interface ActivityDetailScreenProps {
  activityId: string;
  currentUser: UserProfile;
  onBack: () => void;
  onActivityUpdated: () => void;
  activities?: Activity[];
}

export const ActivityDetailScreen: React.FC<ActivityDetailScreenProps> = ({
  activityId,
  currentUser,
  onBack,
  onActivityUpdated,
  activities,
}) => {
  const [activity, setActivity] = useState<Activity | undefined>(() =>
    activities?.find((a) => a.id === activityId)
  );
  const [messages, setMessages] = useState<ActivityMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [publicProfiles, setPublicProfiles] = useState<
    Record<string, { displayName: string; avatarColor: string; avatarInitials: string }>
  >({});
  const [newMsgText, setNewMsgText] = useState('');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Sync state
  const refresh = () => {
    const updated = activities?.find((a) => a.id === activityId);
    setActivity(updated);
    onActivityUpdated();
  };

  useEffect(() => {
    const found = activities?.find((a) => a.id === activityId);
    if (found) {
      setActivity(found);
    } else {
      activityFirestoreService.getActivityById(activityId).then((cloudAct) => {
        if (cloudAct) {
          setActivity(cloudAct);
        }
      });
    }
  }, [activityId, activities]);

  // Real-time Firestore chat subscription
  useEffect(() => {
    if (!activity) return;

    setIsChatLoading(true);
    setChatError(null);

    const unsubscribe = activityFirestoreService.subscribeToMessages(
      activity.id,
      (cloudMessages) => {
        setMessages(cloudMessages);
        setIsChatLoading(false);
      },
      (err: unknown) => {
        const errorObj = err as Error;
        const msg = errorObj?.message || '';
        if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
          setChatError('Squad chat requires membership permissions. Ensure you have joined this squad.');
        } else {
          setChatError('Unable to load squad chat messages in real time.');
        }
        setIsChatLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [activity?.id]);

  useEffect(() => {
    if (!activity || !activity.participantIds?.length) return;
    authService.getPublicProfiles(activity.participantIds).then((profiles) => {
      setPublicProfiles(profiles);
    });
  }, [activity?.id, activity?.participantIds]);

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

  const isHost = activity.hostId === currentUser.id || activity.createdBy === currentUser.id;
  const isJoined = activity.participantIds.includes(currentUser.id);
  const spotsLeft = activity.maxParticipants - activity.participantIds.length;
  const isFull = spotsLeft <= 0;
  const isPast =
    new Date(activity.dateTime).getTime() + activity.durationMinutes * 60000 < Date.now();

  const handleJoin = async () => {
    if (isActionLoading) return;
    setActionError(null);
    setActionSuccess(null);
    setIsActionLoading(true);

    try {
      await activityFirestoreService.joinActivity(activity.id, currentUser);
      setActionSuccess('You joined this squad! Real-time roster updated.');
      // Immediate optimistic update to reflect joined state without waiting on async onSnapshot
      setActivity((prev) =>
        prev
          ? {
              ...prev,
              participantIds: [
                ...prev.participantIds.filter((id) => id !== currentUser.id),
                currentUser.id,
              ],
            }
          : prev
      );
      onActivityUpdated();
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 250);
    } catch (err: unknown) {
      const errorObj = err as Error;
      let msg = errorObj?.message || 'Unable to join squad.';
      if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
        msg = 'Unable to join: Cloud Firestore security rules must be reviewed and deployed for join actions.';
      } else {
        try {
          const parsed = JSON.parse(msg);
          if (parsed?.error) msg = parsed.error;
        } catch {
          // Keep raw message if not JSON
        }
      }
      setActionError(msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (isActionLoading) return;
    if (!confirm('Are you sure you want to leave this squad? Your spot will be reopened.')) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setIsActionLoading(true);

    try {
      await activityFirestoreService.leaveActivity(activity.id, currentUser.id);
      setActionSuccess('You have left this squad. Your spot has been reopened.');
      // Immediate local state update so isJoined switches cleanly
      setActivity((prev) =>
        prev
          ? {
              ...prev,
              participantIds: prev.participantIds.filter((id) => id !== currentUser.id),
              status: prev.status === 'full' ? 'active' : prev.status,
            }
          : prev
      );
      onActivityUpdated();
    } catch (err: unknown) {
      const errorObj = err as Error;
      let msg = errorObj?.message || 'Unable to leave squad.';
      if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
        msg = 'Unable to leave: Cloud Firestore security rules must be reviewed and deployed for leave actions.';
      } else {
        try {
          const parsed = JSON.parse(msg);
          if (parsed?.error) msg = parsed.error;
        } catch {
          // Keep raw message if not JSON
        }
      }
      setActionError(msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (isActionLoading) return;
    if (!confirm('Are you sure you want to cancel this activity? All participants will be notified.')) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setIsActionLoading(true);

    try {
      await activityFirestoreService.cancelActivity(activity.id, currentUser.id);
      setActionSuccess('Activity cancelled successfully in Cloud Firestore.');
      // Immediate local state update: prevents stale active display and duplicate clicks
      setActivity((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
      onActivityUpdated();
    } catch (err: unknown) {
      console.error('Failed to cancel activity in Firestore:', err);
      const errorObj = err as Error;
      let msg = errorObj?.message || 'Failed to cancel activity.';
      if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
        msg = 'Unable to cancel: Only the original squad host can cancel an active squad.';
      } else {
        try {
          const parsed = JSON.parse(msg);
          if (parsed?.error) msg = parsed.error;
        } catch {}
      }
      setActionError(msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEndOneToOneMatch = async () => {
    if (isActionLoading || !activity) return;
    const isHost = activity.createdBy === currentUser.id || activity.hostId === currentUser.id;
    const promptText = isHost
      ? 'Are you sure you want to end this 1-to-1 match? Chat history will be preserved as read-only, and your Who\'s Free broadcast availability will be restored if still unexpired.'
      : 'Are you sure you want to leave this 1-to-1 match? Chat history will be preserved as read-only.';

    if (!confirm(promptText)) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsActionLoading(true);

    try {
      const res = await matchRequestService.endOneToOneMatch(activity.id, currentUser.id);
      setActivity((prev) => (prev ? { ...prev, status: 'completed' } : prev));
      onActivityUpdated();
      if (res.broadcastRestored) {
        setActionSuccess('Match ended. Your Who\'s Free broadcast availability has been restored! Chat history is preserved as read-only.');
      } else {
        setActionSuccess('Match ended. Chat history is preserved as read-only.');
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      setActionError(errorObj?.message || 'Failed to end match.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activity) return;
    const text = newMsgText.trim();
    if (!text || !isJoined || isSendingMessage) return;

    if (activity.status === 'completed' || activity.status === 'cancelled') {
      setChatError('This match has ended. Chat messages are read-only.');
      return;
    }

    if (text.length > 1000) {
      setChatError('Message length exceeds the 1000 character limit.');
      return;
    }

    setChatError(null);
    setIsSendingMessage(true);
    try {
      await activityFirestoreService.sendMessage(activity.id, currentUser, text);
      setNewMsgText('');
    } catch (err: unknown) {
      const errorObj = err as Error;
      let msg = errorObj?.message || 'Failed to send message.';
      if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
        msg = 'Unable to send message: You must be an active participant in this squad.';
      } else {
        try {
          const parsed = JSON.parse(msg);
          if (parsed?.error) msg = parsed.error;
        } catch {
          // Keep raw string
        }
      }
      setChatError(msg);
    } finally {
      setIsSendingMessage(false);
    }
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
          className="inline-flex items-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold text-[#3A0F34] dark:text-slate-100 border border-slate-200 dark:border-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <button
          onClick={() => setIsReportOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-700 dark:text-slate-400 dark:hover:text-red-400 transition-colors p-2"
        >
          <Flag className="w-3.5 h-3.5" />
          <span>Report</span>
        </button>
      </div>

      {/* Feedback Alerts */}
      {actionError && (
        <div className="p-3.5 bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 rounded-2xl flex items-center gap-2 text-xs text-red-700 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 animate-in fade-in">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main Details Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/90 dark:border-slate-800 space-y-6">
        {/* Header & Title */}
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2 flex-wrap">
            {activity.isOneToOne && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-[#EAAA00] text-[#240720] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                <Sparkles className="w-3 h-3 fill-current" />
                1-on-1 Who&apos;s Free Match
              </span>
            )}
            <span className="font-bold text-[#3A0F34] dark:text-[#EAAA00]">{activity.category}</span>
            <span aria-hidden="true">·</span>
            <span>{activity.skillLevel}</span>
            <span aria-hidden="true">·</span>
            <span>{activity.durationMinutes} min</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3A0F34] dark:text-slate-100 font-display leading-tight">
            {activity.title}
          </h1>

          <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {activity.description}
          </p>
        </div>

        {/* Time, Venue & Spots Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#EEF3F7] dark:bg-slate-800/80 rounded-2xl text-xs">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-[#EAAA00] shrink-0" />
            <div>
              <span className="block text-slate-400 dark:text-slate-400 font-medium">When</span>
              <span className="font-bold text-[#3A0F34] dark:text-slate-100">
                {formattedDate} · {formattedTime}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-[#3A0F34] dark:text-[#EAAA00] shrink-0" />
            <div className="min-w-0">
              <span className="block text-slate-400 dark:text-slate-400 font-medium">Venue</span>
              <span className="font-bold text-[#3A0F34] dark:text-slate-100 truncate block">
                {activity.venue}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="block text-slate-400 dark:text-slate-400 font-medium">Capacity</span>
              <span className="font-bold text-[#3A0F34] dark:text-slate-100">
                {activity.participantIds.length} of {activity.maxParticipants} joined
                {spotsLeft > 0 ? ` (${spotsLeft} open)` : ' (Full)'}
              </span>
            </div>
          </div>
        </div>

        {/* Host Profile Info */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0"
              style={{ backgroundColor: activity.hostAvatarColor || '#3A0F34' }}
            >
              {activity.hostAvatarInitials || 'HO'}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-[#3A0F34] dark:text-slate-100">{activity.hostName}</span>
                <span className="text-[10px] bg-[#3A0F34] dark:bg-purple-900 text-white dark:text-purple-200 px-2 py-0.5 rounded-md font-semibold">
                  HOST
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">CGC Student</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 block">Created</span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {new Date(activity.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Participants Roster */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-[#3A0F34] dark:text-slate-200 uppercase tracking-wider">
              Squad Members ({activity.participantIds.length} / {activity.maxParticipants})
            </h3>
            {spotsLeft > 0 && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                {spotsLeft} spots available
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activity.participantIds.map((id, index) => {
              const isParticipantHost = id === activity.hostId || id === activity.createdBy;
              const isCurrentUser = id === currentUser.id;
              const pub = publicProfiles[id];

              const name = isParticipantHost
                ? activity.hostName
                : isCurrentUser
                ? `${currentUser.name} (You)`
                : pub?.displayName || `Campus Student #${index + 1}`;
              const initials = isParticipantHost
                ? activity.hostAvatarInitials
                : isCurrentUser
                ? currentUser.avatarInitials
                : pub?.avatarInitials || `S${index + 1}`;
              const color = isParticipantHost
                ? activity.hostAvatarColor
                : isCurrentUser
                ? currentUser.avatarColor
                : pub?.avatarColor || '#52184A';

              return (
                <div
                  key={id}
                  className="flex items-center gap-2 bg-slate-100/80 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: color }}
                  >
                    {initials}
                  </div>
                  <span className="text-xs font-medium text-[#3A0F34] dark:text-slate-200">{name}</span>
                  {isParticipantHost && (
                    <span className="text-[9px] text-[#EAAA00] font-bold" title="Squad Host">★</span>
                  )}
                </div>
              );
            })}

            {/* Empty Spot Placeholders */}
            {Array.from({ length: Math.max(0, spotsLeft) }).map((_, i) => (
              <div
                key={`empty_${i}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-xs"
              >
                <div className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-[10px]">
                  +
                </div>
                <span>Open spot</span>
              </div>
            ))}
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="pt-2">
          {activity.isOneToOne ? (
            activity.status === 'completed' || activity.status === 'cancelled' ? (
              <div className="p-4 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <div>
                    <span className="font-bold block text-[#3A0F34] dark:text-slate-100">1-to-1 Match Ended</span>
                    <span className="text-slate-500 dark:text-slate-400">Chat history is preserved in read-only mode for both students.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl">
                <div>
                  <span className="text-xs font-bold text-[#3A0F34] dark:text-amber-200 block flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#EAAA00] fill-current" />
                    {isHost ? 'You are the Host' : 'You are Matched!'}
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-300">
                    {isHost
                      ? 'Coordinate with your match below. Ending the match restores your broadcast if still in the future.'
                      : 'You are matched 1-to-1. You can leave the match when finished.'}
                  </span>
                </div>
                <button
                  onClick={handleEndOneToOneMatch}
                  disabled={isActionLoading}
                  className="py-2 px-3.5 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-900/60 text-xs font-semibold rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title={isHost ? 'End match and restore availability' : 'Leave match'}
                >
                  {isActionLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600 dark:text-red-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                  )}
                  <span>{isHost ? 'End Match' : 'Leave Match'}</span>
                </button>
              </div>
            )
          ) : activity.status === 'cancelled' ? (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl text-xs text-red-800 dark:text-red-300">
              <span className="font-bold block">Activity Cancelled</span>
              <span>This activity was cancelled by the host. Coordination chat remains viewable for participants.</span>
            </div>
          ) : isPast ? (
            <div className="p-3 bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-xs font-medium rounded-xl text-center">
              This activity has completed.
            </div>
          ) : isHost ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#FFF9EB] dark:bg-amber-950/30 border border-[#EAAA00]/40 dark:border-amber-900/60 rounded-2xl">
              <div>
                <span className="text-xs font-bold text-[#3A0F34] dark:text-amber-200 block">You are the host</span>
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  Manage your squad and coordinate with classmates in the chat below.
                </span>
              </div>
              <button
                onClick={handleCancel}
                disabled={isActionLoading}
                className="py-2 px-3.5 bg-white dark:bg-slate-900 hover:bg-amber-50 dark:hover:bg-amber-950/50 disabled:opacity-50 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-900/60 text-xs font-semibold rounded-xl transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                title="Cancel activity (marks cancelled for all participants)"
              >
                {isActionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                )}
                <span>Cancel Activity</span>
              </button>
            </div>
          ) : isJoined ? (
            <div className="flex items-center justify-between gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl flex-wrap">
              <div>
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 block flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  You are in this squad!
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Meet at {activity.venue} on {formattedDate}. Coordinate with classmates in the Squad Chat below.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="py-2 px-3.5 bg-[#3A0F34] hover:bg-[#52184A] active:scale-95 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Scroll to Squad Coordination Chat"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[#EAAA00]" />
                  <span>Squad Up</span>
                </button>
                <button
                  onClick={handleLeave}
                  disabled={isActionLoading}
                  className="py-2 px-3 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-semibold rounded-xl transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Leave</span>
                </button>
              </div>
            </div>
          ) : isFull ? (
            <div className="p-3.5 bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 text-xs font-semibold rounded-xl text-center">
              This squad is currently full ({activity.maxParticipants}/{activity.maxParticipants} spots taken).
            </div>
          ) : (
            <button
              onClick={handleJoin}
              disabled={isActionLoading}
              className="w-full py-3.5 px-6 bg-[#EAAA00] hover:bg-[#D69900] disabled:opacity-60 active:scale-98 text-[#240720] font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              {isActionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Securing your spot...</span>
                </>
              ) : (
                <span>Join This Squad ({spotsLeft} spots remaining)</span>
              )}
            </button>
          )}
        </div>

        {/* Campus Safety Reminder */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
          <Shield className="w-4 h-4 text-[#3A0F34] dark:text-[#EAAA00] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Campus Safety:</strong> Activities take place at public campus facilities. Never move meetups to unverified private areas. Respect university guidelines.
          </p>
        </div>
      </div>

      {/* Squad Coordination Chat Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200/90 dark:border-slate-800 overflow-hidden">
        {/* Chat Header */}
        <div className="bg-[#3A0F34] dark:bg-slate-950 text-white p-4 sm:p-5 flex items-center justify-between border-b dark:border-slate-800">
          <div>
            <h3 className="font-bold text-sm sm:text-base font-display">Squad Coordination Chat</h3>
            <span className="text-[11px] text-[#DDE3E8]/80 dark:text-slate-400 block">
              Real-Time Cloud Chat · Active Members Only
            </span>
          </div>
          <span className="text-xs bg-white/10 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-[#EAAA00] font-semibold">
            {messages.length} messages
          </span>
        </div>

        {/* Chat Error Banner */}
        {chatError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 flex items-center gap-2 text-xs text-red-700 dark:text-red-300 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{chatError}</span>
          </div>
        )}

        {/* Chat Feed */}
        <div className="p-4 sm:p-6 bg-[#F8FAFC] dark:bg-slate-950/90 max-h-80 min-h-[160px] overflow-y-auto space-y-3">
          {isChatLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-xs text-slate-500 dark:text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#3A0F34] dark:text-[#EAAA00]" />
              <span>Connecting to real-time chat...</span>
            </div>
          ) : messages.length > 0 ? (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser.id;
              const isSys = msg.isSystemNotification;

              if (isSys) {
                return (
                  <div key={msg.id} className="text-center my-2">
                    <span className="text-[11px] bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full inline-block">
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
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{msg.senderName}</span>
                      <span>·</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div
                      className={`p-3 rounded-2xl text-xs inline-block leading-relaxed break-words ${
                        isMe
                          ? 'bg-[#3A0F34] dark:bg-[#52184A] text-white rounded-tr-xs shadow-xs text-left'
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-tl-xs shadow-xs text-left'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">
              No chat messages yet. Introduce yourself to the squad!
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat Input */}
        <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          {activity.status === 'completed' || activity.status === 'cancelled' ? (
            <div className="p-3.5 bg-slate-100 dark:bg-slate-800/60 rounded-xl text-center text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <span>
                {activity.isOneToOne
                  ? 'This 1-to-1 match has ended. Chat messages are preserved in read-only mode.'
                  : 'This activity has completed. Chat messages are preserved in read-only mode.'}
              </span>
            </div>
          ) : isJoined ? (
            <form onSubmit={handleSendMessage} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMsgText}
                  onChange={(e) => setNewMsgText(e.target.value)}
                  maxLength={1000}
                  disabled={isSendingMessage}
                  placeholder={
                    activity.isOneToOne
                      ? 'Message your 1-to-1 match peer (e.g. On my way!)...'
                      : 'Message your squad (e.g. I brought extra shuttles!)...'
                  }
                  className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-[#3A0F34] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!newMsgText.trim() || isSendingMessage || newMsgText.trim().length > 1000}
                  className="p-2.5 bg-[#3A0F34] hover:bg-[#52184A] dark:bg-[#EAAA00] dark:hover:bg-[#D69900] dark:text-[#240720] disabled:opacity-50 text-white rounded-xl transition-colors shadow-xs flex items-center justify-center shrink-0 cursor-pointer"
                  aria-label="Send message"
                >
                  {isSendingMessage ? (
                    <Loader2 className="w-4 h-4 animate-spin text-current" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              {newMsgText.length > 800 && (
                <div className="text-right text-[10px] text-slate-400 dark:text-slate-500">
                  {newMsgText.length}/1000 characters
                </div>
              )}
            </form>
          ) : (
            <div className="p-3 bg-slate-100 dark:bg-slate-800/60 rounded-xl text-center text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2">
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
