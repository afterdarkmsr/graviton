import React, { useState, useEffect } from 'react';
import { WaveRequest, UserProfile } from '../types';
import { waveService } from '../services/waveService';
import { HandMetal, Check, X, Loader2, Sparkles, MessageCircle } from 'lucide-react';

interface WaveNotificationBannerProps {
  incomingWaves: WaveRequest[];
  currentUser: UserProfile;
  onOpenPrivateChat: (
    chatId: string,
    otherStudent: { uid: string; name: string; avatarColor?: string; avatarInitials?: string },
    activityInterest?: string
  ) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const WaveNotificationBanner: React.FC<WaveNotificationBannerProps> = ({
  incomingWaves,
  currentUser,
  onOpenPrivateChat,
  onToast,
}) => {
  const [processingWaveId, setProcessingWaveId] = useState<string | null>(null);

  // Filter only pending incoming waves defensively
  const pendingWaves = incomingWaves.filter(
    (w) => w.status?.toLowerCase().trim() === 'pending'
  );

  useEffect(() => {
    if (pendingWaves.length > 0) {
      console.log(
        `[WaveNotificationBanner] Displaying ${pendingWaves.length} pending incoming wave(s) for user ${currentUser.id}:`,
        pendingWaves
      );
    }
  }, [pendingWaves.length, currentUser.id]);

  if (pendingWaves.length === 0) return null;

  const handleAccept = async (wave: WaveRequest) => {
    if (processingWaveId) return;
    setProcessingWaveId(wave.id);

    try {
      const res = await waveService.respondToWave(wave.id, true, currentUser);
      onToast(`Wave accepted! Connecting with ${wave.senderName}...`, 'success');
      if (res.chatId) {
        onOpenPrivateChat(
          res.chatId,
          {
            uid: wave.senderUid,
            name: wave.senderName,
            avatarColor: wave.senderAvatarColor,
            avatarInitials: wave.senderAvatarInitials,
          },
          wave.activityInterest
        );
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      let displayMsg = errorObj?.message || 'Failed to accept wave.';
      try {
        const parsed = JSON.parse(displayMsg);
        if (parsed?.error) displayMsg = parsed.error;
      } catch {
        // raw
      }
      onToast(displayMsg, 'error');
    } finally {
      setProcessingWaveId(null);
    }
  };

  const handleDecline = async (wave: WaveRequest) => {
    if (processingWaveId) return;
    setProcessingWaveId(wave.id);

    try {
      await waveService.respondToWave(wave.id, false, currentUser);
      onToast(`Wave from ${wave.senderName} declined.`, 'info');
    } catch (err: unknown) {
      const errorObj = err as Error;
      let displayMsg = errorObj?.message || 'Failed to decline wave.';
      try {
        const parsed = JSON.parse(displayMsg);
        if (parsed?.error) displayMsg = parsed.error;
      } catch {
        // raw
      }
      onToast(displayMsg, 'error');
    } finally {
      setProcessingWaveId(null);
    }
  };

  return (
    <div className="fixed top-20 right-4 left-4 sm:left-auto sm:right-6 sm:w-96 z-50 space-y-3 pointer-events-auto">
      {pendingWaves.map((wave) => {
        const isBusy = processingWaveId === wave.id;

        return (
          <div
            key={wave.id}
            className="bg-[#3A0F34] text-white rounded-2xl p-4 shadow-xl border-2 border-[#EAAA00] animate-in fade-in slide-in-from-top-4 duration-300"
          >
            {/* Header: Sender avatar & Name */}
            <div className="flex items-start justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 border border-white/20 shadow-xs"
                  style={{ backgroundColor: wave.senderAvatarColor || '#52184A' }}
                >
                  {wave.senderAvatarInitials || wave.senderName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white block">
                      {wave.senderName}
                    </span>
                    <span className="text-[10px] bg-[#EAAA00] text-[#240720] font-extrabold px-1.5 py-0.2 rounded-sm uppercase">
                      New Wave
                    </span>
                  </div>
                  <p className="text-[11px] text-[#DDE3E8]/80 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#EAAA00]" />
                    <span>Waved for: <strong>{wave.activityInterest}</strong></span>
                  </p>
                </div>
              </div>

              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[#EAAA00] shrink-0">
                <HandMetal className="w-4 h-4" />
              </div>
            </div>

            <p className="text-xs text-white/90 bg-white/10 p-2.5 rounded-xl mb-3">
              &quot;Hey! I saw your campus broadcast and I&apos;m down to hang out for {wave.activityInterest}.&quot;
            </p>

            {/* Actions: Accept & Decline */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAccept(wave)}
                disabled={isBusy}
                className="flex-1 py-2 px-3 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {isBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                )}
                <span>Accept &amp; Chat</span>
              </button>

              <button
                onClick={() => handleDecline(wave)}
                disabled={isBusy}
                className="py-2 px-3 bg-white/10 hover:bg-white/20 active:scale-95 text-white/80 hover:text-white font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-60"
              >
                <X className="w-3.5 h-3.5" />
                <span>Decline</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
