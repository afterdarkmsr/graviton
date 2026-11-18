import React, { useEffect, useState } from 'react';
import { UserReputation } from '../types';
import { feedbackService } from '../services/feedbackService';
import { X, Star, Tag, Loader2, Sparkles } from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  displayName: string;
  avatarColor?: string;
  avatarInitials?: string;
  collegeOrCampus?: string;
  academicYear?: string;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  userId,
  displayName,
  avatarColor = '#3A0F34',
  avatarInitials = 'ST',
  collegeOrCampus,
  academicYear,
}) => {
  const [reputation, setReputation] = useState<UserReputation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !userId) return;

    setIsLoading(true);
    feedbackService
      .getUserReputation(userId)
      .then((rep) => {
        setReputation(rep);
      })
      .catch((err) => {
        console.warn('Could not load user reputation:', err);
        setReputation(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const totalRatings = reputation?.totalRatings || 0;
  const avgRating = reputation?.averageRating ? reputation.averageRating.toFixed(1) : null;
  const tagCounts: Record<string, number> = (reputation?.tagCounts || {}) as Record<string, number>;
  const activeTags: [string, number][] = Object.entries(tagCounts).filter(([_, count]) => count > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Strip with Avatar */}
        <div className="bg-gradient-to-r from-[#3A0F34] to-[#52184A] dark:from-purple-950 dark:to-slate-900 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="Close profile"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold border-2 border-white/20 shadow-md shrink-0"
              style={{ backgroundColor: avatarColor }}
            >
              {avatarInitials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-lg font-bold truncate">{displayName}</h3>
              </div>
              {collegeOrCampus && (
                <p className="text-xs text-purple-200/80 truncate">{collegeOrCampus}</p>
              )}
              {academicYear && (
                <p className="text-[11px] text-purple-200/60">{academicYear}</p>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#EAAA00]" />
              <span className="text-xs">Loading campus reputation...</span>
            </div>
          ) : (
            <>
              {/* Star Rating Overview */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Squad Rating
                  </span>
                  {totalRatings > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[#EAAA00]">
                        <Star className="w-5 h-5 fill-current" />
                        <span className="text-xl font-extrabold text-[#3A0F34] dark:text-slate-100 font-display">
                          {avgRating}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">/ 5.0</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Sparkles className="w-4 h-4 text-[#EAAA00]" />
                      <span>New Campus Member</span>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Total Ratings
                  </span>
                  <span className="text-sm font-bold text-[#3A0F34] dark:text-slate-100">
                    {totalRatings} {totalRatings === 1 ? 'rating' : 'ratings'}
                  </span>
                </div>
              </div>

              {/* Feedback Tags Section */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#EAAA00]" />
                    <span>Peer Feedback Tags</span>
                  </h4>
                  {activeTags.length > 0 && (
                    <span className="text-[10px] text-slate-400">
                      {activeTags.reduce((sum, [_, c]) => sum + c, 0)} endorsements
                    </span>
                  )}
                </div>

                {activeTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activeTags.map(([tag, count]) => {
                      const isPositive = tag !== 'Unfriendly' && tag !== 'Not Cooperative';
                      return (
                        <div
                          key={tag}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                            isPositive
                              ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-900/40 text-amber-900 dark:text-amber-200'
                              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300'
                          }`}
                        >
                          <span>{tag}</span>
                          <span className="w-5 h-5 rounded-full bg-white/80 dark:bg-black/30 flex items-center justify-center text-[10px] font-bold">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2">
                    No feedback tags recorded yet. Tags appear here after participating in completed squads.
                  </p>
                )}
              </div>

              {/* Privacy / Confidentiality Notice */}
              <div className="p-3 bg-[#EEF3F7] dark:bg-slate-800/40 rounded-xl text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                🔒 Ratings and feedback tags are aggregated. Individual reviewer identities and written comments are strictly confidential.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
