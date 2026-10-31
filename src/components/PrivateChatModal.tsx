import React, { useState, useEffect, useRef } from 'react';
import { PrivateChatMessage, UserProfile } from '../types';
import { waveService } from '../services/waveService';
import {
  X,
  Send,
  Loader2,
  Lock,
  Tag,
  Clock,
  Sparkles,
} from 'lucide-react';

interface PrivateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  otherStudent: {
    uid: string;
    name: string;
    avatarColor?: string;
    avatarInitials?: string;
  };
  activityInterest?: string;
  currentUser: UserProfile;
}

export const PrivateChatModal: React.FC<PrivateChatModalProps> = ({
  isOpen,
  onClose,
  chatId,
  otherStudent,
  activityInterest,
  currentUser,
}) => {
  const [messages, setMessages] = useState<PrivateChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !chatId) return;

    setIsLoading(true);
    setErrorMessage(null);

    const unsubscribe = waveService.subscribeToPrivateChat(
      chatId,
      (newMessages) => {
        setMessages(newMessages);
        setIsLoading(false);
      },
      (err: unknown) => {
        const errorObj = err as Error;
        const msg = errorObj?.message || '';
        if (msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED')) {
          setErrorMessage('Private chat is strictly restricted to participants.');
        } else {
          setErrorMessage('Unable to load private chat messages in real time.');
        }
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isOpen, chatId]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isSending) return;

    if (text.length > 1000) {
      setErrorMessage('Message length cannot exceed 1000 characters.');
      return;
    }

    setIsSending(true);
    setErrorMessage(null);

    try {
      await waveService.sendPrivateMessage(chatId, text, currentUser);
      setInputText('');
    } catch (err: unknown) {
      const errorObj = err as Error;
      setErrorMessage(errorObj?.message || 'Failed to send private message.');
    } finally {
      setIsSending(false);
    }
  };

  const formatMessageTime = (ts: any): string => {
    if (!ts) return 'Just now';
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (ts.seconds) {
      return new Date(ts.seconds * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    const d = new Date(ts);
    return isNaN(d.getTime())
      ? 'Just now'
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        style={{ height: 'min(90vh, 640px)' }}
      >
        {/* Modal Top Header */}
        <div className="bg-[#3A0F34] text-white px-5 py-4 flex items-center justify-between border-b border-[#52184A] shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 border border-white/20 shadow-xs"
              style={{ backgroundColor: otherStudent.avatarColor || '#52184A' }}
            >
              {otherStudent.avatarInitials || otherStudent.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-display text-white">
                  {otherStudent.name}
                </h2>
                <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-400/30">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Private</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#DDE3E8]/80 mt-0.5">
                <span>Direct Squad Chat</span>
                {activityInterest && (
                  <>
                    <span>·</span>
                    <span className="text-[#EAAA00] flex items-center gap-1 font-semibold">
                      <Tag className="w-3 h-3" />
                      <span>{activityInterest}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            title="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="bg-red-50 text-red-700 text-xs px-4 py-2 border-b border-red-200 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-500 font-bold ml-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#DDE3E8]/30">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#3A0F34]" />
              <p className="text-xs">Connecting to private chat room...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500 space-y-2">
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-[#EAAA00] shadow-xs">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-[#3A0F34]">
                Wave Accepted!
              </p>
              <p className="text-xs text-slate-500 max-w-xs">
                You and {otherStudent.name} are now connected. Send a message to coordinate where to meet on campus!
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser.id;

              if (msg.isSystemNotification) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <span className="text-[11px] bg-white text-slate-600 px-3 py-1 rounded-full border border-slate-200 shadow-2xs font-medium">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  {!isMe && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-1 shadow-2xs"
                      style={{ backgroundColor: msg.senderAvatarColor || otherStudent.avatarColor || '#3A0F34' }}
                    >
                      {msg.senderAvatarInitials || msg.senderName.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-xs shadow-2xs leading-relaxed ${
                      isMe
                        ? 'bg-[#3A0F34] text-white rounded-br-xs'
                        : 'bg-white text-slate-800 rounded-bl-xs border border-slate-200/80'
                    }`}
                  >
                    {!isMe && (
                      <span className="block text-[10px] font-bold text-[#3A0F34] mb-0.5">
                        {msg.senderName}
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    <span
                      className={`block text-[9px] mt-1 text-right ${
                        isMe ? 'text-[#DDE3E8]/70' : 'text-slate-400'
                      }`}
                    >
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input Bar */}
        <form
          onSubmit={handleSend}
          className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
        >
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Message ${otherStudent.name}...`}
              maxLength={1000}
              disabled={isSending}
              className="w-full pl-3.5 pr-14 py-2.5 text-xs bg-[#EEF3F7] rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#3A0F34] text-slate-800 placeholder:text-slate-400"
            />
            {inputText.length > 800 && (
              <span className="absolute right-3 top-3 text-[10px] text-slate-400 font-mono">
                {1000 - inputText.length}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="w-10 h-10 rounded-xl bg-[#3A0F34] hover:bg-[#52184A] active:scale-95 text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-xs"
            title="Send private message"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-[#EAAA00]" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
