/**
 * Tools Configuration
 * Define all available tools/apps in the platform
 */

export type ToolCategory = 'health' | 'money' | 'time' | 'utilities' | 'fun';

export interface ToolConfig {
  id: string;
  name: string;
  descriptiveName: string;
  shortDescription: string;
  seoTitle: string;
  seoDescription: string;
  icon: string;
  path: string;
  color: string;
  gradient: string;
  category: ToolCategory;
  available: boolean;
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  health: 'Health',
  money: 'Money',
  time: 'Time & Dates',
  utilities: 'Utilities',
  fun: 'Fun & Social',
};

export const TOOLS: ToolConfig[] = [
  // HEALTH
  {
    id: 'cut',
    name: 'CUT',
    descriptiveName: 'Weight Loss & Fasting Tool',
    shortDescription: 'Plan weight loss and fasting schedules in seconds.',
    seoTitle: 'Weight Loss & Fasting Tool – Free Handy Tool | Tulzo',
    seoDescription: 'Plan weight loss and fasting schedules with this fast, free handy tool.',
    icon: '📉',
    path: '/cut',
    color: '#667eea',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
    category: 'health',
    available: true,
  },
  {
    id: 'sleep',
    name: 'SLEEP',
    descriptiveName: 'Sleep Cycle Calculator',
    shortDescription: 'Find the best time to sleep or wake up.',
    seoTitle: 'Sleep Cycle Calculator – Free Handy Tool | Tulzo',
    seoDescription: 'Calculate optimal sleep and wake times based on sleep cycles.',
    icon: '😴',
    path: '/sleep',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
    category: 'health',
    available: true,
  },
  {
    id: 'rank',
    name: 'RANK',
    descriptiveName: 'Body Percentile Calculator',
    shortDescription: 'See where you rank in height and weight percentiles.',
    seoTitle: 'Body Percentile Calculator – Free Health Tool | Tulzo',
    seoDescription: 'Find where you rank in height and weight percentiles by age and gender. Based on 2025 CDC/WHO data.',
    icon: '📊',
    path: '/rank',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
    category: 'health',
    available: true,
  },
  {
    id: 'age',
    name: 'AGE',
    descriptiveName: 'Age Calculator',
    shortDescription: 'Calculate your exact age in years, months, and days.',
    seoTitle: 'Age Calculator – Free Handy Tool | Tulzo',
    seoDescription: 'Find out exactly how old you are in years, months, days, and more.',
    icon: '🎂',
    path: '/age',
    color: '#f472b6',
    gradient: 'linear-gradient(135deg, #f472b6 0%, #ec4899 50%, #db2777 100%)',
    category: 'utilities',
    available: true,
  },
  // MONEY
  {
    id: 'stack',
    name: 'STACK',
    descriptiveName: 'Budget & Savings Calculator',
    shortDescription: 'Plan budgets, track savings goals, and manage your money.',
    seoTitle: 'Budget & Savings Calculator – Free Handy Tool | Tulzo',
    seoDescription: 'Plan budgets, set savings goals, and track your progress with this fast, free tool.',
    icon: '💰',
    path: '/stack',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
    category: 'money',
    available: true,
  },
  {
    id: 'tip',
    name: 'TIP',
    descriptiveName: 'Tip Calculator',
    shortDescription: 'Calculate tips quickly for any bill.',
    seoTitle: 'Tip Calculator – Free Handy Tool | Tulzo',
    seoDescription: 'Calculate the perfect tip amount for any bill with this fast, free tool.',
    icon: '🍽️',
    path: '/tip',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
    category: 'money',
    available: true,
  },
  {
    id: 'percent',
    name: 'PERCENT',
    descriptiveName: 'Percentage Calculator',
    shortDescription: 'Calculate percentages, increases, and discounts.',
    seoTitle: 'Percentage Calculator – Free Handy Tool | Tulzo',
    seoDescription: 'Calculate percentages instantly with this fast, free handy tool.',
    icon: '%',
    path: '/percent',
    color: '#0ea5e9',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)',
    category: 'money',
    available: true,
  },
  // TIME
  {
    id: 'when',
    name: 'WHEN',
    descriptiveName: 'Date & Day Finder',
    shortDescription: 'Find the day of the week for any date.',
    seoTitle: 'Date & Day Finder – Free Handy Tool | Tulzo',
    seoDescription: 'Find the day of the week for any date with this fast, free handy tool.',
    icon: '📅',
    path: '/when',
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #0ea5e9 50%, #06b6d4 100%)',
    category: 'time',
    available: true,
  },
  {
    id: 'days',
    name: 'DAYS',
    descriptiveName: 'Countdown Timer',
    shortDescription: 'Count days until any event or date.',
    seoTitle: 'Countdown Timer – Free Handy Tool | Tulzo',
    seoDescription: 'Count down the days until your special event or deadline.',
    icon: '⏳',
    path: '/days',
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)',
    category: 'time',
    available: true,
  },
  {
    id: 'zone',
    name: 'ZONE',
    descriptiveName: 'Time Zone Converter',
    shortDescription: 'Convert times between different time zones.',
    seoTitle: 'Time Zone Converter – Free Handy Tool | Tulzo',
    seoDescription: 'Convert times between time zones for meetings and travel.',
    icon: '🌍',
    path: '/zone',
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)',
    category: 'time',
    available: true,
  },
  // UTILITIES
  {
    id: 'tap',
    name: 'TAP',
    descriptiveName: 'Click Counter & Tally Tool',
    shortDescription: 'Count clicks, reps, or events effortlessly.',
    seoTitle: 'Click Counter & Tally Tool – Free Handy Tool | Tulzo',
    seoDescription: 'Count clicks, reps, or events effortlessly with this fast, free handy tool.',
    icon: '👆',
    path: '/tap',
    color: '#f97316',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%)',
    category: 'utilities',
    available: true,
  },
  {
    id: 'convert',
    name: 'CONVERT',
    descriptiveName: 'Unit Converter',
    shortDescription: 'Convert units: weight, length, temperature.',
    seoTitle: 'Unit Converter – Free Handy Tool | Tulzo',
    seoDescription: 'Convert between common units like lbs/kg, cm/ft, °C/°F instantly.',
    icon: '🔄',
    path: '/convert',
    color: '#64748b',
    gradient: 'linear-gradient(135deg, #64748b 0%, #475569 50%, #334155 100%)',
    category: 'utilities',
    available: true,
  },
  {
    id: 'names',
    name: 'NAMES',
    descriptiveName: 'Name & Number Generator',
    shortDescription: 'Generate random names or numbers instantly.',
    seoTitle: 'Name & Number Generator – Free Handy Tool | Tulzo',
    seoDescription: 'Generate random names and numbers for games, writing, and more.',
    icon: '🎲',
    path: '/names',
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)',
    category: 'utilities',
    available: true,
  },
  // FUN
  {
    id: 'luck',
    name: 'LUCK',
    descriptiveName: 'Random Number Tool',
    shortDescription: 'Generate random numbers instantly.',
    seoTitle: 'Random Number Tool – Free Handy Tool | Tulzo',
    seoDescription: 'Generate random numbers instantly with this fast, free handy tool.',
    icon: '🎰',
    path: '/luck',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 50%, #d946ef 100%)',
    category: 'fun',
    available: true,
  },
  {
    id: 'flip',
    name: 'FLIP',
    descriptiveName: 'Coin Flip & Dice Roller',
    shortDescription: 'Flip coins or roll dice with a tap.',
    seoTitle: 'Coin Flip & Dice Roller – Free Handy Tool | Tulzo',
    seoDescription: 'Flip a coin or roll dice online with this fast, free handy tool.',
    icon: '🪙',
    path: '/flip',
    color: '#eab308',
    gradient: 'linear-gradient(135deg, #eab308 0%, #ca8a04 50%, #a16207 100%)',
    category: 'fun',
    available: true,
  },
  {
    id: 'spin',
    name: 'SPIN',
    descriptiveName: 'Spin the Wheel',
    shortDescription: 'Create a wheel and spin to pick randomly.',
    seoTitle: 'Spin the Wheel – Free Handy Tool | Tulzo',
    seoDescription: 'Spin a wheel to make random picks for games and decisions.',
    icon: '🎡',
    path: '/spin',
    color: '#ef4444',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)',
    category: 'fun',
    available: true,
  },
  {
    id: 'decide',
    name: 'DECIDE',
    descriptiveName: 'Decision Maker',
    shortDescription: 'Get a yes, no, or random pick instantly.',
    seoTitle: 'Decision Maker – Free Handy Tool | Tulzo',
    seoDescription: 'Make quick decisions with this yes/no picker and random chooser.',
    icon: '🤔',
    path: '/decide',
    color: '#22c55e',
    gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)',
    category: 'fun',
    available: true,
  },
  {
    id: 'match',
    name: 'MATCH',
    descriptiveName: 'Zodiac Match Tool',
    shortDescription: 'Check zodiac compatibility at a glance.',
    seoTitle: 'Zodiac Match Tool – Free Handy Tool | Tulzo',
    seoDescription: 'Check zodiac compatibility at a glance with this fast, free handy tool.',
    icon: '💕',
    path: '/match',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 50%, #fbbf24 100%)',
    category: 'fun',
    available: true,
  },
];

export const getToolByPath = (path: string): ToolConfig | undefined => {
  return TOOLS.find(tool => tool.path === path);
};

export const getAvailableTools = (): ToolConfig[] => {
  return TOOLS.filter(tool => tool.available);
};

export const getToolsByCategory = (): Record<ToolCategory, ToolConfig[]> => {
  const grouped: Record<ToolCategory, ToolConfig[]> = {
    health: [],
    money: [],
    time: [],
    utilities: [],
    fun: [],
  };

  TOOLS.filter(t => t.available).forEach(tool => {
    grouped[tool.category].push(tool);
  });

  return grouped;
};

export const getCategoryOrder = (): ToolCategory[] => {
  return ['health', 'money', 'time', 'utilities', 'fun'];
};

