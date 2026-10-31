import {
  FreeNowStudent,
  UserProfile,
} from '../types';

const KEYS = {
  PROFILE: 'vibematch_profile_v1',
  FREE_NOW: 'vibematch_freenow_v1',
  REPORTS: 'vibematch_reports_v1',
  ONBOARDED: 'vibematch_onboarded_v1',
};

class StorageService {
  // --- Profile Methods (Client device caching for authenticated user) ---
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
      localStorage.removeItem(KEYS.FREE_NOW);
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

  // --- Free Now Availability Broadcasts ---
  public getFreeNowStudents(campus?: string): FreeNowStudent[] {
    try {
      const data = localStorage.getItem(KEYS.FREE_NOW);
      let list: FreeNowStudent[] = data ? JSON.parse(data) : [];

      const now = Date.now();
      list = list.filter((s) => s.freeUntil > now);

      list = list.map((s) => ({
        ...s,
        minutesRemaining: Math.max(1, Math.round((s.freeUntil - now) / 60000)),
      }));

      if (campus) {
        list = list.filter((s) => s.college && s.college.toLowerCase() === campus.toLowerCase());
      }

      return list;
    } catch (err) {
      console.error('Error reading free now students', err);
      return [];
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
      let list: FreeNowStudent[] = data ? JSON.parse(data) : [];
      list = list.filter((s) => s.id !== profile.id && s.freeUntil > now);

      if (freeUntil && durationMinutes) {
        list.unshift({
          id: profile.id,
          name: profile.name,
          college: profile.college || profile.campus || 'CGC',
          avatarColor: profile.avatarColor,
          avatarInitials: profile.avatarInitials,
          lookingFor: statusNote || 'Free on campus right now!',
          freeUntil,
          minutesRemaining: durationMinutes,
          interests: profile.interests,
          locationHint: locationHint || 'Campus Center',
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
    } catch (err) {
      console.error('Failed to save report', err);
    }
  }
}

export const storageService = new StorageService();
