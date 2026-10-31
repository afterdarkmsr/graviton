import { Activity, MatchRecommendation, UserProfile } from '../types';

export class MatchService {
  /**
   * Deterministically scores and ranks activities for a user profile
   */
  public getRecommendations(
    profile: UserProfile,
    activities: Activity[],
    options: {
      strictCampus?: boolean;
      onlyImmediate?: boolean; // For "Rescue Me From Boredom"
    } = {}
  ): MatchRecommendation[] {
    const now = Date.now();

    const candidates = activities.filter((act) => {
      // Must not be cancelled
      if (act.status === 'cancelled' || act.reported) return false;

      // Must not be full
      if (act.participantIds.length >= act.maxParticipants || act.status === 'full') {
        return false;
      }

      // Must not be already joined by this user
      if (act.participantIds.includes(profile.id)) {
        return false;
      }

      // Must be upcoming (not in the past)
      const actTime = new Date(act.dateTime).getTime();
      if (actTime + act.durationMinutes * 60000 < now) {
        return false;
      }

      // If onlyImmediate (e.g. for "Rescue Me From Boredom"), within next 12 hours
      if (options.onlyImmediate) {
        const hoursAhead = (actTime - now) / (1000 * 60 * 60);
        if (hoursAhead > 12) {
          return false;
        }
      }

      return true;
    });

    const recommendations: MatchRecommendation[] = candidates.map((act) => {
      let score = 0;
      const matchReasons: string[] = [];

      const actTime = new Date(act.dateTime).getTime();
      const hoursUntil = (actTime - now) / (1000 * 60 * 60);

      // 1. Community Activity (+30 pts)
      score += 30;
      matchReasons.push('CGC student community activity');

      // 2. Interest Match (+25 pts)
      const userInterests = profile.interests || [];
      if (userInterests.includes(act.category)) {
        score += 25;
        matchReasons.push(`You both love ${act.category}`);
      } else {
        // Partial group match (e.g. sports)
        const hasSameGroupInterest = userInterests.some((int) => {
          if (act.categoryGroup === 'sports') {
            return ['Badminton', 'Cricket', 'Basketball', 'Football', 'Running', 'Gym'].includes(int);
          }
          if (act.categoryGroup === 'social') {
            return ['Coffee', 'Lunch', 'Walking', 'Campus Hangout', 'Board Games'].includes(int);
          }
          if (act.categoryGroup === 'study') {
            return ['Study Group'].includes(int);
          }
          return false;
        });

        if (hasSameGroupInterest) {
          score += 12;
          matchReasons.push(`Matches your active ${act.categoryGroup} lifestyle`);
        }
      }

      // 3. Skill Compatibility (+20 pts)
      const userSkill = profile.skillLevels?.[act.category];
      if (act.skillLevel === 'All Levels') {
        score += 20;
        matchReasons.push('Open to all skill levels');
      } else if (userSkill && userSkill === act.skillLevel) {
        score += 20;
        matchReasons.push(`Exact skill level match (${userSkill})`);
      } else if (userSkill) {
        score += 12;
        matchReasons.push(`Compatible skill tier (${act.skillLevel})`);
      } else {
        score += 10;
        matchReasons.push(`Skill: ${act.skillLevel}`);
      }

      // 4. Timing & Urgency (+15 pts)
      if (hoursUntil <= 2.5) {
        score += 15;
        matchReasons.push(`Starts soon (in ${Math.max(15, Math.round(hoursUntil * 60))} mins)`);
      } else if (hoursUntil <= 6) {
        score += 12;
        matchReasons.push('Happening later today');
      } else if (hoursUntil <= 24) {
        score += 8;
        matchReasons.push('Coming up tomorrow');
      } else {
        score += 4;
        matchReasons.push('Upcoming schedule');
      }

      // 5. Spots Available (+5 pts)
      const spotsLeft = act.maxParticipants - act.participantIds.length;
      if (spotsLeft <= 2) {
        score += 5;
        matchReasons.push(`High demand: only ${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left`);
      } else {
        score += 3;
        matchReasons.push(`${spotsLeft} spots open`);
      }

      // Free Now bonus if user currently marked free
      if (profile.freeUntil && profile.freeUntil > now && hoursUntil <= 3) {
        score = Math.min(100, score + 5);
        matchReasons.unshift('Fits your active "Free Right Now" window!');
      }

      const finalScore = Math.min(100, Math.max(10, score));

      return {
        activity: act,
        score: finalScore,
        matchReasons: matchReasons.slice(0, 3), // Top 3 reasons
        isTopPick: false,
      };
    });

    // Sort descending by score, then by upcoming time
    recommendations.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return new Date(a.activity.dateTime).getTime() - new Date(b.activity.dateTime).getTime();
    });

    if (recommendations.length > 0 && recommendations[0].score >= 70) {
      recommendations[0].isTopPick = true;
    }

    return recommendations;
  }
}

export const matchService = new MatchService();
