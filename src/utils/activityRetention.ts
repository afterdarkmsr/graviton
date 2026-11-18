import { Activity } from '../types';

/**
 * 7 days retention window in milliseconds: 7 * 24 * 60 * 60 * 1000 = 604,800,000 ms.
 */
export const PAST_ACTIVITIES_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Safely parses an unknown date/timestamp representation into epoch milliseconds.
 * Returns null if the value is missing, invalid, NaN, or non-positive.
 */
export function parseDateToEpochMs(val: unknown): number | null {
  if (!val) return null;

  if (typeof val === 'number') {
    return !isNaN(val) && isFinite(val) && val > 0 ? val : null;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const ms = new Date(trimmed).getTime();
    return !isNaN(ms) && isFinite(ms) && ms > 0 ? ms : null;
  }

  // Firestore Timestamp duck typing
  if (typeof (val as { toMillis?: () => number }).toMillis === 'function') {
    try {
      const ms = (val as { toMillis: () => number }).toMillis();
      return !isNaN(ms) && isFinite(ms) && ms > 0 ? ms : null;
    } catch {
      return null;
    }
  }

  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    try {
      const ms = (val as { toDate: () => Date }).toDate().getTime();
      return !isNaN(ms) && isFinite(ms) && ms > 0 ? ms : null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Resolves the actual completion or ending timestamp in milliseconds for an activity.
 * Inspects lifecycle timestamps in strict priority order:
 * 1. endedAt (e.g., 1-to-1 match end timestamp)
 * 2. completedAt (explicit squad completion timestamp)
 * 3. cancelledAt (explicit cancellation timestamp)
 * 4. updatedAt (when activity status is 'cancelled' or 'completed')
 * 5. Scheduled completion: dateTime + durationMinutes (when activity ends by schedule)
 *
 * Returns null if no valid, positive timestamp exists.
 * Missing or corrupted timestamps will safely return null.
 */
export function getActivityEndTimestampMs(act: Activity): number | null {
  if (!act) return null;

  // 1. Explicit endedAt (e.g. 1-to-1 Who's Free match end)
  const endedAtMs = parseDateToEpochMs(act.endedAt);
  if (endedAtMs !== null) return endedAtMs;

  // 2. Explicit completedAt
  const completedAtMs = parseDateToEpochMs(act.completedAt);
  if (completedAtMs !== null) return completedAtMs;

  // 3. Explicit cancelledAt
  const cancelledAtMs = parseDateToEpochMs(act.cancelledAt);
  if (cancelledAtMs !== null) return cancelledAtMs;

  // 4. Cancelled or completed activity with updatedAt
  if (act.status === 'cancelled' || act.status === 'completed') {
    const updatedAtMs = parseDateToEpochMs(act.updatedAt);
    if (updatedAtMs !== null) return updatedAtMs;
  }

  // 5. Scheduled completion: dateTime + durationMinutes
  if (act.dateTime) {
    const startMs = parseDateToEpochMs(act.dateTime);
    if (startMs !== null) {
      const durationMinutes =
        typeof act.durationMinutes === 'number' && !isNaN(act.durationMinutes) && act.durationMinutes > 0
          ? act.durationMinutes
          : 60;
      return startMs + durationMinutes * 60000;
    }
  }

  // Missing or invalid timestamps return null safely
  return null;
}

/**
 * Determines whether an activity is considered past / ended.
 * An activity is past if:
 * - Its status is 'completed'
 * - Its status is 'cancelled'
 * - It has an explicit endedAt
 * - Its scheduled end time has passed (endTimestamp <= nowMs)
 */
export function isActivityPast(act: Activity, nowMs: number = Date.now()): boolean {
  if (!act) return false;

  if (act.status === 'completed' || act.status === 'cancelled') {
    return true;
  }

  if (act.endedAt) {
    const endedAtMs = parseDateToEpochMs(act.endedAt);
    if (endedAtMs !== null) return true;
  }

  // Active 1-to-1 matches remain live until explicitly ended by host or peer
  if (act.isOneToOne && act.status === 'active') {
    return false;
  }

  // Scheduled end check
  if (act.dateTime) {
    const startMs = parseDateToEpochMs(act.dateTime);
    if (startMs !== null) {
      const durationMinutes =
        typeof act.durationMinutes === 'number' && !isNaN(act.durationMinutes) && act.durationMinutes > 0
          ? act.durationMinutes
          : 60;
      const scheduledEndMs = startMs + durationMinutes * 60000;
      if (scheduledEndMs <= nowMs) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Evaluates if an activity ended within the most recent 7 days.
 *
 * Requirements:
 * 1. Must be a past activity (completed, cancelled, or ended).
 * 2. Ending timestamp must be resolvable (missing timestamps safely return false).
 * 3. Ending timestamp must be within [nowMs - 7 days, nowMs + clockSkewBuffer].
 * 4. Activities older than 7 days return false.
 */
export function isWithinPast7Days(
  act: Activity,
  nowMs: number = Date.now(),
  retentionWindowMs: number = PAST_ACTIVITIES_RETENTION_MS
): boolean {
  if (!act) return false;

  // Must be a past/ended activity
  if (!isActivityPast(act, nowMs)) {
    return false;
  }

  // Resolve authoritative ending timestamp
  const endMs = getActivityEndTimestampMs(act);

  // Requirement 4: Handle missing timestamps safely. Do not classify missing as recent.
  if (endMs === null) {
    return false;
  }

  const cutoffMs = nowMs - retentionWindowMs;

  // Clock skew allowance of up to 5 minutes for activities ending right now
  const futureAllowanceMs = nowMs + 5 * 60 * 1000;

  // Must be at or after cutoff, and not far in the future
  return endMs >= cutoffMs && endMs <= futureAllowanceMs;
}

/**
 * Filters and sorts past activities for a student:
 * - Filters for activities where user is participant, host, or creator.
 * - Only includes activities that are past AND ended within the last 7 days.
 * - Preserves sorting: newest activities first (descending by actual end timestamp).
 */
export function getPastActivitiesForUser(
  activities: Activity[],
  userId: string,
  nowMs: number = Date.now()
): Activity[] {
  if (!Array.isArray(activities) || !userId) return [];

  const filtered = activities.filter((act) => {
    const isParticipant =
      Array.isArray(act.participantIds) && act.participantIds.includes(userId);
    const isHost = act.hostId === userId || act.createdBy === userId;

    if (!isParticipant && !isHost) return false;

    return isWithinPast7Days(act, nowMs);
  });

  // Sort: Newest ended first
  filtered.sort((a, b) => {
    const endA = getActivityEndTimestampMs(a) ?? 0;
    const endB = getActivityEndTimestampMs(b) ?? 0;
    return endB - endA;
  });

  return filtered;
}
