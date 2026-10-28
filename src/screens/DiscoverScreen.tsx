import React, { useState, useMemo } from 'react';
import { Activity, ActivityCategory, UserProfile } from '../types';
import { ActivityCard } from '../components/ActivityCard';
import { matchService } from '../services/matchService';
import { CATEGORIES_CONFIG } from '../data/seedData';
import {
  Search,
  Sparkles,
  PlusCircle,
  X,
  Compass,
} from 'lucide-react';

interface DiscoverScreenProps {
  activities: Activity[];
  currentUser: UserProfile;
  onSelectActivity: (activity: Activity) => void;
  onJoinActivity: (activityId: string) => void;
  onOpenRescueModal: () => void;
  onCreateActivity: () => void;
}

type TimeFilter = 'all' | 'today' | 'tomorrow' | 'weekend';

export const DiscoverScreen: React.FC<DiscoverScreenProps> = ({
  activities,
  currentUser,
  onSelectActivity,
  onJoinActivity,
  onOpenRescueModal,
  onCreateActivity,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<'all' | 'sports' | 'social' | 'study'>('all');
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | 'all'>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sameCampusOnly, setSameCampusOnly] = useState<boolean>(true);

  // Recommendations for this student
  const recommendations = useMemo(() => {
    return matchService.getRecommendations(currentUser, activities, {
      strictCampus: false,
    });
  }, [currentUser, activities]);

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

    return activities.filter((act) => {
      // Exclude cancelled or reported
      if (act.status === 'cancelled' || act.reported) return false;

      // Campus filter
      if (sameCampusOnly && act.campus.toLowerCase() !== currentUser.college.toLowerCase()) {
        return false;
      }

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
      if (timeFilter === 'today') {
        if (actTime > todayEnd || actTime < now) return false;
      } else if (timeFilter === 'tomorrow') {
        if (actTime < tomorrowStart || actTime > tomorrowEnd) return false;
      }

      return true;
    });
  }, [
    activities,
    sameCampusOnly,
    currentUser.college,
    selectedGroup,
    selectedCategory,
    searchQuery,
    timeFilter,
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 space-y-6">
      {/* Signature Banner: Rescue Me From Boredom */}
      <section className="bg-[#3A0F34] text-white rounded-3xl p-5 sm:p-7 shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[#52184A]">
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#EAAA00] flex items-center justify-center text-[#240720]">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
            </span>
            <span className="text-xs font-bold text-[#EAAA00] tracking-wider uppercase">
              Signature Smart Match
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-display text-white">
            Have a gap in your schedule right now?
          </h2>
          <p className="text-xs sm:text-sm text-[#DDE3E8]/80 max-w-xl">
            Let our deterministic matching engine scan upcoming activities at {currentUser.college} for badminton, cricket, coffee, and study groups.
          </p>
        </div>

        <div className="z-10 shrink-0">
          <button
            onClick={onOpenRescueModal}
            className="w-full sm:w-auto py-3 px-6 bg-[#EAAA00] hover:bg-[#D69900] active:scale-95 text-[#240720] font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 fill-[#240720]" />
            <span>Rescue Me From Boredom</span>
          </button>
        </div>
      </section>

      {/* Search & Filter Bar */}
      <section className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search activities, sports, campus venues, hosts..."
            className="w-full pl-11 pr-10 py-3 bg-white rounded-2xl border border-slate-200/90 text-sm text-[#3A0F34] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A0F34] shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Group Filter Tabs (Interactive segmented buttons) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 p-1 bg-white/70 rounded-xl border border-slate-200/80 overflow-x-auto scrollbar-none">
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
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                  selectedGroup === grp.id
                    ? 'bg-[#3A0F34] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#3A0F34]'
                }`}
              >
                {grp.label}
              </button>
            ))}
          </div>

          {/* Same campus toggle */}
          <button
            onClick={() => setSameCampusOnly(!sameCampusOnly)}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors flex items-center gap-1.5 ${
              sameCampusOnly
                ? 'bg-[#3A0F34] text-white border-[#3A0F34]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <span>Only {currentUser.college.split(' ')[0]} Campus</span>
          </button>
        </div>

        {/* Category Pill Sub-filter (when sports or social selected or horizontal scroll) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100'
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
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                selectedCategory === c.category
                  ? 'bg-[#EAAA00] text-[#240720] font-bold shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
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
              <h2 className="text-sm font-extrabold text-[#3A0F34] uppercase tracking-wider font-display">
                Recommended For You
              </h2>
              <p className="text-xs text-slate-500">
                Ranked by your campus, interests ({currentUser.interests.slice(0, 3).join(', ')}), and skill levels
              </p>
            </div>
            <span className="text-xs text-slate-400 font-medium">Deterministic Score</span>
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
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-300/60">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#3A0F34] font-display">
              {searchQuery ? `Search Results (${filteredActivities.length})` : 'All Campus Activities'}
            </h2>
            <p className="text-xs text-slate-500">
              Spontaneous meetups happening across campus venues
            </p>
          </div>

          {/* Time filter controls */}
          <div className="flex items-center gap-1 text-xs bg-white p-1 rounded-xl border border-slate-200">
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
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  timeFilter === tf.id
                    ? 'bg-[#3A0F34] text-white'
                    : 'text-slate-600 hover:text-[#3A0F34]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Activity Grid */}
        {filteredActivities.length > 0 ? (
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
        ) : (
          /* Empty State */
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-slate-200 max-w-lg mx-auto my-8">
            <div className="w-14 h-14 rounded-full bg-[#EEF3F7] text-[#3A0F34] flex items-center justify-center mx-auto mb-3">
              <Compass className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-[#3A0F34]">No matching campus activities</h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              {searchQuery
                ? `No activities matched "${searchQuery}". Try a different search keyword or category.`
                : 'No activities found with your current filters. Start something spontaneous!'}
            </p>
            <button
              onClick={onCreateActivity}
              className="inline-flex items-center gap-2 py-2.5 px-5 bg-[#EAAA00] hover:bg-[#D69900] text-[#240720] font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Host an Activity</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
