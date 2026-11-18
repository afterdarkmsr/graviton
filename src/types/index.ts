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

export type SkillLevel = 'All Levels' | 'Beginner' | 'Intermediate' | 'Advanced' | 'Casual';

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
  campus?: string;
  college?: string;
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
  campus?: string;
  venue: string; // Named public campus venue
  dateTime: string; // ISO string
  durationMinutes: number;
  maxParticipants: number;
  skillLevel: SkillLevel;
  hostId: string;
  createdBy: string;
  hostName: string;
  hostCollege?: string;
  hostAvatarColor: string;
  hostAvatarInitials: string;
  participantIds: string[];
  isDemo: boolean;
  status: 'active' | 'full' | 'completed' | 'cancelled';
  reported?: boolean;
  createdAt: string;
  isOneToOne?: boolean;
  matchRequestId?: string;
  requesterUid?: string;
  requesterName?: string;
  endedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  updatedAt?: string;
  endedByUid?: string;
  originalBroadcastExpiresAt?: number;
}

export interface ActivityParticipant {
  id: string;
  name: string;
  college?: string;
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
  college?: string;
  avatarColor: string;
  avatarInitials: string;
  lookingFor: string;
  freeUntil: number; // epoch
  minutesRemaining: number;
  interests: ActivityCategory[];
  locationHint: string;
}

export interface AvailabilityBroadcast {
  id: string; // Document ID = ownerUid
  ownerUid: string;
  displayName: string;
  photoURL?: string | null;
  avatarColor?: string;
  avatarInitials?: string;
  college?: string;
  campus?: string;
  year?: string;
  activityInterest: string;
  statusNote: string;
  locationHint: string;
  durationMinutes: number; // Duration in minutes (15 to 240)
  createdAt: any; // Firestore Timestamp
  expiresAt: any; // Firestore Timestamp
  isActive: boolean;
  updatedAt?: any;
}

export interface MatchRecommendation {
  activity: Activity;
  score: number; // 0 - 100
  matchReasons: string[];
  isTopPick: boolean;
}

export type ActiveTab = 'discover' | 'free_now' | 'create' | 'my_activities' | 'profile' | 'admin_appeals';

export type MatchRequestStatus = 'pending' | 'declined' | 'cancelled' | 'accepted' | 'ended';

export interface MatchRequest {
  id: string;
  hostUid: string;
  requesterUid: string;
  status: MatchRequestStatus;
  activityInterest: string;
  requesterName: string;
  requesterYear?: string;
  activityId?: string;
  createdAt: any;
  updatedAt: any;
}

export type WaveStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface WaveRequest {
  id: string; // 'wave_${senderUid}_${recipientUid}'
  senderUid: string;
  senderName: string;
  senderAvatarColor?: string;
  senderAvatarInitials?: string;
  recipientUid: string;
  recipientName: string;
  broadcastOwnerUid: string;
  activityInterest: string;
  status: WaveStatus;
  chatId?: string | null;
  createdAt: any;
  updatedAt: any;
}

export interface PrivateChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatarColor?: string;
  senderAvatarInitials?: string;
  text: string;
  isSystemNotification?: boolean;
  createdAt: any;
}

export interface PrivateChat {
  id: string;
  participantUids: string[];
  participants: Record<
    string,
    {
      name: string;
      avatarColor?: string;
      avatarInitials?: string;
    }
  >;
  activityInterest?: string;
  waveId?: string;
  lastMessageText?: string;
  lastMessageAt?: any;
  createdAt: any;
  updatedAt: any;
}

// -------------------------------------------------------------
// PHASE 4: 5-STAR REPUTATION & FEEDBACK SYSTEM
// -------------------------------------------------------------

export type RatingStarValue = 1 | 2 | 3 | 4 | 5;

export type FeedbackTag =
  | 'Friendly'
  | 'Punctual'
  | 'Cooperative'
  | 'Good Communicator'
  | 'Unfriendly'
  | 'Not Cooperative';

export const FEEDBACK_TAGS: FeedbackTag[] = [
  'Friendly',
  'Punctual',
  'Cooperative',
  'Good Communicator',
  'Unfriendly',
  'Not Cooperative',
];

export interface ActivityFeedback {
  id: string; // `${activityId}_${raterId}_${targetUserId}`
  activityId: string;
  activityTitle: string;
  isOneToOne: boolean;
  raterId: string;
  raterName: string;
  targetUserId: string;
  targetUserName: string;
  rating: RatingStarValue;
  tags: FeedbackTag[];
  comment?: string;
  createdAt: any;
}

// Backward compatibility alias
export type ActivityRating = ActivityFeedback;

export type ReviewStatus = 'normal' | 'flagged' | 'under_review' | 'cleared' | 'suspended';

export interface SuspensionDetails {
  suspendedAt: string;
  expiresAt: string;
  reason: string;
  distinctOneStarCount: number;
  appealStatus?: 'none' | 'submitted' | 'under_review' | 'rejected' | 'accepted';
  appealText?: string;
  reviewedByAdmin?: string;
}

export interface UserReputation {
  userId: string;
  userName: string;
  averageRating: number; // e.g. 4.8
  totalRatings: number;
  ratingSum: number;
  starDistribution: Record<RatingStarValue, number>;
  tagCounts: Record<FeedbackTag, number>;
  updatedAt: any;
  // Backward compatibility fields (optional)
  isSuspended?: boolean;
  appealStatus?: 'none' | 'submitted' | 'rejected' | 'accepted';
}

export interface UserModeration {
  userId: string;
  userName?: string;
  distinctOneStarRaters?: string[];
  distinctOneStarCount?: number;
  isSuspended: boolean;
  suspensionStartedAt?: any;
  suspensionExpiresAt?: any;
  suspensionReason?: string | null;
  appealStatus?: 'none' | 'submitted' | 'rejected' | 'accepted';
  appealReason?: string | null;
  appealedAt?: any;
  reviewedByAdmin?: string | null;
  reviewedAt?: any;
  reviewNote?: string | null;
  suspensionLiftedAt?: any;
  updatedAt?: any;
}

export interface SuspensionRecord {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  startedAt: any;
  expiresAt: any;
  triggeringRatingRefs: string[];
  status: 'active' | 'appealed' | 'expired' | 'resolved';
  appealReason?: string;
  appealedAt?: any;
  reviewedAt?: any;
  reviewerUid?: string;
  reviewNote?: string;
  createdAt: any;
}

export interface PendingSuspensionAppeal {
  userId: string;
  userName: string;
  userEmail?: string;
  isSuspended: boolean;
  suspensionReason: string;
  suspensionExpiresAt?: string | null;
  appealStatus: 'submitted' | 'accepted' | 'rejected' | 'none';
  appealReason: string;
  appealedAt?: string | null;
  distinctOneStarCount?: number;
}

export type ReportReason =
  | 'Inappropriate content'
  | 'Spam or commercial'
  | 'Non-public or private venue'
  | 'Harassment'
  | 'Other';

export type ReportStatus = 'open' | 'reviewed' | 'dismissed';

export interface ActivityReport {
  id: string;
  activityId: string;
  activityTitle: string;
  reporterUid: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  reviewedByAdmin?: string;
  reviewedAt?: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SuspensionStatusInfo {
  isSuspended: boolean;
  expiresAt?: string | null;
  reason?: string | null;
  remainingDays?: number;
  appealStatus?: 'none' | 'submitted' | 'rejected' | 'accepted';
}
