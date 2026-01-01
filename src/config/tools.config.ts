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
  // Coming soon placeholders - blurred on homepage
  {
    id: 'coming-1',
    name: '',
    description: '',
    icon: '',
    path: '#',
    color: '#888',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    available: false,
  },
  {
    id: 'coming-2',
    name: '',
    description: '',
    icon: '',
    path: '#',
    color: '#888',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    available: false,
  },
];

export const getToolByPath = (path: string): ToolConfig | undefined => {
  return TOOLS.find(tool => tool.path === path);
};

export const getAvailableTools = (): ToolConfig[] => {
  return TOOLS.filter(tool => tool.available);
};

