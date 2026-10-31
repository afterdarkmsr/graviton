import { ActivityCategory } from '../types';

export const STUDY_YEAR_OPTIONS = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
  '5th Year',
  'Postgraduate',
] as const;

export const CGC_CAMPUSES = [
  'CGC Jhanjeri',
  'CGC Mohali',
] as const;

export type CGCCampus = (typeof CGC_CAMPUSES)[number];

export const COLLEGES = CGC_CAMPUSES;

export const CATEGORIES_CONFIG: {
  category: import('../types').ActivityCategory;
  group: 'sports' | 'social' | 'study';
  icon: string;
  color: string;
}[] = [
  { category: 'Badminton', group: 'sports', icon: '🏸', color: '#3A0F34' },
  { category: 'Cricket', group: 'sports', icon: '🏏', color: '#3A0F34' },
  { category: 'Basketball', group: 'sports', icon: '🏀', color: '#3A0F34' },
  { category: 'Football', group: 'sports', icon: '⚽', color: '#3A0F34' },
  { category: 'Running', group: 'sports', icon: '🏃', color: '#3A0F34' },
  { category: 'Gym', group: 'sports', icon: '💪', color: '#3A0F34' },
  { category: 'Coffee', group: 'social', icon: '☕', color: '#EAAA00' },
  { category: 'Lunch', group: 'social', icon: '🍱', color: '#EAAA00' },
  { category: 'Walking', group: 'social', icon: '👟', color: '#EAAA00' },
  { category: 'Campus Hangout', group: 'social', icon: '☀️', color: '#EAAA00' },
  { category: 'Study Group', group: 'study', icon: '📚', color: '#52184A' },
  { category: 'Board Games', group: 'social', icon: '🎲', color: '#EAAA00' },
];

export const VENUE_SUGGESTIONS: Record<string, string[]> = {
  'CGC Jhanjeri': [
    'Block 1 Academic Lawn',
    'Sports Complex (Badminton & Table Tennis)',
    'Central Food Court & Nescafe Corner',
    'Block 3 Central Library Reading Hall',
    'Cricket Ground & Athletic Turf',
    'Open Air Amphitheatre',
  ],
  'CGC Mohali': [
    'Main Campus Sports Arena',
    'Student Activity Center',
    'Central Canteen Open Patio',
    'Central Library Study Commons',
    'Badminton & Volleyball Courts',
    'Green Lawn near Admin Block',
  ],
  'General': [
    'Campus Sports Arena',
    'Student Center Food Court',
    'Central Library Study Hall',
    'Campus Lawn & Courtyard',
  ],
};

