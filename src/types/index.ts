export type ActivityCategory =
  | 'Badminton'
  | 'Cricket'
  | 'Basketball'
  | 'Football'
  | 'Walking'
  | 'Coffee'
  | 'Lunch'
  | 'Study Group'
  | 'Campus Hangout'
  | 'Running'
  | 'Gym'
  | 'Board Games';

export type SkillLevel = 'All Levels' | 'Beginner' | 'Intermediate' | 'Advanced';

export type AvailabilitySlot =
  | 'Mornings (8AM - 12PM)'
  | 'Afternoons (12PM - 5PM)'
  | 'Evenings (5PM - 9PM)'
  | 'Late Night (9PM+)'
  | 'Weekends';

export interface UserProfile {
  id: string;
  userId?: string;
  email?: string;
  name: string;
  college: string;
  year: string;
  bio: string;
  avatarColor: string;
  avatarInitials: string;
  interests: ActivityCategory[];
  skillLevels: Partial<Record<ActivityCategory, SkillLevel>>;
  typicalAvailability: AvailabilitySlot[];
  privacyPreferences: {
    showCollegeToCampusPeers: boolean;
    onlyMatchCompatibleSkills: boolean;
    allowDirectInvites: boolean;
  };
  freeUntil: number | null; // Timestamp epoch
  freeStatusNote: string | null;
  isOnboarded?: boolean;
  isSampleUser?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Activity {
  id: string;
  title: string;
  category: ActivityCategory;
  categoryGroup: 'sports' | 'social' | 'study';
  description: string;
  campus: string;
  venue: string; // Named public campus venue
  dateTime: string; // ISO string
  durationMinutes: number;
  maxParticipants: number;
  skillLevel: SkillLevel;
  hostId: string;
  hostName: string;
  hostCollege: string;
  hostAvatarColor: string;
  hostAvatarInitials: string;
  participantIds: string[];
  isDemo: boolean;
  status: 'active' | 'full' | 'completed' | 'cancelled';
  reported?: boolean;
  createdAt: string;
}

export interface ActivityParticipant {
  id: string;
  name: string;
  college: string;
  avatarColor: string;
  avatarInitials: string;
  isHost: boolean;
  joinedAt: string;
}

export interface ActivityMessage {
  id: string;
  activityId: string;
  senderId: string;
  senderName: string;
  senderAvatarColor: string;
  senderAvatarInitials: string;
  text: string;
  timestamp: string;
  isSystemNotification?: boolean;
}

export interface FreeNowStudent {
  id: string;
  name: string;
  college: string;
  avatarColor: string;
  avatarInitials: string;
  lookingFor: string;
  freeUntil: number; // epoch
  minutesRemaining: number;
  interests: ActivityCategory[];
  locationHint: string;
}

export interface MatchRecommendation {
  activity: Activity;
  score: number; // 0 - 100
  matchReasons: string[];
  isTopPick: boolean;
}

export type ActiveTab = 'discover' | 'free_now' | 'create' | 'my_activities' | 'profile';
