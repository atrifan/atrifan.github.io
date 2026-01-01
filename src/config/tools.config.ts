/**
 * Tools Configuration
 * Define all available tools/apps in the platform
 */

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  path: string;
  color: string;
  gradient: string;
  available: boolean;
}

export const TOOLS: ToolConfig[] = [
  {
    id: 'cut',
    name: 'CUT',
    description: 'Weight Loss Calculator & Fasting Plan Generator',
    icon: '📉',
    path: '/cut',
    color: '#667eea',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
    available: true,
  },
  {
    id: 'stack',
    name: 'STACK',
    description: 'Budget & Savings Planner - Stack Your Bread 💰',
    icon: '💰',
    path: '/stack',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
    available: true,
  },
  {
    id: 'when',
    name: 'WHEN',
    description: 'What day is it? Find the day of week for any date 📅',
    icon: '📅',
    path: '/when',
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #0ea5e9 50%, #06b6d4 100%)',
    available: true,
  },
  {
    id: 'tap',
    name: 'TAP',
    description: 'Click counter, lap timer & tally tracker 👆',
    icon: '👆',
    path: '/tap',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)',
    available: true,
  },
  {
    id: 'luck',
    name: 'LUCK',
    description: 'Random number generator - Hold to Roll 🎲',
    icon: '🎲',
    path: '/luck',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 50%, #d946ef 100%)',
    available: true,
  },
  {
    id: 'match',
    name: 'MATCH',
    description: 'Zodiac compatibility checker - Find your love match 💕',
    icon: '💕',
    path: '/match',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 50%, #fbbf24 100%)',
    available: true,
  },
];

export const getToolByPath = (path: string): ToolConfig | undefined => {
  return TOOLS.find(tool => tool.path === path);
};

export const getAvailableTools = (): ToolConfig[] => {
  return TOOLS.filter(tool => tool.available);
};

