import React, { useState, useMemo } from 'react';
import { Activity, ActivityCategory, UserProfile } from '../types';
import { ActivityCard } from '../components/ActivityCard';
import { matchService } from '../services/matchService';
import { CATEGORIES_CONFIG } from '../data/seedData';
import {
  Search,
  PlusCircle,
  X,
  Compass,
  Loader2,
} from 'lucide-react';

interface DiscoverScreenProps {
  activities: Activity[];
  currentUser: UserProfile;
  onSelectActivity: (activity: Activity) => void;
  onJoinActivity: (activityId: string) => void;
  onCreateActivity: () => void;
  hasMoreActivities?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

type TimeFilter = 'all' | 'today' | 'tomorrow' | 'weekend';

export const DiscoverScreen: React.FC<DiscoverScreenProps> = ({
  activities,
  currentUser,
  onSelectActivity,
  onJoinActivity,
  onCreateActivity,
  hasMoreActivities = false,
  isLoadingMore = false,
  onLoadMore,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<'all' | 'sports' | 'social' | 'study'>('all');
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | 'all'>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  // Only consider active, unexpired, and non-ended activities for the Discover page
  const activeActivities = useMemo(() => {
    const now = Date.now();
    return activities.filter((act) => {
      // Exclude completed, cancelled, ended, or reported activities
      if (act.status === 'completed' || act.status === 'cancelled') return false;
      if (act.endedAt || act.endedByUid || act.reported) return false;

      // Exclude activities where scheduled time + duration has passed
      const actTime = new Date(act.dateTime).getTime();
      if (isNaN(actTime)) return false;
      const durationMs = (Number(act.durationMinutes) || 60) * 60000;
      if (actTime + durationMs <= now) return false;

      return true;
    });
  }, [activities]);

  // Recommendations for this student (active activities only)
  const recommendations = useMemo(() => {
    return matchService.getRecommendations(currentUser, activeActivities, {
      strictCampus: false,
    });
  }, [currentUser, activeActivities]);

  // Recommendation lookup map for instant score/reasons on cards
  const matchMap = useMemo(() => {
    const map = new Map<string, { score: number; reasons: string[] }>();
    recommendations.forEach((rec) => {
      map.set(rec.activity.id, {
        score: rec.score,
        reasons: rec.matchReasons,
      });
    });
    return map;
  }, [recommendations]);

  // Filtered activities list
  const filteredActivities = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const tomorrowStart = new Date(todayEnd.getTime() + 1);
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    return activeActivities.filter((act) => {
      // Group filter
      if (selectedGroup !== 'all' && act.categoryGroup !== selectedGroup) {
        return false;
      }

      // Specific Category filter
      if (selectedCategory !== 'all' && act.category !== selectedCategory) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = act.title.toLowerCase().includes(query);
        const matchesVenue = act.venue.toLowerCase().includes(query);
        const matchesHost = act.hostName.toLowerCase().includes(query);
        const matchesCategory = act.category.toLowerCase().includes(query);
        if (!matchesTitle && !matchesVenue && !matchesHost && !matchesCategory) {
          return false;
        }
      }

      // Time filter
      const actTime = new Date(act.dateTime);
      const actEnd = new Date(actTime.getTime() + (Number(act.durationMinutes) || 60) * 60000);
      if (timeFilter === 'today') {
        if (actTime > todayEnd || actEnd < now) return false;
      } else if (timeFilter === 'tomorrow') {
        if (actTime < tomorrowStart || actTime > tomorrowEnd) return false;
      }

      return true;
    });
  }, [
    activeActivities,
    selectedGroup,
    selectedCategory,
    searchQuery,
    timeFilter,
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 space-y-6">
      {/* Search & Filter Bar */}
      <section className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search activities, sports, campus venues, hosts..."
            className="w-full pl-11 pr-10 py-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-sm text-[#3A0F34] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#3A0F34] dark:focus:ring-[#EAAA00] shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Group Filter Tabs (Interactive segmented buttons) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 p-1 bg-white/70 dark:bg-slate-900/80 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-x-auto scrollbar-none">
            {(
              [
                { id: 'all', label: 'All Activities' },
                { id: 'sports', label: '🏸 Sports' },
                { id: 'social', label: '☕ Social & Food' },
                { id: 'study', label: '📚 Study & Focus' },
              ] as const
            ).map((grp) => (
              <button
                key={grp.id}
                onClick={() => {
                  setSelectedGroup(grp.id);
                  setSelectedCategory('all');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  selectedGroup === grp.id
                    ? 'bg-[#3A0F34] dark:bg-purple-950 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#3A0F34] dark:hover:text-white'
                }`}
              >
                {grp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Pill Sub-filter (when sports or social selected or horizontal scroll) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-slate-800 dark:bg-slate-700 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent dark:border-slate-700/60'
            }`}
          >
            All Vibes
          </button>
          {CATEGORIES_CONFIG.filter((cat) =>
            selectedGroup === 'all' ? true : cat.group === selectedGroup
          ).map((c) => (
            <button
              key={c.category}
              onClick={() => setSelectedCategory(c.category)}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                selectedCategory === c.category
                  ? 'bg-[#EAAA00] text-[#240720] font-bold shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent dark:border-slate-700/60'
              }`}
            >
              <span>{c.icon}</span>
              <span>{c.category}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Recommended for You Section (Deterministic Highlights) */}
      {searchQuery === '' && selectedCategory === 'all' && recommendations.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-[#3A0F34] dark:text-white uppercase tracking-wider font-display">
                Recommended For You
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ranked by your campus, interests ({currentUser.interests.slice(0, 3).join(', ')}), and skill levels
              </p>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Deterministic Score</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendations.slice(0, 3).map((rec) => (
              <ActivityCard
                key={`rec_${rec.activity.id}`}
                activity={rec.activity}
                currentUser={currentUser}
                onClick={() => onSelectActivity(rec.activity)}
                onJoin={(e, id) => {
                  e.stopPropagation();
                  onJoinActivity(id);
                }}
                matchScore={rec.score}
                matchReasons={rec.matchReasons}
              />
            ))}
          </div>
        </section>
      )}

      {/* Main Activities Feed Header */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-300/60 dark:border-slate-800">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#3A0F34] dark:text-slate-100 font-display">
              {searchQuery ? `Search Results (${filteredActivities.length})` : 'All Campus Activities'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Spontaneous meetups happening across campus venues
            </p>
          </div>

          {/* Time filter controls */}
          <div className="flex items-center gap-1 text-xs bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'all', label: 'All Times' },
                { id: 'today', label: 'Today' },
                { id: 'tomorrow', label: 'Tomorrow' },
              ] as const
            ).map((tf) => (
              <button
                key={tf.id}
                onClick={() => setTimeFilter(tf.id)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  timeFilter === tf.id
                    ? 'bg-[#3A0F34] dark:bg-[#EAAA00] text-white dark:text-[#240720]'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#3A0F34] dark:hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Activity Grid */}
        {filteredActivities.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredActivities.map((act) => {
                const match = matchMap.get(act.id);
                return (
                  <ActivityCard
                    key={act.id}
                    activity={act}
                    currentUser={currentUser}
                    onClick={() => onSelectActivity(act)}
                    onJoin={(e, id) => {
                      e.stopPropagation();
                      onJoinActivity(id);
                    }}
                    matchScore={match?.score}
                    matchReasons={match?.reasons}
                  />
                );
              })}
            </div>

            {hasMoreActivities && onLoadMore && (
              <div className="pt-3 flex justify-center">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="px-5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-[#3A0F34] dark:text-slate-200 shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EAAA00]" />}
                  <span>{isLoadingMore ? 'Loading More Activities...' : 'Load More Activities'}</span>
                </button>
              </div>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 sm:p-12 text-center border border-slate-200 dark:border-slate-800 max-w-lg mx-auto my-8">
            <div className="w-14 h-14 rounded-full bg-[#EEF3F7] dark:bg-slate-800 text-[#3A0F34] dark:text-[#EAAA00] flex items-center justify-center mx-auto mb-3">
              <Compass className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-[#3A0F34] dark:text-white">No matching campus activities</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
              {searchQuery
                ? `No activities matched "${searchQuery}". Try a different search keyword or category.`
                : 'No activities found with your current filters. Start something spontaneous!'}
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={onCreateActivity}
                className="inline-flex items-center gap-2 py-2.5 px-5 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Host an Activity</span>
              </button>
              {hasMoreActivities && onLoadMore && (
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 py-2.5 px-4 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[#3A0F34] dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  {isLoadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EAAA00]" />}
                  <span>Load More</span>
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
