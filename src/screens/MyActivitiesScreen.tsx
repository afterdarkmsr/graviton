import React, { useState } from 'react';
import { Activity, UserProfile } from '../types';
import {
  CalendarCheck,
  Crown,
  MessageCircle,
  MapPin,
  Clock,
  Compass,
  ArrowRight,
  LogOut,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';

import { activityFirestoreService } from '../services/activityService';

interface MyActivitiesScreenProps {
  activities: Activity[];
  currentUser: UserProfile;
  onSelectActivity: (activity: Activity) => void;
  onExplore: () => void;
  onActivityUpdated: () => void;
}

type TabType = 'attending' | 'hosting' | 'past';

export const MyActivitiesScreen: React.FC<MyActivitiesScreenProps> = ({
  activities,
  currentUser,
  onSelectActivity,
  onExplore,
  onActivityUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('attending');

  const now = Date.now();

  // Categorize activities
  const joinedActivities = activities.filter((act) => {
    const isParticipant = act.participantIds.includes(currentUser.id);
    const isHost = act.hostId === currentUser.id || act.createdBy === currentUser.id;
    const isPast =
      new Date(act.dateTime).getTime() + act.durationMinutes * 60000 < now ||
      act.status === 'completed';
    return isParticipant && !isHost && !isPast && act.status !== 'cancelled';
  });

  const hostedActivities = activities.filter((act) => {
    const isHost = act.hostId === currentUser.id || act.createdBy === currentUser.id;
    const isPast =
      new Date(act.dateTime).getTime() + act.durationMinutes * 60000 < now ||
      act.status === 'completed';
    return isHost && !isPast && act.status !== 'cancelled';
  });

  const pastActivities = activities.filter((act) => {
    const isParticipant =
      act.participantIds.includes(currentUser.id) ||
      act.hostId === currentUser.id ||
      act.createdBy === currentUser.id;
    const isPast =
      new Date(act.dateTime).getTime() + act.durationMinutes * 60000 < now ||
      act.status === 'completed' ||
      act.status === 'cancelled';
    return isParticipant && isPast;
  });

  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLeave = async (e: React.MouseEvent, act: Activity) => {
    e.stopPropagation();
    if (leavingId || cancellingId) return;
    if (!confirm('Leave this squad? Your slot will open for other students.')) return;
    setErrorMsg(null);
    setLeavingId(act.id);

    try {
      await activityFirestoreService.leaveActivity(act.id, currentUser.id);
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
          // Keep raw message
        }
      }
      setErrorMsg(msg);
    } finally {
      setLeavingId(null);
    }
  };

  const handleCancel = async (e: React.MouseEvent, act: Activity) => {
    e.stopPropagation();
    if (cancellingId || leavingId) return;
    if (!confirm('Are you sure you want to cancel your hosted activity? All participants will be notified.')) return;
    setErrorMsg(null);
    setCancellingId(act.id);

    try {
      await activityFirestoreService.cancelActivity(act.id, currentUser.id);
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
      setErrorMsg(msg);
    } finally {
      setCancellingId(null);
    }
  };

  const currentList =
    activeTab === 'attending'
      ? joinedActivities
      : activeTab === 'hosting'
      ? hostedActivities
      : pastActivities;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-[#3A0F34] dark:text-slate-100">My Campus Squads</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Keep track of meetups you&apos;re attending, squads you host, and squad coordination chats.
          </p>
        </div>

        <button
          onClick={onExplore}
          className="text-xs font-semibold text-[#3A0F34] dark:text-slate-200 hover:text-[#52184A] dark:hover:text-white px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
        >
          <Compass className="w-4 h-4 text-[#EAAA00]" />
          <span>Discover More</span>
        </button>
      </div>

      {/* Error alert if transaction fails */}
      {errorMsg && (
        <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl flex items-center gap-2 text-xs text-red-700 dark:text-red-300 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Segmented Tab Controls */}
      <div className="flex items-center p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <button
          onClick={() => setActiveTab('attending')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'attending'
              ? 'bg-[#3A0F34] dark:bg-[#EAAA00] text-white dark:text-[#240720] shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-[#3A0F34] dark:hover:text-slate-200'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Attending ({joinedActivities.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('hosting')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'hosting'
              ? 'bg-[#3A0F34] dark:bg-[#EAAA00] text-white dark:text-[#240720] shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-[#3A0F34] dark:hover:text-slate-200'
          }`}
        >
          <Crown className="w-4 h-4 text-[#EAAA00] dark:text-current" />
          <span>Hosting ({hostedActivities.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('past')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'past'
              ? 'bg-[#3A0F34] dark:bg-[#EAAA00] text-white dark:text-[#240720] shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-[#3A0F34] dark:hover:text-slate-200'
          }`}
        >
          <span>Past Squads ({pastActivities.length})</span>
        </button>
      </div>

      {/* Activities List */}
      {currentList.length > 0 ? (
        <div className="space-y-3">
          {currentList.map((act) => {
            const isHost = act.hostId === currentUser.id;

            const timeStr = new Date(act.dateTime).toLocaleDateString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });

            return (
              <div
                key={act.id}
                onClick={() => onSelectActivity(act)}
                className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/90 dark:border-slate-800 hover:border-[#3A0F34]/40 dark:hover:border-slate-700 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="space-y-1.5 min-w-0">
                  {/* Unboxed metadata */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="font-bold text-[#3A0F34] dark:text-[#EAAA00]">{act.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{act.skillLevel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      {act.participantIds.length}/{act.maxParticipants} participants
                    </span>
                    {isHost && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-xs font-semibold text-[#EAAA00]">You are Host</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-[#3A0F34] dark:text-slate-100 group-hover:text-[#52184A] dark:group-hover:text-[#EAAA00] transition-colors leading-snug">
                    {act.title}
                  </h3>

                  <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 flex-wrap pt-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#EAAA00]" />
                      <span>{timeStr}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#3A0F34] dark:text-[#EAAA00]" />
                      <span className="truncate max-w-xs">{act.venue}</span>
                    </div>
                  </div>
                </div>

                {/* Right action block */}
                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 justify-end">
                  {/* Open Chat Trigger */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectActivity(act);
                    }}
                    className="py-2 px-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[#3A0F34] dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Open squad coordination chat"
                  >
                    <MessageCircle className="w-4 h-4 text-[#3A0F34] dark:text-[#EAAA00]" />
                    <span>Squad Chat</span>
                  </button>

                  {/* Host actions or participant Leave */}
                  {activeTab !== 'past' && (
                    <>
                      {isHost ? (
                        <button
                          onClick={(e) => handleCancel(e, act)}
                          disabled={cancellingId === act.id}
                          className="py-2 px-3 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 text-amber-800 dark:text-amber-300 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                          title="Cancel your activity"
                        >
                          {cancellingId === act.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-amber-700 dark:text-amber-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                          )}
                          <span className="hidden sm:inline">
                            {cancellingId === act.id ? 'Cancelling...' : 'Cancel'}
                          </span>
                        </button>
                      ) : (
                        <button
                          onClick={(e) => handleLeave(e, act)}
                          disabled={leavingId === act.id}
                          className="py-2 px-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 text-xs font-medium rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                          title="Leave this squad"
                        >
                          {leavingId === act.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-red-600 dark:text-red-400" />
                          ) : (
                            <LogOut className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">
                            {leavingId === act.id ? 'Leaving...' : 'Leave'}
                          </span>
                        </button>
                      )}
                    </>
                  )}

                  <div className="text-slate-400 dark:text-slate-500 group-hover:text-[#3A0F34] dark:group-hover:text-[#EAAA00] pl-1">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty Tab State */
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 sm:p-12 text-center border border-slate-200 dark:border-slate-800 max-w-md mx-auto my-6">
          <div className="w-14 h-14 rounded-full bg-[#EEF3F7] dark:bg-slate-800 text-[#3A0F34] dark:text-[#EAAA00] flex items-center justify-center mx-auto mb-3">
            <CalendarCheck className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#3A0F34] dark:text-slate-100">
            {activeTab === 'attending'
              ? 'No joined squads yet'
              : activeTab === 'hosting'
              ? 'You are not hosting any squads'
              : 'No past activities recorded'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
            {activeTab === 'attending'
              ? 'Explore upcoming badminton, cricket, coffee or study groups on campus and jump in!'
              : activeTab === 'hosting'
              ? 'Take the lead! Create an activity in under 30 seconds for your campus peers.'
              : 'Activities you attend will appear here after they conclude.'}
          </p>
          <button
            onClick={onExplore}
            className="inline-flex items-center gap-1.5 py-2.5 px-5 bg-[#EAAA00] hover:bg-[#D69900] text-[#240720] font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <span>Explore Campus Activities</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
