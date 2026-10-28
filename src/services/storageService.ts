import {
  Activity,
  ActivityCategory,
  ActivityMessage,
  FreeNowStudent,
  SkillLevel,
  UserProfile,
} from '../types';
import {
  DEFAULT_DEMO_USER,
  INITIAL_FREE_NOW_STUDENTS,
  INITIAL_SEED_ACTIVITIES,
  INITIAL_SEED_MESSAGES,
} from '../data/seedData';

const KEYS = {
  PROFILE: 'vibematch_profile_v1',
  ACTIVITIES: 'vibematch_activities_v1',
  MESSAGES: 'vibematch_messages_v1',
  FREE_NOW: 'vibematch_freenow_v1',
  REPORTS: 'vibematch_reports_v1',
  ONBOARDED: 'vibematch_onboarded_v1',
};

class StorageService {
  // --- Profile Methods ---
  public getProfile(): UserProfile | null {
    try {
      const data = localStorage.getItem(KEYS.PROFILE);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // fallback
    }
    return null;
  }

  public saveProfile(profile: UserProfile): void {
    try {
      localStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
    } catch (err) {
      console.error('Failed to save profile to localStorage', err);
    }
  }

  public clearAuthProfile(): void {
    try {
      localStorage.removeItem(KEYS.PROFILE);
      localStorage.removeItem(KEYS.ONBOARDED);
    } catch (err) {
      console.error('Failed to clear auth profile', err);
    }
  }

  public isOnboarded(): boolean {
    try {
      const onboarded = localStorage.getItem(KEYS.ONBOARDED);
      return onboarded === 'true';
    } catch {
      return false;
    }
  }

  public setOnboarded(val: boolean): void {
    try {
      localStorage.setItem(KEYS.ONBOARDED, val ? 'true' : 'false');
    } catch (err) {
      console.error('Failed to set onboarded status', err);
    }
  }

  // --- Activities Methods ---
  public getActivities(): Activity[] {
    try {
      const data = localStorage.getItem(KEYS.ACTIVITIES);
      if (data) {
        const activities: Activity[] = JSON.parse(data);
        // Automatically mark activities as full or expired dynamically
        return activities.map((act) => {
          const isFull = act.participantIds.length >= act.maxParticipants;
          const isPast = new Date(act.dateTime).getTime() + act.durationMinutes * 60000 < Date.now();
          if (isPast && act.status !== 'completed' && act.status !== 'cancelled') {
            return { ...act, status: 'completed' };
          }
          if (isFull && act.status === 'active') {
            return { ...act, status: 'full' };
          }
          if (!isFull && act.status === 'full') {
            return { ...act, status: 'active' };
          }
          return act;
        });
      }
    } catch (err) {
      console.error('Error reading activities from storage', err);
    }

    // Seed if empty
    this.saveActivities(INITIAL_SEED_ACTIVITIES);
    return INITIAL_SEED_ACTIVITIES;
  }

  public saveActivities(activities: Activity[]): void {
    try {
      localStorage.setItem(KEYS.ACTIVITIES, JSON.stringify(activities));
    } catch (err) {
      console.error('Failed to save activities to localStorage', err);
    }
  }

  public getActivityById(id: string): Activity | undefined {
    const list = this.getActivities();
    return list.find((a) => a.id === id);
  }

  public createActivity(
    params: {
      title: string;
      category: ActivityCategory;
      categoryGroup: 'sports' | 'social' | 'study';
      description: string;
      campus: string;
      venue: string;
      dateTime: string;
      durationMinutes: number;
      maxParticipants: number;
      skillLevel: SkillLevel;
    },
    host: UserProfile
  ): Activity {
    const activities = this.getActivities();

    const newActivity: Activity = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: params.title.trim(),
      category: params.category,
      categoryGroup: params.categoryGroup,
      description: params.description.trim(),
      campus: params.campus || host.college,
      venue: params.venue.trim(),
      dateTime: params.dateTime,
      durationMinutes: params.durationMinutes,
      maxParticipants: params.maxParticipants,
      skillLevel: params.skillLevel,
      hostId: host.id,
      hostName: host.name,
      hostCollege: host.college,
      hostAvatarColor: host.avatarColor,
      hostAvatarInitials: host.avatarInitials,
      participantIds: [host.id], // Host is automatically the first participant!
      isDemo: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const updated = [newActivity, ...activities];
    this.saveActivities(updated);

    // Add initial system message in chat
    this.sendActivityMessage(
      newActivity.id,
      host,
      `Created "${newActivity.title}" at ${newActivity.venue}. Welcome fellow campus members!`,
      true
    );

    return newActivity;
  }

  public joinActivity(
    activityId: string,
    user: UserProfile
  ): { success: boolean; error?: string; activity?: Activity } {
    const activities = this.getActivities();
    const index = activities.findIndex((a) => a.id === activityId);

    if (index === -1) {
      return { success: false, error: 'Activity not found.' };
    }

    const target = activities[index];

    // Check if expired
    const isPast = new Date(target.dateTime).getTime() + target.durationMinutes * 60000 < Date.now();
    if (isPast || target.status === 'completed' || target.status === 'cancelled') {
      return { success: false, error: 'This activity has already ended or was cancelled.' };
    }

    // Check if user already joined or is host
    if (target.participantIds.includes(user.id)) {
      return { success: false, error: 'You are already a participant in this activity.' };
    }

    // Check if full
    if (target.participantIds.length >= target.maxParticipants) {
      return { success: false, error: 'This activity is currently full (all spots taken).' };
    }

    const updatedParticipantIds = [...target.participantIds, user.id];
    const isNowFull = updatedParticipantIds.length >= target.maxParticipants;

    const updatedActivity: Activity = {
      ...target,
      participantIds: updatedParticipantIds,
      status: isNowFull ? 'full' : 'active',
    };

    activities[index] = updatedActivity;
    this.saveActivities(activities);

    // Post joined notification into activity chat
    this.sendActivityMessage(
      activityId,
      user,
      `${user.name} joined the squad! Spots remaining: ${target.maxParticipants - updatedParticipantIds.length}`,
      true
    );

    return { success: true, activity: updatedActivity };
  }

  public leaveActivity(
    activityId: string,
    userId: string,
    userName?: string
  ): { success: boolean; error?: string; activity?: Activity } {
    const activities = this.getActivities();
    const index = activities.findIndex((a) => a.id === activityId);

    if (index === -1) {
      return { success: false, error: 'Activity not found.' };
    }

    const target = activities[index];

    // If host leaves their own activity, cancel it or disallow
    if (target.hostId === userId) {
      return {
        success: false,
        error: 'As host, you cannot leave your own activity. You can cancel it instead.',
      };
    }

    if (!target.participantIds.includes(userId)) {
      return { success: false, error: 'You are not a participant in this activity.' };
    }

    const updatedParticipantIds = target.participantIds.filter((id) => id !== userId);
    const updatedActivity: Activity = {
      ...target,
      participantIds: updatedParticipantIds,
      status: target.status === 'full' ? 'active' : target.status,
    };

    activities[index] = updatedActivity;
    this.saveActivities(activities);

    // Post system message
    const profile = this.getProfile() || DEFAULT_DEMO_USER;
    this.sendActivityMessage(
      activityId,
      profile,
      `${userName || 'A student'} left the activity. A spot is now open!`,
      true
    );

    return { success: true, activity: updatedActivity };
  }

  public cancelActivity(
    activityId: string,
    hostId: string
  ): { success: boolean; error?: string } {
    const activities = this.getActivities();
    const index = activities.findIndex((a) => a.id === activityId);

    if (index === -1) {
      return { success: false, error: 'Activity not found.' };
    }

    if (activities[index].hostId !== hostId) {
      return { success: false, error: 'Only the activity host can cancel this event.' };
    }

    activities[index] = {
      ...activities[index],
      status: 'cancelled',
    };

    this.saveActivities(activities);
    return { success: true };
  }

  // --- Chat Messages Methods ---
  public getMessages(): Record<string, ActivityMessage[]> {
    try {
      const data = localStorage.getItem(KEYS.MESSAGES);
      if (data) {
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Error reading messages', err);
    }
    this.saveMessages(INITIAL_SEED_MESSAGES);
    return INITIAL_SEED_MESSAGES;
  }

  public saveMessages(messages: Record<string, ActivityMessage[]>): void {
    try {
      localStorage.setItem(KEYS.MESSAGES, JSON.stringify(messages));
    } catch (err) {
      console.error('Failed to save messages to localStorage', err);
    }
  }

  public getActivityMessages(activityId: string): ActivityMessage[] {
    const all = this.getMessages();
    return all[activityId] || [];
  }

  public sendActivityMessage(
    activityId: string,
    sender: UserProfile,
    text: string,
    isSystem = false
  ): ActivityMessage {
    const all = this.getMessages();
    const currentList = all[activityId] || [];

    const newMsg: ActivityMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      activityId,
      senderId: isSystem ? 'system' : sender.id,
      senderName: isSystem ? 'VibeMatch Bot' : sender.name,
      senderAvatarColor: isSystem ? '#3A0F34' : sender.avatarColor,
      senderAvatarInitials: isSystem ? 'VM' : sender.avatarInitials,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      isSystemNotification: isSystem,
    };

    all[activityId] = [...currentList, newMsg];
    this.saveMessages(all);
    return newMsg;
  }

  // --- Free Now Spontaneous Broadcast Methods ---
  public getFreeNowStudents(campus?: string): FreeNowStudent[] {
    try {
      const data = localStorage.getItem(KEYS.FREE_NOW);
      let list: FreeNowStudent[] = data ? JSON.parse(data) : INITIAL_FREE_NOW_STUDENTS;

      // Filter out students whose time has expired
      const now = Date.now();
      list = list.filter((s) => s.freeUntil > now);

      // Recompute minutes remaining
      list = list.map((s) => ({
        ...s,
        minutesRemaining: Math.max(1, Math.round((s.freeUntil - now) / 60000)),
      }));

      // Filter by campus if specified
      if (campus) {
        list = list.filter((s) => s.college.toLowerCase() === campus.toLowerCase());
      }

      return list;
    } catch (err) {
      console.error('Error reading free now students', err);
      return INITIAL_FREE_NOW_STUDENTS;
    }
  }

  public setFreeNowStatus(
    profile: UserProfile,
    durationMinutes: number | null,
    statusNote?: string,
    locationHint?: string
  ): void {
    try {
      const now = Date.now();
      const freeUntil = durationMinutes ? now + durationMinutes * 60 * 1000 : null;

      // Update profile
      const updatedProfile: UserProfile = {
        ...profile,
        freeUntil,
        freeStatusNote: statusNote || null,
      };
      this.saveProfile(updatedProfile);

      // Update free now list
      const data = localStorage.getItem(KEYS.FREE_NOW);
      let list: FreeNowStudent[] = data ? JSON.parse(data) : INITIAL_FREE_NOW_STUDENTS;
      list = list.filter((s) => s.id !== profile.id && s.freeUntil > now);

      if (freeUntil && durationMinutes) {
        list.unshift({
          id: profile.id,
          name: profile.name,
          college: profile.college,
          avatarColor: profile.avatarColor,
          avatarInitials: profile.avatarInitials,
          lookingFor: statusNote || 'Free for sports, coffee, or a walk right now!',
          freeUntil,
          minutesRemaining: durationMinutes,
          interests: profile.interests,
          locationHint: locationHint || 'Campus Central',
        });
      }

      localStorage.setItem(KEYS.FREE_NOW, JSON.stringify(list));
    } catch (err) {
      console.error('Failed to set Free Now status', err);
    }
  }

  // --- Moderation / Report Methods ---
  public reportActivity(activityId: string, reason: string): void {
    try {
      const existing = localStorage.getItem(KEYS.REPORTS);
      const reports = existing ? JSON.parse(existing) : [];
      reports.push({
        activityId,
        reason,
        reportedAt: new Date().toISOString(),
      });
      localStorage.setItem(KEYS.REPORTS, JSON.stringify(reports));

      // Mark activity locally
      const activities = this.getActivities();
      const updated = activities.map((a) =>
        a.id === activityId ? { ...a, reported: true } : a
      );
      this.saveActivities(updated);
    } catch (err) {
      console.error('Failed to save report', err);
    }
  }

  // --- Reset to Fresh Seed State ---
  public resetToSeedData(): void {
    localStorage.removeItem(KEYS.ACTIVITIES);
    localStorage.removeItem(KEYS.MESSAGES);
    localStorage.removeItem(KEYS.FREE_NOW);
    localStorage.removeItem(KEYS.REPORTS);
    localStorage.removeItem(KEYS.PROFILE);
    localStorage.removeItem(KEYS.ONBOARDED);
    this.saveProfile(DEFAULT_DEMO_USER);
    this.saveActivities(INITIAL_SEED_ACTIVITIES);
    this.saveMessages(INITIAL_SEED_MESSAGES);
    localStorage.setItem(KEYS.FREE_NOW, JSON.stringify(INITIAL_FREE_NOW_STUDENTS));
    this.setOnboarded(true);
  }
}

export const storageService = new StorageService();
