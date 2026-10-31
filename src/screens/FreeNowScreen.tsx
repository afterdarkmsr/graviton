import React, { useState, useEffect, useMemo } from 'react';
import { Activity, AvailabilityBroadcast, MatchRequest, UserProfile } from '../types';
import { availabilityService } from '../services/availabilityService';
import { matchRequestService } from '../services/matchRequestService';
import {
  Zap,
  Clock,
  MapPin,
  Sparkles,
  PlusCircle,
  StopCircle,
  AlertCircle,
  Loader2,
  Tag,
  Bell,
  Lock,
  XCircle,
  Send,
  X,
  CheckCircle2,
  MessageSquare,
  LogOut,
} from 'lucide-react';

interface FreeNowScreenProps {
  currentUser: UserProfile;
  onProfileUpdated?: () => void;
  onCreateActivityWithStudent: (suggestedNote: string, venueHint: string) => void;
  onSelectActivity?: (activity: Activity) => void;
  onSelectActivityId?: (activityId: string) => void;
  activities?: Activity[];
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const FreeNowScreen: React.FC<FreeNowScreenProps> = ({
  currentUser,
  onCreateActivityWithStudent,
  onSelectActivity,
  onSelectActivityId,
  activities,
  onToast,
}) => {
  const [broadcasts, setBroadcasts] = useState<AvailabilityBroadcast[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Match Requests state (Phase 2)
  const [incomingRequests, setIncomingRequests] = useState<MatchRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<MatchRequest[]>([]);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [requestModalPeer, setRequestModalPeer] = useState<AvailabilityBroadcast | null>(null);
  const [requestActivityInterest, setRequestActivityInterest] = useState<string>('');
  const [isSendingRequest, setIsSendingRequest] = useState<boolean>(false);

  // Form state
  const [selectedDuration, setSelectedDuration] = useState<number>(60);
  const [isCustomDuration, setIsCustomDuration] = useState<boolean>(false);
  const [customDurationInput, setCustomDurationInput] = useState<string>('45');

  const [customNote, setCustomNote] = useState<string>('');
  const [locationHint, setLocationHint] = useState<string>('Student Union / Quad');
  const [selectedInterest, setSelectedInterest] = useState<string>(
    currentUser.interests && currentUser.interests.length > 0 ? currentUser.interests[0] : 'Campus Hangout'
  );
  const [isCustomInterest, setIsCustomInterest] = useState<boolean>(false);
  const [customInterestText, setCustomInterestText] = useState<string>('');

  const presetActivityOptions = useMemo(() => {
    const defaults = ['Badminton', 'Coffee', 'Study Group', 'Campus Hangout', 'Cricket', 'Gym'];
    const userInterests = currentUser.interests || [];
    const merged = Array.from(new Set([...userInterests, ...defaults]));
    return merged.slice(0, 7);
  }, [currentUser.interests]);

  // Real-time second ticker for authoritative client countdown
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Real-time Firestore Subscription to /availabilityBroadcasts
  useEffect(() => {
    setIsLoading(true);
    setErrorMessage(null);

    const unsubscribe = availabilityService.subscribeToActiveBroadcasts(
      (allBroadcasts) => {
        setBroadcasts(allBroadcasts);
        setIsLoading(false);
      },
      (err: unknown) => {
        const errorObj = err as Error;
        console.error('Broadcasts subscription error:', errorObj);
        let msg = errorObj?.message || 'Failed to load live broadcasts.';
        if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
          msg = 'Firestore permission required: Review the proposed security rules for /availabilityBroadcasts/{uid}.';
        }
        setErrorMessage(msg);
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Real-time Firestore Subscriptions for Match Requests (Phase 2)
  useEffect(() => {
    if (!currentUser.id) return;

    const unsubIncoming = matchRequestService.subscribeIncomingRequests(
      currentUser.id,
      (reqs) => {
        setIncomingRequests(reqs);
      },
      (err) => {
        console.warn('Incoming match requests subscription warning:', err);
      }
    );

    const unsubOutgoing = matchRequestService.subscribeOutgoingRequests(
      currentUser.id,
      (reqs) => {
        setOutgoingRequests(reqs);
      },
      (err) => {
        console.warn('Outgoing match requests subscription warning:', err);
      }
    );

    return () => {
      unsubIncoming();
      unsubOutgoing();
    };
  }, [currentUser.id]);

  // Active 1-to-1 match for current user (Phase 3)
  const activeOneToOneMatch = useMemo(() => {
    if (!activities) return null;
    return (
      activities.find(
        (a) =>
          a.isOneToOne &&
          a.status === 'active' &&
          Array.isArray(a.participantIds) &&
          a.participantIds.includes(currentUser.id)
      ) || null
    );
  }, [activities, currentUser.id]);

  // Requester auto-navigation on match acceptance (once per match, without repeat forced redirect on refresh)
  useEffect(() => {
    const acceptedRequest = outgoingRequests.find(
      (r) => r.status === 'accepted' && r.activityId
    );
    if (acceptedRequest && acceptedRequest.activityId) {
      const navKey = `navigated_match_${acceptedRequest.id}`;
      if (!sessionStorage.getItem(navKey)) {
        sessionStorage.setItem(navKey, 'true');
        onToast?.('Your match request was accepted! Taking you directly to Squad Chat...', 'success');
        if (onSelectActivityId) {
          onSelectActivityId(acceptedRequest.activityId);
        } else if (onSelectActivity) {
          const act = activities?.find((a) => a.id === acceptedRequest.activityId);
          if (act) onSelectActivity(act);
        }
      }
    }
  }, [outgoingRequests, onSelectActivityId, onSelectActivity, activities, onToast]);

  // Derive current user's active broadcast
  const myBroadcast = useMemo(() => {
    return broadcasts.find((b) => b.ownerUid === currentUser.id && b.isActive);
  }, [broadcasts, currentUser.id]);

  const myExpiresAtMs = myBroadcast
    ? availabilityService.getMillisFromTimestamp(myBroadcast.expiresAt)
    : 0;
  const isMyBroadcastActive = myBroadcast && myBroadcast.isActive && myExpiresAtMs > nowTick;

  const mySecondsRemaining = isMyBroadcastActive
    ? Math.max(0, Math.floor((myExpiresAtMs - nowTick) / 1000))
    : 0;
  const myMinutesRemaining = Math.floor(mySecondsRemaining / 60);
  const mySecondsPart = mySecondsRemaining % 60;

  // Derive other students' active, unexpired broadcasts
  const activePeerBroadcasts = useMemo(() => {
    return broadcasts
      .filter((b) => {
        if (b.ownerUid === currentUser.id || !b.isActive) return false;
        const expiresMs = availabilityService.getMillisFromTimestamp(b.expiresAt);
        return expiresMs > nowTick;
      })
      .sort((a, b) => {
        const expA = availabilityService.getMillisFromTimestamp(a.expiresAt);
        const expB = availabilityService.getMillisFromTimestamp(b.expiresAt);
        return expA - expB; // Soonest to expire or freshest first
      });
  }, [broadcasts, currentUser.id, nowTick]);

  // Handle publishing a new broadcast
  const handleBroadcast = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const activeInterest = isCustomInterest
        ? customInterestText.trim() || 'Campus Hangout'
        : selectedInterest || 'Campus Hangout';

      const activeDuration = isCustomDuration
        ? Math.min(240, Math.max(15, parseInt(customDurationInput, 10) || 60))
        : selectedDuration;

      const note =
        customNote.trim() ||
        `Free for ${activeInterest || 'hangout'} on campus right now!`;

      await availabilityService.publishBroadcast(
        {
          durationMinutes: activeDuration,
          statusNote: note,
          locationHint: locationHint.trim() || 'Student Union / Quad',
          activityInterest: activeInterest,
        },
        currentUser
      );

      setCustomNote('');
    } catch (err: unknown) {
      const errorObj = err as Error;
      let msg = errorObj?.message || 'Failed to broadcast availability.';
      if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
        msg = 'Firestore rules restricted write to /availabilityBroadcasts. Check that security rules permit owner broadcast.';
      }
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancelling the active broadcast
  const handleStopBroadcast = async () => {
    setErrorMessage(null);
    setIsCancelling(true);
    try {
      await availabilityService.cancelBroadcast(currentUser.id);
    } catch (err: unknown) {
      const errorObj = err as Error;
      let msg = errorObj?.message || 'Failed to cancel broadcast.';
      setErrorMessage(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  // Match Request Handlers (Phase 2)
  const handleOpenRequestModal = (peer: AvailabilityBroadcast) => {
    if (peer.ownerUid === currentUser.id) {
      onToast?.('You cannot request a match with yourself.', 'error');
      return;
    }

    const alreadyPending = outgoingRequests.some(
      (r) => r.hostUid === peer.ownerUid && r.status === 'pending'
    );
    if (alreadyPending) {
      onToast?.('You already have a pending match request with this student.', 'info');
      return;
    }

    setRequestModalPeer(peer);
    setRequestActivityInterest(peer.activityInterest || 'Campus Hangout');
  };

  const handleSendMatchRequest = async () => {
    if (!requestModalPeer) return;
    setIsSendingRequest(true);
    try {
      await matchRequestService.sendMatchRequest({
        hostUid: requestModalPeer.ownerUid,
        activityInterest:
          requestActivityInterest.trim() ||
          requestModalPeer.activityInterest ||
          'Campus Hangout',
        requesterName: currentUser.name,
        requesterYear: currentUser.year || undefined,
      });

      onToast?.(`Match request sent to ${requestModalPeer.displayName}!`, 'success');
      setRequestModalPeer(null);
    } catch (err: unknown) {
      const errorObj = err as Error;
      let msg = errorObj?.message || 'Failed to send match request.';
      if (msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions')) {
        msg = 'Firestore rules restricted match request write. Review /matchRequests/{requestId} rules.';
      }
      onToast?.(msg, 'error');
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    setRequestActionId(requestId);
    try {
      await matchRequestService.cancelMatchRequest(requestId);
      onToast?.('Match request cancelled.', 'info');
    } catch (err: unknown) {
      const errorObj = err as Error;
      onToast?.(errorObj?.message || 'Failed to cancel match request.', 'error');
    } finally {
      setRequestActionId(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setRequestActionId(requestId);
    try {
      await matchRequestService.declineMatchRequest(requestId);
      onToast?.('Match request declined.', 'info');
    } catch (err: unknown) {
      const errorObj = err as Error;
      onToast?.(errorObj?.message || 'Failed to decline match request.', 'error');
    } finally {
      setRequestActionId(null);
    }
  };

  const [isEndingActiveMatch, setIsEndingActiveMatch] = useState<boolean>(false);

  const handleAcceptRequest = async (req: MatchRequest) => {
    setRequestActionId(req.id);
    try {
      const activityId = await matchRequestService.acceptMatchRequest(req.id, currentUser);
      onToast?.(`Match accepted with ${req.requesterName}! Entering Squad Chat...`, 'success');
      sessionStorage.setItem(`navigated_match_${req.id}`, 'true');
      if (onSelectActivityId) {
        onSelectActivityId(activityId);
      } else if (onSelectActivity) {
        const found = activities?.find((a) => a.id === activityId);
        if (found) {
          onSelectActivity(found);
        }
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      let msg = errorObj?.message || 'Failed to accept match request.';
      if (msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions')) {
        msg = 'Firestore rules restricted match acceptance. Review /activities and /matchRequests security rules.';
      }
      onToast?.(msg, 'error');
    } finally {
      setRequestActionId(null);
    }
  };

  const handleEndActiveMatch = async (activityId: string) => {
    if (!confirm('Are you sure you want to end this 1-to-1 match? Chat history will be preserved as read-only.')) {
      return;
    }
    setIsEndingActiveMatch(true);
    try {
      const res = await matchRequestService.endOneToOneMatch(activityId, currentUser.id);
      if (res.broadcastRestored) {
        onToast?.('Match ended. Your Who\'s Free broadcast availability has been restored!', 'success');
      } else {
        onToast?.('Match ended. Chat history preserved as read-only.', 'info');
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      onToast?.(errorObj?.message || 'Failed to end match.', 'error');
    } finally {
      setIsEndingActiveMatch(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-12 space-y-6">
      {/* Error notification banner */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <span className="font-bold block">Availability Notice:</span>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-600 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active 1-to-1 Match Live Banner (Phase 3) */}
      {activeOneToOneMatch && (
        <section className="bg-gradient-to-r from-emerald-900 via-[#3A0F34] to-emerald-900 text-white rounded-3xl p-5 sm:p-6 shadow-lg border-2 border-emerald-400/50 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5 fill-current" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-bold font-display text-white">
                    Active 1-on-1 Match Live
                  </h2>
                  <span className="text-[10px] bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {activeOneToOneMatch.category}
                  </span>
                </div>
                <p className="text-xs text-[#DDE3E8]/85">
                  {activeOneToOneMatch.createdBy === currentUser.id ? 'You are Host' : 'You are Requester'} · Matched at {activeOneToOneMatch.venue}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (onSelectActivityId) {
                    onSelectActivityId(activeOneToOneMatch.id);
                  } else if (onSelectActivity) {
                    onSelectActivity(activeOneToOneMatch);
                  }
                }}
                className="py-2 px-4 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 fill-current" />
                <span>Open Squad Chat</span>
              </button>

              <button
                onClick={() => handleEndActiveMatch(activeOneToOneMatch.id)}
                disabled={isEndingActiveMatch}
                className="py-2 px-3 bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 border border-white/20 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title={activeOneToOneMatch.createdBy === currentUser.id ? 'End match and restore availability' : 'Leave match'}
              >
                {isEndingActiveMatch ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5 text-red-300" />
                )}
                <span>{activeOneToOneMatch.createdBy === currentUser.id ? 'End Match' : 'Leave Match'}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Broadcast Status Hero Card */}
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
                Real-time campus availability broadcasts · {currentUser.college || currentUser.campus || 'Campus Community'}
              </p>
            </div>
          </div>

          {isMyBroadcastActive && (
            <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold tabular-nums">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {myMinutesRemaining}m {mySecondsPart < 10 ? `0${mySecondsPart}` : mySecondsPart}s active
              </span>
            </div>
          )}
        </div>

        {/* User Active Broadcast vs Broadcast Form */}
        {isMyBroadcastActive ? (
          <div className="mt-5 p-5 bg-white/10 backdrop-blur-xs rounded-2xl border border-white/15 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] bg-[#EAAA00] text-[#240720] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Your Broadcast is Live
                  </span>
                  <span className="text-xs text-[#DDE3E8] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      Expires in {myMinutesRemaining}m {mySecondsPart}s
                    </span>
                  </span>
                </div>
                <p className="text-sm text-white font-medium">
                  &quot;{myBroadcast?.statusNote}&quot;
                </p>
                <div className="flex items-center gap-3 text-xs text-[#DDE3E8]/80 pt-1 flex-wrap">
                  {(myBroadcast?.year || currentUser.year) && (
                    <span className="text-[10px] bg-white/20 text-white font-semibold px-2 py-0.5 rounded-md">
                      {myBroadcast?.year || currentUser.year}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#EAAA00]" />
                    <span>{myBroadcast?.locationHint}</span>
                  </span>
                  {myBroadcast?.activityInterest && (
                    <span className="flex items-center gap-1 text-[#EAAA00]">
                      <Tag className="w-3 h-3" />
                      <span>{myBroadcast.activityInterest}</span>
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={handleStopBroadcast}
                disabled={isCancelling}
                className="py-2.5 px-4 bg-red-500/20 hover:bg-red-500/30 active:scale-95 text-red-200 border border-red-400/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-60"
              >
                {isCancelling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <StopCircle className="w-4 h-4" />
                )}
                <span>{isCancelling ? 'Ending...' : 'End Broadcast'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-xs sm:text-sm text-[#DDE3E8]/90 max-w-xl">
              Got free time between classes? Let fellow campus students know you&apos;re down to meet up, play badminton, grab coffee, or study.
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
                  placeholder="e.g. Student Union patio, Rec Center, Library"
                  className="w-full px-3.5 py-2 text-xs bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#EAAA00]"
                />
              </div>
            </div>

            {/* Activity tag presets and custom tag option */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[#DDE3E8]/70">Activity tag:</span>
                {presetActivityOptions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setSelectedInterest(tag);
                      setIsCustomInterest(false);
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                      selectedInterest === tag && !isCustomInterest
                        ? 'bg-[#EAAA00] text-[#240720] border-[#EAAA00] font-bold shadow-xs'
                        : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomInterest(true);
                    if (customInterestText.trim()) {
                      setSelectedInterest(customInterestText.trim());
                    }
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                    isCustomInterest
                      ? 'bg-[#EAAA00] text-[#240720] border-[#EAAA00] font-bold shadow-xs'
                      : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                  }`}
                >
                  + Custom Tag
                </button>
              </div>

              {isCustomInterest && (
                <div className="flex items-center gap-2 pt-1 max-w-sm">
                  <input
                    type="text"
                    value={customInterestText}
                    maxLength={40}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomInterestText(val);
                      setSelectedInterest(val);
                    }}
                    placeholder="Enter custom activity tag (e.g. Table Tennis, Robotics)"
                    className="w-full px-3 py-1.5 text-xs bg-white/15 border border-[#EAAA00]/60 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#EAAA00]"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Duration Selector & Broadcast CTA */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-[#DDE3E8]/80 mr-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Duration:</span>
                </span>
                {[30, 60, 120].map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => {
                      setSelectedDuration(dur);
                      setIsCustomDuration(false);
                    }}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
                      selectedDuration === dur && !isCustomDuration
                        ? 'bg-[#EAAA00] text-[#240720]'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {dur}m
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomDuration(true);
                    const parsed = parseInt(customDurationInput, 10);
                    const valid = !isNaN(parsed) ? Math.min(240, Math.max(15, parsed)) : 45;
                    setSelectedDuration(valid);
                  }}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    isCustomDuration
                      ? 'bg-[#EAAA00] text-[#240720]'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  Custom
                </button>
                {isCustomDuration && (
                  <div className="flex items-center gap-1.5 bg-white/10 border border-[#EAAA00]/60 rounded-lg px-2.5 py-1">
                    <input
                      type="number"
                      min={15}
                      max={240}
                      value={customDurationInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomDurationInput(val);
                        const parsed = parseInt(val, 10);
                        if (!isNaN(parsed)) {
                          setSelectedDuration(Math.min(240, Math.max(15, parsed)));
                        }
                      }}
                      className="w-12 text-center text-xs bg-transparent text-white font-bold focus:outline-none"
                    />
                    <span className="text-[11px] text-[#DDE3E8]/80">min (15–240)</span>
                  </div>
                )}
              </div>

              <button
                onClick={handleBroadcast}
                disabled={isSubmitting}
                className="py-2.5 px-6 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#240720]" />
                ) : (
                  <Sparkles className="w-4 h-4 fill-current" />
                )}
                <span>
                  {isSubmitting
                    ? 'Publishing...'
                    : `Broadcast I'm Free (${isCustomDuration ? Math.min(240, Math.max(15, parseInt(customDurationInput, 10) || 60)) : selectedDuration}m)`}
                </span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Host Incoming Match Requests Notification Section (Phase 2) */}
      {incomingRequests.length > 0 && (
        <section className="bg-gradient-to-r from-amber-50/90 via-white to-amber-50/90 dark:from-amber-950/40 dark:via-slate-900 dark:to-amber-950/40 border-2 border-[#EAAA00] rounded-3xl p-5 sm:p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-[#EAAA00] flex items-center justify-center text-[#240720]">
                <Bell className="w-4 h-4 fill-current animate-bounce" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#3A0F34] dark:text-white font-display flex items-center gap-2">
                  <span>Incoming Match Requests</span>
                  <span className="text-xs bg-[#EAAA00] text-[#240720] px-2 py-0.5 rounded-full font-bold">
                    {incomingRequests.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Campus peers requesting to match 1-to-1 with your Who&apos;s Free broadcast
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block text-[11px] font-bold text-[#3A0F34] dark:text-[#EAAA00] bg-[#EAAA00]/25 dark:bg-[#EAAA00]/20 border border-[#EAAA00]/50 px-2.5 py-1 rounded-full uppercase tracking-wider">
              Real-Time Alert
            </span>
          </div>

          <div className="space-y-3">
            {incomingRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white dark:bg-slate-800/90 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#3A0F34] dark:bg-purple-900 text-[#EAAA00] flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                    {req.requesterName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[#3A0F34] dark:text-white">
                        {req.requesterName}
                      </span>
                      {req.requesterYear && (
                        <span className="text-[10px] bg-[#3A0F34]/10 dark:bg-purple-900/40 text-[#3A0F34] dark:text-purple-200 font-semibold px-2 py-0.5 rounded-md">
                          {req.requesterYear}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        wants to match 1-to-1
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <Tag className="w-3.5 h-3.5 text-[#EAAA00]" />
                      <span>Activity:</span>
                      <span className="font-semibold text-[#3A0F34] dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                        {req.activityInterest}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleDeclineRequest(req.id)}
                    disabled={requestActionId === req.id}
                    className="py-2 px-3.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {requestActionId === req.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                    )}
                    <span>Decline</span>
                  </button>

                  <button
                    onClick={() => handleAcceptRequest(req)}
                    disabled={requestActionId === req.id}
                    className="py-2 px-3.5 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-60"
                    title={`Accept match request from ${req.requesterName} and enter direct Squad Chat`}
                  >
                    {requestActionId === req.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#240720]" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 fill-current text-[#240720]" />
                    )}
                    <span>{requestActionId === req.id ? 'Accepting...' : 'Accept & Chat'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Free Students Live Feed */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#3A0F34] dark:text-white font-display">
              Peers Available Right Now ({activePeerBroadcasts.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Students broadcasting live availability across campus
            </p>
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Firestore Feed</span>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800">
            <Loader2 className="w-6 h-6 animate-spin text-[#3A0F34] dark:text-[#EAAA00] mx-auto mb-2" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Checking campus availability broadcasts...
            </p>
          </div>
        ) : activePeerBroadcasts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePeerBroadcasts.map((st) => {
              const expiresMs = availabilityService.getMillisFromTimestamp(st.expiresAt);
              const secLeft = Math.max(0, Math.floor((expiresMs - nowTick) / 1000));
              const minLeft = Math.ceil(secLeft / 60);

              const pendingOutgoingRequest = outgoingRequests.find(
                (r) => r.hostUid === st.ownerUid && r.status === 'pending'
              );

              return (
                <div
                  key={st.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/90 dark:border-slate-800/90 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Avatar, Name, Time Left */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        {st.photoURL ? (
                          <img
                            src={st.photoURL}
                            alt={st.displayName}
                            className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-xs shrink-0"
                            style={{ backgroundColor: st.avatarColor || '#3A0F34' }}
                          >
                            {st.avatarInitials || st.displayName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-[#3A0F34] dark:text-white">
                              {st.displayName}
                            </span>
                            {st.year && (
                              <span className="text-[10px] bg-[#3A0F34]/10 dark:bg-purple-900/40 text-[#3A0F34] dark:text-purple-200 font-semibold px-1.5 py-0.5 rounded-md">
                                {st.year}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                            {st.college || st.campus || 'Campus Peer'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg font-semibold tabular-nums border border-emerald-100 dark:border-emerald-900/50">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{minLeft}m left</span>
                      </div>
                    </div>

                    {/* What they're looking for */}
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-[#EEF3F7] dark:bg-slate-800/90 p-3 rounded-xl leading-relaxed">
                      &quot;{st.statusNote}&quot;
                    </p>

                    {/* Location hint */}
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="w-3.5 h-3.5 text-[#EAAA00] shrink-0" />
                      <span className="truncate">{st.locationHint}</span>
                    </div>

                    {/* Activity Interest */}
                    {st.activityInterest && (
                      <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <span>Down for:</span>
                        <span className="text-[#3A0F34] dark:text-slate-200 font-semibold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          {st.activityInterest}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions for this student (Phase 2) */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    {pendingOutgoingRequest ? (
                      <div className="w-full flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-2 px-3">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>Request Sent (Pending)</span>
                        </span>
                        <button
                          onClick={() => handleCancelRequest(pendingOutgoingRequest.id)}
                          disabled={requestActionId === pendingOutgoingRequest.id}
                          className="py-1 px-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-100/60 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {requestActionId === pendingOutgoingRequest.id ? 'Cancelling...' : 'Cancel Request'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleOpenRequestModal(st)}
                          className="flex-1 py-2.5 px-3 bg-[#3A0F34] hover:bg-[#52184A] dark:bg-purple-900 dark:hover:bg-purple-800 active:scale-95 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                          title={`Request a 1-to-1 match with ${st.displayName}`}
                        >
                          <Sparkles className="w-4 h-4 text-[#EAAA00] fill-current" />
                          <span>Request Match</span>
                        </button>

                        <button
                          onClick={() =>
                            onCreateActivityWithStudent(
                              st.activityInterest
                                ? `${st.activityInterest}: ${st.statusNote}`
                                : st.statusNote,
                              st.locationHint
                            )
                          }
                          className="py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer shrink-0"
                          title="Create an open group squad activity together"
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-[#3A0F34] dark:text-[#EAAA00]" />
                          <span className="hidden sm:inline">Group Squad</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-800 max-w-md mx-auto my-6">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-2">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#3A0F34] dark:text-white">No one currently broadcasting</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
              No students are broadcasting availability right now. Be the first to broadcast your free time on {currentUser.college || currentUser.campus || 'campus'} above!
            </p>
          </div>
        )}
      </section>

      {/* 1-to-1 Match Request Modal (Phase 2) */}
      {requestModalPeer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#3A0F34] dark:bg-purple-950 text-[#EAAA00] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#3A0F34] dark:text-white">Request 1-to-1 Match</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Connect with a Who&apos;s Free campus peer</p>
                </div>
              </div>
              <button
                onClick={() => setRequestModalPeer(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Host preview */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-xs shrink-0"
                style={{ backgroundColor: requestModalPeer.avatarColor || '#3A0F34' }}
              >
                {requestModalPeer.avatarInitials || requestModalPeer.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-[#3A0F34] dark:text-white">{requestModalPeer.displayName}</span>
                  {requestModalPeer.year && (
                    <span className="text-[10px] bg-[#3A0F34]/10 dark:bg-purple-900/40 text-[#3A0F34] dark:text-purple-200 font-semibold px-1.5 py-0.5 rounded-md">
                      {requestModalPeer.year}
                    </span>
                  )}
                </div>
                <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5">&quot;{requestModalPeer.statusNote}&quot;</p>
                <p className="text-[11px] text-[#EAAA00] font-medium flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  <span>{requestModalPeer.locationHint}</span>
                </p>
              </div>
            </div>

            {/* Activity tag customization */}
            <div>
              <label className="block text-xs font-bold text-[#3A0F34] dark:text-slate-300 uppercase tracking-wider mb-1">
                Activity Interest
              </label>
              <input
                type="text"
                value={requestActivityInterest}
                maxLength={100}
                onChange={(e) => setRequestActivityInterest(e.target.value)}
                placeholder="e.g. Badminton, Coffee, Study Group"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00]"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Shared with {requestModalPeer.displayName} alongside your student profile ({currentUser.name}{currentUser.year ? `, ${currentUser.year}` : ''}).
              </p>
            </div>

            {/* Action buttons */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRequestModalPeer(null)}
                disabled={isSendingRequest}
                className="py-2.5 px-4 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendMatchRequest}
                disabled={isSendingRequest}
                className="py-2.5 px-5 bg-[#3A0F34] hover:bg-[#52184A] dark:bg-purple-900 dark:hover:bg-purple-800 active:scale-95 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-60"
              >
                {isSendingRequest ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#EAAA00]" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-[#EAAA00]" />
                )}
                <span>{isSendingRequest ? 'Sending...' : 'Send Request'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
