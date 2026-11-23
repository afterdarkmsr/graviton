/**
 * Feature flags for VibeMatch.
 *
 * Version 1 launches without Cloud Functions: peer feedback, star ratings,
 * reputation scores, automatic rating-based suspensions, and suspension appeals
 * are completely hidden by default (`false`). All backend Cloud Functions source,
 * Firestore security rules, and schemas remain preserved for a future version.
 *
 * To enable Cloud Functions-backed feedback and appeals in a future release,
 * deploy `functions/` and set `VITE_ENABLE_FEEDBACK_FUNCTIONS=true` at build time.
 */
export const FEATURES = {
  FEEDBACK_AND_APPEALS: import.meta.env.VITE_ENABLE_FEEDBACK_FUNCTIONS === 'true',
} as const;
