/**
 * MCP Composer Configuration
 * 
 * Controls whether MCP Server Composition features are enabled.
 * Set NEXT_PUBLIC_SUPPORT_MCP_COMPOSITION=true in .env to enable.
 */

export const MCP_COMPOSER_CONFIG = {
  /**
   * Whether MCP composition features are enabled.
   * When true, shows:
   * - Create custom MCP server button in dashboard
   * - MCP composer page
   * - Custom MCP server cards in dashboard
   */
  enabled: process.env.NEXT_PUBLIC_SUPPORT_MCP_COMPOSITION === 'true',

  /**
   * Tool count thresholds for warnings
   */
  thresholds: {
    /** Tools <= this count show green (optimal) */
    optimal: 10,
    /** Tools > optimal and <= this count show yellow (warning) */
    warning: 20,
    /** Tools > warning show red (danger) */
  },
};

/**
 * Check if MCP composition features should be displayed
 */
export const isMcpComposerEnabled = (): boolean => MCP_COMPOSER_CONFIG.enabled;

/**
 * Get the severity level based on tool count
 */
export const getToolCountSeverity = (count: number): 'optimal' | 'warning' | 'danger' => {
  if (count <= MCP_COMPOSER_CONFIG.thresholds.optimal) return 'optimal';
  if (count <= MCP_COMPOSER_CONFIG.thresholds.warning) return 'warning';
  return 'danger';
};

/**
 * Get color for tool count severity
 */
export const getToolCountColor = (severity: 'optimal' | 'warning' | 'danger'): string => {
  switch (severity) {
    case 'optimal': return '#10b981'; // green
    case 'warning': return '#f59e0b'; // yellow/amber
    case 'danger': return '#ef4444'; // red
  }
};

