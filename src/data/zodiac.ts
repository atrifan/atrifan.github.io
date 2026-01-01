/**
 * Zodiac Signs Data
 * Traditional Western astrology dates and compatibility
 */

export type ZodiacSign = 
  | 'aries' | 'taurus' | 'gemini' | 'cancer' 
  | 'leo' | 'virgo' | 'libra' | 'scorpio' 
  | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export interface ZodiacInfo {
  id: ZodiacSign;
  name: string;
  symbol: string;
  element: 'fire' | 'earth' | 'air' | 'water';
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  traits: string[];
}

export const ZODIAC_SIGNS: ZodiacInfo[] = [
  { id: 'aries', name: 'Aries', symbol: '♈', element: 'fire', startMonth: 3, startDay: 21, endMonth: 4, endDay: 19, traits: ['Bold', 'Ambitious', 'Energetic'] },
  { id: 'taurus', name: 'Taurus', symbol: '♉', element: 'earth', startMonth: 4, startDay: 20, endMonth: 5, endDay: 20, traits: ['Reliable', 'Patient', 'Devoted'] },
  { id: 'gemini', name: 'Gemini', symbol: '♊', element: 'air', startMonth: 5, startDay: 21, endMonth: 6, endDay: 20, traits: ['Curious', 'Adaptable', 'Witty'] },
  { id: 'cancer', name: 'Cancer', symbol: '♋', element: 'water', startMonth: 6, startDay: 21, endMonth: 7, endDay: 22, traits: ['Intuitive', 'Loyal', 'Emotional'] },
  { id: 'leo', name: 'Leo', symbol: '♌', element: 'fire', startMonth: 7, startDay: 23, endMonth: 8, endDay: 22, traits: ['Creative', 'Passionate', 'Generous'] },
  { id: 'virgo', name: 'Virgo', symbol: '♍', element: 'earth', startMonth: 8, startDay: 23, endMonth: 9, endDay: 22, traits: ['Analytical', 'Practical', 'Kind'] },
  { id: 'libra', name: 'Libra', symbol: '♎', element: 'air', startMonth: 9, startDay: 23, endMonth: 10, endDay: 22, traits: ['Diplomatic', 'Fair', 'Social'] },
  { id: 'scorpio', name: 'Scorpio', symbol: '♏', element: 'water', startMonth: 10, startDay: 23, endMonth: 11, endDay: 21, traits: ['Passionate', 'Resourceful', 'Brave'] },
  { id: 'sagittarius', name: 'Sagittarius', symbol: '♐', element: 'fire', startMonth: 11, startDay: 22, endMonth: 12, endDay: 21, traits: ['Optimistic', 'Adventurous', 'Honest'] },
  { id: 'capricorn', name: 'Capricorn', symbol: '♑', element: 'earth', startMonth: 12, startDay: 22, endMonth: 1, endDay: 19, traits: ['Disciplined', 'Responsible', 'Patient'] },
  { id: 'aquarius', name: 'Aquarius', symbol: '♒', element: 'air', startMonth: 1, startDay: 20, endMonth: 2, endDay: 18, traits: ['Progressive', 'Independent', 'Humanitarian'] },
  { id: 'pisces', name: 'Pisces', symbol: '♓', element: 'water', startMonth: 2, startDay: 19, endMonth: 3, endDay: 20, traits: ['Compassionate', 'Artistic', 'Intuitive'] },
];

// Compatibility matrix (percentage 0-100)
// Based on traditional astrology element compatibility
const COMPAT: Record<ZodiacSign, Record<ZodiacSign, number>> = {
  aries:       { aries: 75, taurus: 55, gemini: 83, cancer: 42, leo: 97, virgo: 48, libra: 85, scorpio: 50, sagittarius: 93, capricorn: 47, aquarius: 78, pisces: 67 },
  taurus:      { aries: 55, taurus: 86, gemini: 33, cancer: 97, leo: 73, virgo: 90, libra: 65, scorpio: 88, sagittarius: 30, capricorn: 98, aquarius: 58, pisces: 85 },
  gemini:      { aries: 83, taurus: 33, gemini: 60, cancer: 65, leo: 88, virgo: 68, libra: 93, scorpio: 28, sagittarius: 60, capricorn: 68, aquarius: 85, pisces: 53 },
  cancer:      { aries: 42, taurus: 97, gemini: 65, cancer: 75, leo: 35, virgo: 90, libra: 43, scorpio: 94, sagittarius: 53, capricorn: 83, aquarius: 25, pisces: 98 },
  leo:         { aries: 97, taurus: 73, gemini: 88, cancer: 35, leo: 80, virgo: 35, libra: 97, scorpio: 58, sagittarius: 93, capricorn: 35, aquarius: 68, pisces: 38 },
  virgo:       { aries: 48, taurus: 90, gemini: 68, cancer: 90, leo: 35, virgo: 65, libra: 68, scorpio: 88, sagittarius: 48, capricorn: 95, aquarius: 30, pisces: 88 },
  libra:       { aries: 85, taurus: 65, gemini: 93, cancer: 43, leo: 97, virgo: 68, libra: 75, scorpio: 35, sagittarius: 73, capricorn: 55, aquarius: 90, pisces: 88 },
  scorpio:     { aries: 50, taurus: 88, gemini: 28, cancer: 94, leo: 58, virgo: 88, libra: 35, scorpio: 80, sagittarius: 28, capricorn: 95, aquarius: 73, pisces: 97 },
  sagittarius: { aries: 93, taurus: 30, gemini: 60, cancer: 53, leo: 93, virgo: 48, libra: 73, scorpio: 28, sagittarius: 78, capricorn: 60, aquarius: 90, pisces: 63 },
  capricorn:   { aries: 47, taurus: 98, gemini: 68, cancer: 83, leo: 35, virgo: 95, libra: 55, scorpio: 95, sagittarius: 60, capricorn: 75, aquarius: 68, pisces: 88 },
  aquarius:    { aries: 78, taurus: 58, gemini: 85, cancer: 25, leo: 68, virgo: 30, libra: 90, scorpio: 73, sagittarius: 90, capricorn: 68, aquarius: 80, pisces: 45 },
  pisces:      { aries: 67, taurus: 85, gemini: 53, cancer: 98, leo: 38, virgo: 88, libra: 88, scorpio: 97, sagittarius: 63, capricorn: 88, aquarius: 45, pisces: 85 },
};

export const getSignFromDate = (month: number, day: number): ZodiacSign => {
  for (const sign of ZODIAC_SIGNS) {
    if (sign.startMonth === sign.endMonth) {
      if (month === sign.startMonth && day >= sign.startDay && day <= sign.endDay) return sign.id;
    } else if (sign.startMonth < sign.endMonth) {
      if ((month === sign.startMonth && day >= sign.startDay) || (month === sign.endMonth && day <= sign.endDay)) return sign.id;
    } else {
      // Capricorn case (Dec-Jan)
      if ((month === sign.startMonth && day >= sign.startDay) || (month === sign.endMonth && day <= sign.endDay)) return sign.id;
    }
  }
  return 'capricorn'; // fallback
};

export const getCompatibility = (sign1: ZodiacSign, sign2: ZodiacSign): number => {
  return COMPAT[sign1][sign2];
};

export const getSignInfo = (sign: ZodiacSign): ZodiacInfo => {
  return ZODIAC_SIGNS.find(s => s.id === sign)!;
};

export const getCompatibilityMessage = (percentage: number): { emoji: string; message: string; color: string } => {
  if (percentage >= 90) return { emoji: '💕', message: 'Soulmate potential! An incredible cosmic connection.', color: '#ec4899' };
  if (percentage >= 80) return { emoji: '❤️', message: 'Highly compatible! Great chemistry and understanding.', color: '#f43f5e' };
  if (percentage >= 70) return { emoji: '💖', message: 'Strong match! You complement each other well.', color: '#fb7185' };
  if (percentage >= 60) return { emoji: '💛', message: 'Good compatibility. With effort, this can flourish.', color: '#fbbf24' };
  if (percentage >= 50) return { emoji: '🤝', message: 'Moderate match. Differences can be bridged.', color: '#a3e635' };
  if (percentage >= 40) return { emoji: '🌱', message: 'Challenging but possible. Growth opportunities!', color: '#4ade80' };
  return { emoji: '⚡', message: 'Opposites attract? This pairing needs work.', color: '#60a5fa' };
};

