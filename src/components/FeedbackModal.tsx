import React, { useState, useEffect } from 'react';
import {
  Activity,
  ActivityFeedback,
  FEEDBACK_TAGS,
  FeedbackTag,
  RatingStarValue,
  UserProfile,
} from '../types';
import { feedbackService } from '../services/feedbackService';
import {
  X,
  Star,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ThumbsUp,
  Sparkles,
  MessageSquare,
} from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: Activity;
  currentUser: UserProfile;
  publicProfiles?: Record<string, { displayName: string; avatarColor: string; avatarInitials: string }>;
  onFeedbackSubmitted?: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  activity,
  currentUser,
  publicProfiles = {},
  onFeedbackSubmitted,
}) => {
  const [existingFeedbacks, setExistingFeedbacks] = useState<Record<string, ActivityFeedback>>({});
  const [isLoadingFeedbacks, setIsLoadingFeedbacks] = useState(true);

  // Active form state for the currently selected participant
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [rating, setRating] = useState<RatingStarValue>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<FeedbackTag[]>(['Friendly', 'Cooperative']);
  const [comment, setComment] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Eligible participants excluding current user
  const otherParticipantIds = (activity.participantIds || []).filter((id) => id !== currentUser.id);

  // Load existing feedback submissions on open
  useEffect(() => {
    if (!isOpen || !activity.id || !currentUser.id) return;

    setIsLoadingFeedbacks(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    feedbackService
      .getFeedbacksForActivityByRater(activity.id, currentUser.id)
      .then((records) => {
        setExistingFeedbacks(records);
        // Find first unrated participant
        const unrated = otherParticipantIds.find((id) => !records[id]);
        setActiveTargetId(unrated || otherParticipantIds[0] || null);
      })
      .catch((err) => {
        console.warn('Could not load existing feedbacks:', err);
        setExistingFeedbacks({});
        setActiveTargetId(otherParticipantIds[0] || null);
      })
      .finally(() => {
        setIsLoadingFeedbacks(false);
      });
  }, [isOpen, activity.id, currentUser.id]);

  if (!isOpen) return null;

  const getParticipantInfo = (id: string) => {
    const isHost = id === activity.hostId || id === activity.createdBy;
    const isMatched = activity.isOneToOne && id === activity.requesterUid;
    const pub = publicProfiles[id];

    const name = isHost
      ? activity.hostName
      : isMatched
      ? activity.requesterName || pub?.displayName || 'Match Partner'
      : pub?.displayName || `Campus Student (${id.slice(0, 5)})`;

    const initials = isHost
      ? activity.hostAvatarInitials || 'HO'
      : pub?.avatarInitials || name.slice(0, 2).toUpperCase();

    const color = isHost
      ? activity.hostAvatarColor || '#3A0F34'
      : pub?.avatarColor || '#52184A';

    return { name, initials, color, isHost };
  };

  const activeTargetInfo = activeTargetId ? getParticipantInfo(activeTargetId) : null;
  const isTargetAlreadyRated = activeTargetId ? !!existingFeedbacks[activeTargetId] : false;
  const allRated =
    otherParticipantIds.length > 0 &&
    otherParticipantIds.every((id) => !!existingFeedbacks[id]);

  const toggleTag = (tag: FeedbackTag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTargetId || !activeTargetInfo || isSubmitting) return;

    setSubmitError(null);
    setSubmitSuccess(null);
    setIsSubmitting(true);

    try {
      const submitted = await feedbackService.submitFeedback({
        activityId: activity.id,
        activityTitle: activity.title,
        isOneToOne: !!activity.isOneToOne,
        raterId: currentUser.id,
        raterName: currentUser.name,
        targetUserId: activeTargetId,
        targetUserName: activeTargetInfo.name,
        rating,
        tags: selectedTags,
        comment: comment.trim() || undefined,
      });

      // Update local state
      setExistingFeedbacks((prev) => ({
        ...prev,
        [activeTargetId]: submitted,
      }));

      setSubmitSuccess(`Feedback recorded for ${activeTargetInfo.name}!`);
      setComment('');
      setSelectedTags(['Friendly']);
      setRating(5);

      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }

      // Automatically advance to the next unrated participant if any
      const nextUnrated = otherParticipantIds.find(
        (id) => id !== activeTargetId && !existingFeedbacks[id]
      );
      if (nextUnrated) {
        setTimeout(() => {
          setActiveTargetId(nextUnrated);
          setSubmitSuccess(null);
        }, 800);
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      setSubmitError(errorObj?.message || 'Failed to submit feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#EAAA00] uppercase tracking-wider mb-1">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>Squad Feedback & Reputation</span>
            </div>
            <h2 className="text-xl font-bold font-display text-[#3A0F34] dark:text-slate-100 leading-tight">
              {activity.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rate verified squad members. Feedback is private and builds campus trust.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer shrink-0"
            aria-label="Close feedback modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {isLoadingFeedbacks ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#EAAA00]" />
              <span className="text-xs">Checking activity roster...</span>
            </div>
          ) : otherParticipantIds.length === 0 ? (
            <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
              There were no other participants in this activity to rate.
            </div>
          ) : (
            <>
              {/* Participant Selection Roster Strip */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2.5">
                  Select Member to Rate ({otherParticipantIds.length})
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {otherParticipantIds.map((id) => {
                    const info = getParticipantInfo(id);
                    const isRated = !!existingFeedbacks[id];
                    const isSelected = activeTargetId === id;

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setActiveTargetId(id);
                          setSubmitError(null);
                          setSubmitSuccess(null);
                        }}
                        className={`p-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#3A0F34] dark:border-[#EAAA00] bg-slate-50 dark:bg-slate-800/80 ring-2 ring-[#3A0F34]/15 dark:ring-[#EAAA00]/20'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: info.color }}
                          >
                            {info.initials}
                          </div>
                          <div className="truncate">
                            <span className="text-xs font-bold text-[#3A0F34] dark:text-slate-100 block truncate">
                              {info.name}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              {info.isHost ? 'Host' : 'Member'}
                            </span>
                          </div>
                        </div>

                        {isRated ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Rated</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 shrink-0">
                            Pending
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Alerts */}
              {submitError && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{submitError}</span>
                </div>
              )}

              {submitSuccess && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{submitSuccess}</span>
                </div>
              )}

              {/* All participants rated banner */}
              {allRated && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl text-center space-y-1">
                  <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 mb-1">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    All Squad Feedback Submitted!
                  </h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Thank you for contributing to safe and accountable student connections at CGC.
                  </p>
                </div>
              )}

              {/* Rating Form for Active Target */}
              {activeTargetId && activeTargetInfo && (
                <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 block">Rating for</span>
                      <h3 className="text-sm font-bold text-[#3A0F34] dark:text-slate-100">
                        {activeTargetInfo.name}
                      </h3>
                    </div>
                    {isTargetAlreadyRated && (
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 px-2.5 py-1 rounded-xl">
                        Feedback Recorded ✓
                      </span>
                    )}
                  </div>

                  {isTargetAlreadyRated ? (
                    // Display submitted feedback (read-only)
                    <div className="space-y-3 pt-1">
                      <div>
                        <span className="text-[11px] text-slate-500 block mb-1">Star Rating</span>
                        <div className="flex items-center gap-1 text-[#EAAA00]">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-5 h-5 ${
                                i < existingFeedbacks[activeTargetId].rating
                                  ? 'fill-current text-[#EAAA00]'
                                  : 'text-slate-300 dark:text-slate-600'
                              }`}
                            />
                          ))}
                          <span className="ml-2 text-xs font-bold text-[#3A0F34] dark:text-slate-200">
                            {existingFeedbacks[activeTargetId].rating} / 5
                          </span>
                        </div>
                      </div>

                      {existingFeedbacks[activeTargetId].tags?.length > 0 && (
                        <div>
                          <span className="text-[11px] text-slate-500 block mb-1.5">Selected Tags</span>
                          <div className="flex flex-wrap gap-1.5">
                            {existingFeedbacks[activeTargetId].tags.map((t) => (
                              <span
                                key={t}
                                className="text-xs font-medium px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {existingFeedbacks[activeTargetId].comment && (
                        <div>
                          <span className="text-[11px] text-slate-500 block mb-1">Your Note (Private)</span>
                          <p className="text-xs text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                            &quot;{existingFeedbacks[activeTargetId].comment}&quot;
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Interactive submission form
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Star Rating Picker */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          How was your experience? (1–5 Stars)
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            {[1, 2, 3, 4, 5].map((starNum) => {
                              const isFilled = (hoverRating || rating) >= starNum;
                              return (
                                <button
                                  key={starNum}
                                  type="button"
                                  onClick={() => setRating(starNum as RatingStarValue)}
                                  onMouseEnter={() => setHoverRating(starNum)}
                                  onMouseLeave={() => setHoverRating(0)}
                                  className="p-1 hover:scale-115 active:scale-95 transition-transform text-[#EAAA00] cursor-pointer"
                                  aria-label={`${starNum} stars`}
                                >
                                  <Star
                                    className={`w-7 h-7 ${
                                      isFilled ? 'fill-current text-[#EAAA00]' : 'text-slate-300 dark:text-slate-600'
                                    }`}
                                  />
                                </button>
                              );
                            })}
                          </div>
                          <span className="text-xs font-bold text-[#3A0F34] dark:text-slate-200 ml-2">
                            {rating === 5
                              ? '⭐ 5 - Excellent'
                              : rating === 4
                              ? '⭐ 4 - Very Good'
                              : rating === 3
                              ? '⭐ 3 - Good'
                              : rating === 2
                              ? '⭐ 2 - Fair'
                              : '⭐ 1 - Poor'}
                          </span>
                        </div>
                      </div>

                      {/* Feedback Tags Selector */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          Select feedback tags (Optional)
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {FEEDBACK_TAGS.map((tag) => {
                            const isSelected = selectedTags.includes(tag);
                            const isNegative = tag === 'Unfriendly' || tag === 'Not Cooperative';

                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => toggleTag(tag)}
                                className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                                  isSelected
                                    ? isNegative
                                      ? 'bg-red-100 dark:bg-red-950/60 border-red-300 dark:border-red-900/60 text-red-800 dark:text-red-300 font-bold'
                                      : 'bg-[#3A0F34] dark:bg-[#EAAA00] border-[#3A0F34] dark:border-[#EAAA00] text-white dark:text-[#240720] font-bold shadow-xs'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Optional Short Written Feedback */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                            <span>Private feedback note (Optional)</span>
                          </label>
                          <span className="text-[10px] text-slate-400">{comment.length}/500</span>
                        </div>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value.slice(0, 500))}
                          placeholder="Short constructive comments for moderation safety..."
                          rows={2}
                          className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#3A0F34]/20 resize-none"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          🔒 Individual comments and reviewer identities remain strictly confidential and are never published on student profiles.
                        </p>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-2.5 px-4 bg-[#EAAA00] hover:bg-[#D69900] disabled:opacity-60 text-[#240720] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Recording feedback...</span>
                          </>
                        ) : (
                          <>
                            <ThumbsUp className="w-4 h-4" />
                            <span>Submit Rating for {activeTargetInfo.name}</span>
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="py-2 px-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
