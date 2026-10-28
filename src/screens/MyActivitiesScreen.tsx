import React, { useState } from 'react';
import { Activity, UserProfile } from '../types';
import { storageService } from '../services/storageService';
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
} from 'lucide-react';

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
    const isHost = act.hostId === currentUser.id;
    const isPast =
      new Date(act.dateTime).getTime() + act.durationMinutes * 60000 < now ||
      act.status === 'completed';
    return isParticipant && !isHost && !isPast && act.status !== 'cancelled';
  });

  const hostedActivities = activities.filter((act) => {
    const isHost = act.hostId === currentUser.id;
    const isPast =
      new Date(act.dateTime).getTime() + act.durationMinutes * 60000 < now ||
      act.status === 'completed';
    return isHost && !isPast && act.status !== 'cancelled';
  });

  const pastActivities = activities.filter((act) => {
    const isParticipant = act.participantIds.includes(currentUser.id);
    const isPast =
      new Date(act.dateTime).getTime() + act.durationMinutes * 60000 < now ||
      act.status === 'completed' ||
      act.status === 'cancelled';
    return isParticipant && isPast;
  });

  const handleLeave = (e: React.MouseEvent, activityId: string) => {
    e.stopPropagation();
    if (!confirm('Leave this squad? Your slot will open for other students.')) return;
    storageService.leaveActivity(activityId, currentUser.id, currentUser.name);
    onActivityUpdated();
  };

  const handleCancel = (e: React.MouseEvent, activityId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to cancel your hosted activity?')) return;
    storageService.cancelActivity(activityId, currentUser.id);
    onActivityUpdated();
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
          <h1 className="text-2xl font-bold font-display text-[#3A0F34]">My Campus Squads</h1>
          <p className="text-xs text-slate-500">
            Keep track of meetups you&apos;re attending, squads you host, and squad coordination chats.
          </p>
        </div>

        <button
          onClick={onExplore}
          className="text-xs font-semibold text-[#3A0F34] hover:text-[#52184A] px-3 py-1.5 bg-white border border-slate-200 rounded-xl transition-colors flex items-center gap-1 shadow-xs"
        >
          <Compass className="w-4 h-4 text-[#EAAA00]" />
          <span>Discover More</span>
        </button>
      </div>

      {/* Segmented Tab Controls */}
      <div className="flex items-center p-1 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
        <button
          onClick={() => setActiveTab('attending')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'attending'
              ? 'bg-[#3A0F34] text-white shadow-xs'
              : 'text-slate-600 hover:text-[#3A0F34]'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Attending ({joinedActivities.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('hosting')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'hosting'
              ? 'bg-[#3A0F34] text-white shadow-xs'
              : 'text-slate-600 hover:text-[#3A0F34]'
          }`}
        >
          <Crown className="w-4 h-4 text-[#EAAA00]" />
          <span>Hosting ({hostedActivities.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('past')}
          className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'past'
              ? 'bg-[#3A0F34] text-white shadow-xs'
              : 'text-slate-600 hover:text-[#3A0F34]'
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
            const messages = storageService.getActivityMessages(act.id);
            const spotsLeft = act.maxParticipants - act.participantIds.length;

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
                className="bg-white rounded-2xl p-5 border border-slate-200/90 hover:border-[#3A0F34]/40 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="space-y-1.5 min-w-0">
                  {/* Unboxed metadata */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    <span className="font-bold text-[#3A0F34]">{act.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{act.skillLevel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700 font-semibold">
                      {act.participantIds.length}/{act.maxParticipants} participants
                    </span>
                    {isHost && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-xs font-semibold text-[#EAAA00]">You are Host</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-[#3A0F34] group-hover:text-[#52184A] transition-colors leading-snug">
                    {act.title}
                  </h3>

                  <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap pt-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#EAAA00]" />
                      <span>{timeStr}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#3A0F34]" />
                      <span className="truncate max-w-xs">{act.venue}</span>
                    </div>
                  </div>
                </div>

                {/* Right action block */}
                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 justify-end">
                  {/* Open Chat Trigger */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectActivity(act);
                    }}
                    className="py-2 px-3.5 bg-slate-100 hover:bg-slate-200 text-[#3A0F34] text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
                    title="Open squad coordination chat"
                  >
                    <MessageCircle className="w-4 h-4 text-[#3A0F34]" />
                    <span>Chat ({messages.length})</span>
                  </button>

                  {/* Leave or Cancel */}
                  {activeTab !== 'past' && (
                    <>
                      {isHost ? (
                        <button
                          onClick={(e) => handleCancel(e, act.id)}
                          className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-xl transition-colors flex items-center gap-1"
                          title="Cancel your activity"
                        >
                          <XCircle className="w-4 h-4" />
                          <span className="hidden sm:inline">Cancel</span>
                        </button>
                      ) : (
                        <button
                          onClick={(e) => handleLeave(e, act.id)}
                          className="py-2 px-3 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-700 text-xs font-medium rounded-xl transition-colors flex items-center gap-1"
                          title="Leave this squad"
                        >
                          <LogOut className="w-4 h-4" />
                          <span className="hidden sm:inline">Leave</span>
                        </button>
                      )}
                    </>
                  )}

                  <div className="text-slate-400 group-hover:text-[#3A0F34] pl-1">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty Tab State */
        <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-slate-200 max-w-md mx-auto my-6">
          <div className="w-14 h-14 rounded-full bg-[#EEF3F7] text-[#3A0F34] flex items-center justify-center mx-auto mb-3">
            <CalendarCheck className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#3A0F34]">
            {activeTab === 'attending'
              ? 'No joined squads yet'
              : activeTab === 'hosting'
              ? 'You are not hosting any squads'
              : 'No past activities recorded'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            {activeTab === 'attending'
              ? 'Explore upcoming badminton, cricket, coffee or study groups on campus and jump in!'
              : activeTab === 'hosting'
              ? 'Take the lead! Create an activity in under 30 seconds for your campus peers.'
              : 'Activities you attend will appear here after they conclude.'}
          </p>
          <button
            onClick={onExplore}
            className="inline-flex items-center gap-1.5 py-2.5 px-5 bg-[#EAAA00] hover:bg-[#D69900] text-[#240720] font-bold text-xs rounded-xl shadow-xs transition-all"
          >
            <span>Explore Campus Activities</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
