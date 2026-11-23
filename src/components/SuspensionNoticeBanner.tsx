import React, { useState } from 'react';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { SuspensionAppealModal } from './SuspensionAppealModal';
import { FEATURES } from '../config/features';

interface SuspensionNoticeBannerProps {
  userId: string;
  reason?: string | null;
  expiresAt?: string | null;
  remainingDays?: number;
  appealStatus?: 'none' | 'submitted' | 'rejected' | 'accepted';
  onAppealSubmitted?: () => void;
}

export const SuspensionNoticeBanner: React.FC<SuspensionNoticeBannerProps> = ({
  userId,
  expiresAt,
  remainingDays = 15,
  appealStatus = 'none',
  onAppealSubmitted,
}) => {
  const [isAppealOpen, setIsAppealOpen] = useState(false);

  if (!FEATURES.FEEDBACK_AND_APPEALS) return null;

  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : 'in 15 days';

  return (
    <>
      <div className="bg-amber-500 text-[#240720] border-b border-amber-600 px-4 py-3 shadow-md animate-in fade-in duration-200">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#240720]/15 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4 text-[#240720]" />
            </div>
            <div>
              <span className="font-extrabold uppercase tracking-wider block sm:inline mr-2">
                Account Suspended ({remainingDays} {remainingDays === 1 ? 'day' : 'days'} remaining)
              </span>
              <span className="font-medium text-[#240720]/90">
                You cannot create or join squads or send match requests until {formattedExpiry}.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {appealStatus === 'submitted' ? (
              <span className="px-3 py-1 bg-[#240720]/20 rounded-xl font-bold text-[11px]">
                Appeal Under Review
              </span>
            ) : (
              <button
                onClick={() => setIsAppealOpen(true)}
                className="py-1 px-3.5 bg-[#240720] hover:bg-[#3A0F34] text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Submit Appeal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {FEATURES.FEEDBACK_AND_APPEALS && (
        <SuspensionAppealModal
          isOpen={isAppealOpen}
          onClose={() => setIsAppealOpen(false)}
          userId={userId}
          onAppealSubmitted={() => {
            setIsAppealOpen(false);
            if (onAppealSubmitted) onAppealSubmitted();
          }}
        />
      )}
    </>
  );
};
