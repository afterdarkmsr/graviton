import React from 'react';
import { ActiveTab, UserProfile } from '../types';
import { Compass, Zap, Plus, CalendarCheck, User, Sparkles } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  currentTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  profile: UserProfile;
  joinedCount: number;
  onOpenRescueModal: () => void;
  incomingMatchRequestsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  profile,
  joinedCount,
  onOpenRescueModal,
  incomingMatchRequestsCount = 0,
}) => {
  const isFreeNowActive = profile.freeUntil && profile.freeUntil > Date.now();

  return (
    <>
      {/* =========================================================================
          Desktop & Tablet Top Header (follows Top Bar Contract: 3 zones, gap-8)
          ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Wordmark (Single text element) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onTabChange('discover')}
              className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#3A0F34] dark:text-white font-display whitespace-nowrap flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EAAA00] rounded-lg cursor-pointer"
            >
              <span>VibeMatch</span>
              <span className="w-2 h-2 rounded-full bg-[#EAAA00]" />
            </button>
            <span className="hidden md:inline text-xs text-slate-400 dark:text-slate-500 font-medium">·</span>
            <span className="hidden md:inline text-xs font-semibold text-[#3A0F34] dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
              CGC Community
            </span>
          </div>

          {/* Zone 2: Navigation Links (single line, whitespace-nowrap) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <button
              onClick={() => onTabChange('discover')}
              className={`hover:text-[#3A0F34] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                currentTab === 'discover'
                  ? 'border-[#3A0F34] text-[#3A0F34] dark:border-[#EAAA00] dark:text-[#EAAA00]'
                  : 'border-transparent'
              }`}
            >
              Discover
            </button>
            <button
              onClick={() => onTabChange('free_now')}
              className={`hover:text-[#3A0F34] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 flex items-center gap-1.5 cursor-pointer ${
                currentTab === 'free_now'
                  ? 'border-[#3A0F34] text-[#3A0F34] dark:border-[#EAAA00] dark:text-[#EAAA00]'
                  : 'border-transparent'
              }`}
            >
              <span>Who's Free</span>
              {incomingMatchRequestsCount > 0 ? (
                <span className="text-[10px] bg-[#EAAA00] text-[#240720] px-1.5 py-0.2 rounded-full font-bold tabular-nums">
                  {incomingMatchRequestsCount}
                </span>
              ) : isFreeNowActive ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              ) : null}
            </button>
            <button
              onClick={() => onTabChange('create')}
              className={`hover:text-[#3A0F34] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                currentTab === 'create'
                  ? 'border-[#3A0F34] text-[#3A0F34] dark:border-[#EAAA00] dark:text-[#EAAA00]'
                  : 'border-transparent'
              }`}
            >
              Create Squad
            </button>
            <button
              onClick={() => onTabChange('my_activities')}
              className={`hover:text-[#3A0F34] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 flex items-center gap-1.5 cursor-pointer ${
                currentTab === 'my_activities'
                  ? 'border-[#3A0F34] text-[#3A0F34] dark:border-[#EAAA00] dark:text-[#EAAA00]'
                  : 'border-transparent'
              }`}
            >
              <span>My Squads</span>
              {joinedCount > 0 && (
                <span className="text-[11px] px-1.5 py-0.2 bg-[#3A0F34] text-white rounded-full font-bold tabular-nums">
                  {joinedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => onTabChange('profile')}
              className={`hover:text-[#3A0F34] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                currentTab === 'profile'
                  ? 'border-[#3A0F34] text-[#3A0F34] dark:border-[#EAAA00] dark:text-[#EAAA00]'
                  : 'border-transparent'
              }`}
            >
              Profile
            </button>
          </nav>

          {/* Zone 3: Actions (Theme Toggle + Rescue Me + Profile) */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Theme Toggle Button (Available on both desktop & mobile top header) */}
            <ThemeToggle />

            <button
              onClick={onOpenRescueModal}
              className="min-h-[40px] px-3 sm:px-4 py-2 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] font-bold text-xs sm:text-sm rounded-xl shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Find spontaneous activities matching your profile right now"
            >
              <Sparkles className="w-4 h-4 fill-[#240720]" />
              <span className="hidden sm:inline">Rescue Me</span>
              <span className="sm:hidden">Rescue</span>
            </button>

            {/* Profile Avatar Quick Click */}
            <button
              onClick={() => onTabChange('profile')}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 hover:ring-2 hover:ring-[#3A0F34] dark:hover:ring-[#EAAA00] transition-all cursor-pointer"
              style={{ backgroundColor: profile.avatarColor || '#3A0F34' }}
              title="Open your profile"
              aria-label="Profile"
            >
              {profile.avatarInitials || 'ME'}
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          Mobile Bottom Navigation Bar (Thumb Zone: 5 standard destinations)
          ========================================================================= */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800 shadow-lg pb-safe"
        aria-label="Mobile Navigation"
      >
        <div className="grid grid-cols-5 items-center h-16 max-w-md mx-auto px-2">
          {/* Tab 1: Discover */}
          <button
            onClick={() => onTabChange('discover')}
            className={`min-h-[44px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
              currentTab === 'discover'
                ? 'text-[#3A0F34] dark:text-[#EAAA00] font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Compass className={`w-5 h-5 ${currentTab === 'discover' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-1">Discover</span>
          </button>

          {/* Tab 2: Who's Free */}
          <button
            onClick={() => onTabChange('free_now')}
            className={`min-h-[44px] flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
              currentTab === 'free_now'
                ? 'text-[#3A0F34] dark:text-[#EAAA00] font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Zap className={`w-5 h-5 ${currentTab === 'free_now' ? 'stroke-[2.5] text-[#EAAA00]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-1">Free Now</span>
            {incomingMatchRequestsCount > 0 ? (
              <span className="absolute top-1 right-3 min-w-[16px] h-4 px-1 rounded-full bg-[#EAAA00] text-[#240720] text-[9px] font-bold flex items-center justify-center">
                {incomingMatchRequestsCount}
              </span>
            ) : isFreeNowActive ? (
              <span className="absolute top-1.5 right-4 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            ) : null}
          </button>

          {/* Tab 3: Create Squad (Center Action) */}
          <button
            onClick={() => onTabChange('create')}
            className="min-h-[44px] flex flex-col items-center justify-center -mt-3 cursor-pointer"
            aria-label="Create Squad"
          >
            <div className="w-12 h-12 rounded-full bg-[#EAAA00] text-[#240720] shadow-md flex items-center justify-center hover:bg-[#D69900] active:scale-95 transition-all">
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </div>
            <span className="text-[10px] mt-0.5 font-semibold text-[#3A0F34] dark:text-slate-200">Create</span>
          </button>

          {/* Tab 4: My Squads */}
          <button
            onClick={() => onTabChange('my_activities')}
            className={`min-h-[44px] flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
              currentTab === 'my_activities'
                ? 'text-[#3A0F34] dark:text-[#EAAA00] font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <CalendarCheck className={`w-5 h-5 ${currentTab === 'my_activities' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-1">My Squads</span>
            {joinedCount > 0 && (
              <span className="absolute top-1.5 right-4 min-w-[16px] h-4 px-1 rounded-full bg-[#3A0F34] dark:bg-purple-700 text-white text-[9px] font-bold flex items-center justify-center">
                {joinedCount}
              </span>
            )}
          </button>

          {/* Tab 5: Profile */}
          <button
            onClick={() => onTabChange('profile')}
            className={`min-h-[44px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
              currentTab === 'profile'
                ? 'text-[#3A0F34] dark:text-[#EAAA00] font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <User className={`w-5 h-5 ${currentTab === 'profile' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-1">Profile</span>
          </button>
        </div>
      </nav>
    </>
  );
};
