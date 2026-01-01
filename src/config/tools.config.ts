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
    id: 'stack',
    name: 'STACK',
    descriptiveName: 'Budget & Savings Tool',
    shortDescription: 'Track budgets and savings quickly and clearly.',
    seoTitle: 'Budget & Savings Tool – Free Handy Tool | Tulzo',
    seoDescription: 'Track budgets and savings quickly with this fast, free handy tool.',
    icon: '💰',
    path: '/stack',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
    category: 'money',
    available: true,
  },
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
    id: 'tap',
    name: 'TAP',
    descriptiveName: 'Click Counter & Tally Tool',
    shortDescription: 'Count clicks, reps, or events effortlessly.',
    seoTitle: 'Click Counter & Tally Tool – Free Handy Tool | Tulzo',
    seoDescription: 'Count clicks, reps, or events effortlessly with this fast, free handy tool.',
    icon: '👆',
    path: '/tap',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)',
    category: 'utilities',
    available: true,
  },
  {
    id: 'luck',
    name: 'LUCK',
    descriptiveName: 'Random Number Tool',
    shortDescription: 'Generate random numbers instantly.',
    seoTitle: 'Random Number Tool – Free Handy Tool | Tulzo',
    seoDescription: 'Generate random numbers instantly with this fast, free handy tool.',
    icon: '🎲',
    path: '/luck',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 50%, #d946ef 100%)',
    category: 'utilities',
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

