/**
 * VibeCalculator - Shared vibe/personality calculation logic for MCP and UI
 * Determines if user is more cat or dog person based on quiz answers
 */

// Types
export type VibeAnswer = 'A' | 'B' | null;
export type VibeType = 'cat' | 'dog';

export interface VibeQuestion {
  id: number;
  question: string;
  optionA: { text: string; emoji: string }; // Cat-leaning
  optionB: { text: string; emoji: string }; // Dog-leaning
}

export interface VibeResult {
  type: VibeType;
  percentage: number;
  catScore: number;
  dogScore: number;
  title: string;
  description: string;
  emoji: string;
  color: string;
}

// Quiz questions - Option A = Cat-leaning, Option B = Dog-leaning
export const VIBE_QUESTIONS: VibeQuestion[] = [
  { id: 1, question: 'How do you prefer to spend a Saturday?', optionA: { text: 'Cozy at home with a book or movie', emoji: '📚' }, optionB: { text: 'Out and about, exploring or socializing', emoji: '🎉' } },
  { id: 2, question: 'When meeting new people, you are:', optionA: { text: 'Reserved at first, warm up slowly', emoji: '🤔' }, optionB: { text: 'Friendly and open right away', emoji: '😄' } },
  { id: 3, question: 'Your ideal living space is:', optionA: { text: 'Clean, organized, minimal', emoji: '✨' }, optionB: { text: 'Lived-in, cozy, a bit messy is fine', emoji: '🏠' } },
  { id: 4, question: 'How do you handle stress?', optionA: { text: 'Need alone time to recharge', emoji: '🧘' }, optionB: { text: 'Talk it out with friends/family', emoji: '💬' } },
  { id: 5, question: 'Your approach to exercise:', optionA: { text: 'Solo activities (yoga, gym, walks)', emoji: '🚶' }, optionB: { text: 'Team sports or group activities', emoji: '⚽' } },
  { id: 6, question: 'When it comes to routines:', optionA: { text: 'I like flexibility and doing things my way', emoji: '🎨' }, optionB: { text: 'I thrive on consistent schedules', emoji: '📅' } },
  { id: 7, question: 'Your communication style:', optionA: { text: 'Subtle hints and body language', emoji: '👀' }, optionB: { text: 'Direct and expressive', emoji: '🗣️' } },
  { id: 8, question: 'How do you show affection?', optionA: { text: 'Quality time, being present', emoji: '💝' }, optionB: { text: 'Physical touch, hugs, enthusiasm', emoji: '🤗' } },
  { id: 9, question: 'Your sleep preference:', optionA: { text: 'Night owl, love late nights', emoji: '🌙' }, optionB: { text: 'Early bird, up with the sun', emoji: '🌅' } },
  { id: 10, question: 'When someone annoys you:', optionA: { text: 'Give them the cold shoulder', emoji: '❄️' }, optionB: { text: 'Confront them directly', emoji: '🔥' } },
];

/**
 * Calculate vibe result from answers
 */
export function calculateVibe(answers: VibeAnswer[]): VibeResult {
  const catScore = answers.filter(a => a === 'A').length;
  const dogScore = answers.filter(a => a === 'B').length;
  const total = catScore + dogScore;
  
  if (total === 0) {
    return {
      type: 'cat',
      percentage: 50,
      catScore: 0,
      dogScore: 0,
      title: 'Undetermined',
      description: 'Answer some questions to find out your vibe!',
      emoji: '🤷',
      color: '#6b7280',
    };
  }

  const catPercentage = Math.round((catScore / total) * 100);
  const type: VibeType = catScore >= dogScore ? 'cat' : 'dog';
  const percentage = type === 'cat' ? catPercentage : 100 - catPercentage;

  const details = getVibeDetails(type, percentage);
  
  return {
    type,
    percentage,
    catScore,
    dogScore,
    ...details,
  };
}

/**
 * Get detailed result info based on type and percentage
 */
function getVibeDetails(type: VibeType, percentage: number): { title: string; description: string; emoji: string; color: string } {
  if (type === 'cat') {
    if (percentage >= 80) return { 
      title: 'Total Cat Person!', 
      description: "You're independent, mysterious, and value your personal space. You appreciate the finer things in life and don't need constant validation.",
      emoji: '🐱',
      color: '#a78bfa'
    };
    if (percentage >= 60) return { 
      title: 'Mostly Cat Person', 
      description: "You lean towards independence but can be social when you want. You're selective about your inner circle.",
      emoji: '😺',
      color: '#8b5cf6'
    };
    return { 
      title: 'Cat-Leaning', 
      description: 'You have a nice balance but slightly prefer the cat lifestyle - independent yet affectionate on your terms.',
      emoji: '🐈',
      color: '#7c3aed'
    };
  } else {
    if (percentage >= 80) return { 
      title: 'Total Dog Person!', 
      description: "You're loyal, enthusiastic, and love being around people. Your energy is contagious and you wear your heart on your sleeve!",
      emoji: '🐕',
      color: '#f59e0b'
    };
    if (percentage >= 60) return { 
      title: 'Mostly Dog Person', 
      description: "You're social and friendly but also appreciate some downtime. You're the life of the party when you want to be!",
      emoji: '🐶',
      color: '#d97706'
    };
    return { 
      title: 'Dog-Leaning', 
      description: 'You have a nice balance but slightly prefer the dog lifestyle - social, active, and always ready for adventure.',
      emoji: '🦮',
      color: '#b45309'
    };
  }
}

/**
 * Get questions for the quiz
 */
export function getVibeQuestions(): VibeQuestion[] {
  return VIBE_QUESTIONS;
}

/**
 * Get total question count
 */
export function getVibeQuestionCount(): number {
  return VIBE_QUESTIONS.length;
}

