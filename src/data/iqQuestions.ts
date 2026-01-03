/**
 * IQ Test Question Bank
 * Questions organized by category and difficulty
 * Based on common cognitive assessment patterns
 */

export interface IQQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  category: 'pattern' | 'logic' | 'math' | 'spatial' | 'verbal';
  difficulty: 'easy' | 'medium' | 'hard';
}

export type TestMode = 'quick' | 'standard' | 'comprehensive';

export interface TestModeConfig {
  name: string;
  description: string;
  questionCount: number;
  estimatedMinutes: number;
  emoji: string;
}

export const TEST_MODE_CONFIG: Record<TestMode, TestModeConfig> = {
  quick: {
    name: 'Quick Test',
    description: 'Fast assessment with essential questions',
    questionCount: 15,
    estimatedMinutes: 5,
    emoji: '⚡',
  },
  standard: {
    name: 'Standard Test',
    description: 'Balanced assessment across all categories',
    questionCount: 30,
    estimatedMinutes: 12,
    emoji: '📊',
  },
  comprehensive: {
    name: 'Comprehensive Test',
    description: 'Full assessment for detailed analysis',
    questionCount: 50,
    estimatedMinutes: 20,
    emoji: '🎯',
  },
};

// Full question bank - 50 questions covering all categories and difficulties
export const IQ_QUESTIONS: IQQuestion[] = [
  // PATTERN RECOGNITION (10 questions)
  { id: 1, question: 'What comes next: 2, 4, 8, 16, ?', options: ['24', '32', '30', '20'], correctIndex: 1, category: 'pattern', difficulty: 'easy' },
  { id: 2, question: 'What comes next: 3, 6, 11, 18, ?', options: ['25', '27', '26', '24'], correctIndex: 1, category: 'pattern', difficulty: 'easy' },
  { id: 3, question: 'What comes next: 1, 1, 2, 3, 5, 8, ?', options: ['11', '12', '13', '15'], correctIndex: 2, category: 'pattern', difficulty: 'easy' },
  { id: 4, question: 'What comes next: 81, 27, 9, 3, ?', options: ['0', '1', '2', '6'], correctIndex: 1, category: 'pattern', difficulty: 'medium' },
  { id: 5, question: 'If 2 = 6, 3 = 12, 4 = 20, then 5 = ?', options: ['25', '30', '35', '40'], correctIndex: 1, category: 'pattern', difficulty: 'medium' },
  { id: 6, question: 'What comes next: 1, 4, 9, 16, 25, ?', options: ['30', '36', '49', '35'], correctIndex: 1, category: 'pattern', difficulty: 'easy' },
  { id: 7, question: 'What comes next: 2, 6, 12, 20, 30, ?', options: ['40', '42', '44', '38'], correctIndex: 1, category: 'pattern', difficulty: 'medium' },
  { id: 8, question: 'What comes next: 1, 2, 4, 7, 11, 16, ?', options: ['20', '21', '22', '23'], correctIndex: 2, category: 'pattern', difficulty: 'hard' },
  { id: 9, question: 'What comes next: 3, 5, 9, 17, 33, ?', options: ['49', '57', '65', '66'], correctIndex: 2, category: 'pattern', difficulty: 'hard' },
  { id: 10, question: 'What comes next: 1, 3, 6, 10, 15, 21, ?', options: ['25', '27', '28', '30'], correctIndex: 2, category: 'pattern', difficulty: 'medium' },

  // LOGIC (10 questions)
  { id: 11, question: 'If all Bloops are Razzies and all Razzies are Lazzies, then all Bloops are definitely Lazzies?', options: ['True', 'False', 'Cannot determine', 'Sometimes'], correctIndex: 0, category: 'logic', difficulty: 'easy' },
  { id: 12, question: 'If 5 machines take 5 minutes to make 5 widgets, how long would 100 machines take to make 100 widgets?', options: ['100 minutes', '5 minutes', '20 minutes', '1 minute'], correctIndex: 1, category: 'logic', difficulty: 'medium' },
  { id: 13, question: 'A bat and ball cost $1.10. The bat costs $1 more than the ball. How much does the ball cost?', options: ['$0.10', '$0.05', '$0.15', '$0.20'], correctIndex: 1, category: 'logic', difficulty: 'medium' },
  { id: 14, question: "Mary's father has 5 daughters: Nana, Nene, Nini, Nono. What is the 5th daughter's name?", options: ['Nunu', 'Mary', 'Nana', 'None'], correctIndex: 1, category: 'logic', difficulty: 'easy' },
  { id: 15, question: 'If some cats are dogs and some dogs are birds, can some cats be birds?', options: ['Yes, definitely', 'No, never', 'Possibly', 'Only sometimes'], correctIndex: 2, category: 'logic', difficulty: 'medium' },
  { id: 16, question: 'A farmer has 17 sheep. All but 9 die. How many sheep are left?', options: ['8', '9', '17', '0'], correctIndex: 1, category: 'logic', difficulty: 'easy' },
  { id: 17, question: 'If it takes 3 people 3 hours to dig 3 holes, how long does it take 1 person to dig half a hole?', options: ['1 hour', '1.5 hours', '3 hours', 'Impossible'], correctIndex: 3, category: 'logic', difficulty: 'hard' },
  { id: 18, question: 'A doctor gives you 3 pills and tells you to take one every half hour. How long will the pills last?', options: ['1.5 hours', '1 hour', '2 hours', '30 minutes'], correctIndex: 1, category: 'logic', difficulty: 'medium' },
  { id: 19, question: 'How many times can you subtract 5 from 25?', options: ['5 times', '1 time', '4 times', 'Infinite'], correctIndex: 1, category: 'logic', difficulty: 'hard' },
  { id: 20, question: 'If you have a bowl with six apples and you take away four, how many do you have?', options: ['2', '4', '6', '0'], correctIndex: 1, category: 'logic', difficulty: 'medium' },

  // MATH (10 questions)
  { id: 21, question: 'What is 15% of 200?', options: ['25', '30', '35', '40'], correctIndex: 1, category: 'math', difficulty: 'easy' },
  { id: 22, question: 'If x + 5 = 12, what is x?', options: ['5', '6', '7', '8'], correctIndex: 2, category: 'math', difficulty: 'easy' },
  { id: 23, question: 'What is 144 ÷ 12?', options: ['10', '11', '12', '14'], correctIndex: 2, category: 'math', difficulty: 'easy' },
  { id: 24, question: 'What is the square root of 169?', options: ['11', '12', '13', '14'], correctIndex: 2, category: 'math', difficulty: 'medium' },
  { id: 25, question: 'If 3x - 7 = 14, what is x?', options: ['5', '6', '7', '8'], correctIndex: 2, category: 'math', difficulty: 'medium' },
  { id: 26, question: 'What is 25% of 80?', options: ['15', '20', '25', '30'], correctIndex: 1, category: 'math', difficulty: 'easy' },
  { id: 27, question: 'What is 7 × 8 + 6 ÷ 2?', options: ['56', '59', '31', '62'], correctIndex: 1, category: 'math', difficulty: 'medium' },
  { id: 28, question: 'If a train travels 120 km in 2 hours, what is its speed in km/h?', options: ['50', '55', '60', '65'], correctIndex: 2, category: 'math', difficulty: 'easy' },
  { id: 29, question: 'What is 2³ + 3²?', options: ['13', '15', '17', '19'], correctIndex: 2, category: 'math', difficulty: 'medium' },
  { id: 30, question: 'If the ratio of boys to girls is 3:5 and there are 24 boys, how many girls are there?', options: ['30', '35', '40', '45'], correctIndex: 2, category: 'math', difficulty: 'hard' },

  // SPATIAL (10 questions)
  { id: 31, question: 'Which shape completes the pattern: ○ □ △ ○ □ ?', options: ['○', '□', '△', '◇'], correctIndex: 2, category: 'spatial', difficulty: 'easy' },
  { id: 32, question: 'If you fold a square paper in half twice and cut a corner, how many holes when unfolded?', options: ['1', '2', '4', '8'], correctIndex: 2, category: 'spatial', difficulty: 'medium' },
  { id: 33, question: 'How many faces does a cube have?', options: ['4', '6', '8', '12'], correctIndex: 1, category: 'spatial', difficulty: 'easy' },
  { id: 34, question: 'If you rotate the letter "N" 180°, what letter do you get?', options: ['Z', 'N', 'M', 'W'], correctIndex: 1, category: 'spatial', difficulty: 'medium' },
  { id: 35, question: 'How many edges does a cube have?', options: ['6', '8', '10', '12'], correctIndex: 3, category: 'spatial', difficulty: 'medium' },
  { id: 36, question: 'Which shape has the most sides: hexagon, pentagon, or octagon?', options: ['Hexagon', 'Pentagon', 'Octagon', 'All equal'], correctIndex: 2, category: 'spatial', difficulty: 'easy' },
  { id: 37, question: 'If a clock shows 3:15, what is the angle between the hour and minute hands?', options: ['0°', '7.5°', '15°', '22.5°'], correctIndex: 1, category: 'spatial', difficulty: 'hard' },
  { id: 38, question: 'How many triangles can you see in a Star of David?', options: ['2', '6', '8', '12'], correctIndex: 2, category: 'spatial', difficulty: 'hard' },
  { id: 39, question: 'If you look at a mirror image of "AMBULANCE", how should it be written on the vehicle?', options: ['AMBULANCE', 'ECNALUBMA', 'Reversed', 'Upside down'], correctIndex: 1, category: 'spatial', difficulty: 'medium' },
  { id: 40, question: 'How many vertices does a triangular pyramid (tetrahedron) have?', options: ['3', '4', '5', '6'], correctIndex: 1, category: 'spatial', difficulty: 'medium' },

  // VERBAL (10 questions)
  { id: 41, question: 'HAND is to GLOVE as FOOT is to:', options: ['Leg', 'Sock', 'Shoe', 'Toe'], correctIndex: 1, category: 'verbal', difficulty: 'easy' },
  { id: 42, question: 'If you rearrange "CIFAIPC", you get the name of a(n):', options: ['City', 'Animal', 'Ocean', 'Country'], correctIndex: 2, category: 'verbal', difficulty: 'medium' },
  { id: 43, question: 'BOOK is to READING as FORK is to:', options: ['Drawing', 'Eating', 'Writing', 'Cooking'], correctIndex: 1, category: 'verbal', difficulty: 'easy' },
  { id: 44, question: 'Which word does NOT belong: Apple, Banana, Carrot, Orange', options: ['Apple', 'Banana', 'Carrot', 'Orange'], correctIndex: 2, category: 'verbal', difficulty: 'easy' },
  { id: 45, question: 'DOCTOR is to HOSPITAL as TEACHER is to:', options: ['Student', 'School', 'Book', 'Classroom'], correctIndex: 1, category: 'verbal', difficulty: 'easy' },
  { id: 46, question: 'Which word is the opposite of BENEVOLENT?', options: ['Kind', 'Malevolent', 'Generous', 'Helpful'], correctIndex: 1, category: 'verbal', difficulty: 'medium' },
  { id: 47, question: 'BIRD is to NEST as BEE is to:', options: ['Honey', 'Flower', 'Hive', 'Sting'], correctIndex: 2, category: 'verbal', difficulty: 'easy' },
  { id: 48, question: 'If you rearrange "EALGER", you get:', options: ['A bird', 'A color', 'A country', 'A fruit'], correctIndex: 0, category: 'verbal', difficulty: 'medium' },
  { id: 49, question: 'Which word means the same as EPHEMERAL?', options: ['Eternal', 'Temporary', 'Solid', 'Ancient'], correctIndex: 1, category: 'verbal', difficulty: 'hard' },
  { id: 50, question: 'WATER is to THIRST as FOOD is to:', options: ['Eat', 'Hunger', 'Cook', 'Taste'], correctIndex: 1, category: 'verbal', difficulty: 'easy' },
];

/**
 * Get questions for a specific test mode
 * Ensures balanced distribution across categories and difficulties
 */
export function getQuestionsForMode(mode: TestMode): IQQuestion[] {
  const config = TEST_MODE_CONFIG[mode];
  const count = config.questionCount;

  // For quick mode, use first 15 questions (balanced selection)
  if (mode === 'quick') {
    // Select 3 from each category (pattern, logic, math, spatial, verbal)
    const categories: IQQuestion['category'][] = ['pattern', 'logic', 'math', 'spatial', 'verbal'];
    const selected: IQQuestion[] = [];

    for (const cat of categories) {
      const catQuestions = IQ_QUESTIONS.filter(q => q.category === cat);
      // Take 3 questions: 1 easy, 1 medium, 1 hard (or best available)
      const easy = catQuestions.filter(q => q.difficulty === 'easy')[0];
      const medium = catQuestions.filter(q => q.difficulty === 'medium')[0];
      const hard = catQuestions.filter(q => q.difficulty === 'hard')[0] || catQuestions.filter(q => q.difficulty === 'medium')[1];
      if (easy) selected.push(easy);
      if (medium) selected.push(medium);
      if (hard) selected.push(hard);
    }

    return selected.slice(0, count);
  }

  // For standard mode, use 30 questions (6 from each category)
  if (mode === 'standard') {
    const categories: IQQuestion['category'][] = ['pattern', 'logic', 'math', 'spatial', 'verbal'];
    const selected: IQQuestion[] = [];

    for (const cat of categories) {
      const catQuestions = IQ_QUESTIONS.filter(q => q.category === cat);
      selected.push(...catQuestions.slice(0, 6));
    }

    return selected.slice(0, count);
  }

  // For comprehensive mode, use all 50 questions
  return IQ_QUESTIONS.slice(0, count);
}

/**
 * Calculate IQ score based on correct answers
 * Uses a more sophisticated algorithm based on difficulty weighting
 */
export function calculateIQScore(
  answers: (number | null)[],
  questions: IQQuestion[]
): { iq: number; percentile: number; correctCount: number; categoryScores: Record<string, { correct: number; total: number }> } {
  let correctCount = 0;
  let weightedScore = 0;
  let maxWeightedScore = 0;

  const categoryScores: Record<string, { correct: number; total: number }> = {
    pattern: { correct: 0, total: 0 },
    logic: { correct: 0, total: 0 },
    math: { correct: 0, total: 0 },
    spatial: { correct: 0, total: 0 },
    verbal: { correct: 0, total: 0 },
  };

  // Difficulty weights
  const weights = { easy: 1, medium: 1.5, hard: 2 };

  questions.forEach((q, idx) => {
    const weight = weights[q.difficulty];
    maxWeightedScore += weight;
    categoryScores[q.category].total++;

    if (answers[idx] === q.correctIndex) {
      correctCount++;
      weightedScore += weight;
      categoryScores[q.category].correct++;
    }
  });

  // Calculate percentage based on weighted score
  const percentage = maxWeightedScore > 0 ? weightedScore / maxWeightedScore : 0;

  // Map to IQ scale: 0% = 70, 100% = 145
  // Using a slight curve to make it more realistic
  const iq = Math.round(70 + percentage * 75);

  // Calculate percentile using normal distribution (mean=100, SD=15)
  const z = (iq - 100) / 15;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const percentile = Math.round((z > 0 ? 1 - p : p) * 100);

  return { iq, percentile, correctCount, categoryScores };
}

/**
 * Get IQ classification label
 */
export function getIQLabel(iq: number): { label: string; emoji: string; color: string } {
  if (iq >= 130) return { label: 'Very Superior', emoji: '🧠✨', color: '#10b981' };
  if (iq >= 120) return { label: 'Superior', emoji: '🌟', color: '#22c55e' };
  if (iq >= 110) return { label: 'High Average', emoji: '👍', color: '#84cc16' };
  if (iq >= 90) return { label: 'Average', emoji: '😊', color: '#eab308' };
  if (iq >= 80) return { label: 'Low Average', emoji: '🤔', color: '#f97316' };
  return { label: 'Below Average', emoji: '💪', color: '#ef4444' };
}
