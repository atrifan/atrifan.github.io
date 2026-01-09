'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { RestApiToolsSection } from '../components/RestApiToolsSection';
import { GraphQLToolsSection } from '../components/GraphQLToolsSection';
import { MCPToolsSection } from '../components/MCPToolsSection';
import { AgentToolsSection } from '../components/AgentToolsSection';
import { UpgradeModal } from '../components/UpgradeModal';
import { BackToTools } from '../components/BackToTools';
import { ADS_CONFIG } from '../config/ads.config';
import { isMcpComposerEnabled, getToolCountSeverity, getToolCountColor, MCP_COMPOSER_CONFIG } from '../config/mcp-composer.config';
import type { MCPTool, SaveModalType } from '../types/mcp-composer';

interface MCPComposerPageProps {
  isPro: boolean;
  isPlus: boolean;
}

// Category icons
const categoryIcons: Record<string, string> = {
  'Health & Fitness': '💪',
  'Random & Fun': '🎲',
  'Date & Time': '📅',
  'Finance': '💰',
  'Math': '🔢',
  'Astrology': '⭐',
  'Utility': '🔧',
};

interface ToolsResponse {
  tools: MCPTool[];
  totalCount: number;
  categories: string[];
}

// Save confirmation modal component
const SaveModal: React.FC<{
  type: SaveModalType;
  toolCount: number;
  isEditMode?: boolean;
  isDefaultServer?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ type, toolCount, isEditMode = false, isDefaultServer = false, onConfirm, onCancel }) => {
  if (!type) return null;

  const actionWord = isDefaultServer ? 'Saved' : isEditMode ? 'Updated' : 'Created';
  const actionVerb = isDefaultServer ? 'Save' : isEditMode ? 'Update' : 'Create';
  const serverType = isDefaultServer ? 'default server' : 'custom MCP server';

  const config = {
    success: {
      icon: '✅',
      title: isDefaultServer ? 'Configuration Saved!' : `MCP Server ${actionWord}!`,
      message: isDefaultServer
        ? `Your default server configuration with ${toolCount} enabled tools has been saved successfully.`
        : `Your custom MCP server with ${toolCount} tools has been ${actionWord.toLowerCase()} successfully.`,
      bgColor: 'rgba(16, 185, 129, 0.2)',
      borderColor: 'rgba(16, 185, 129, 0.5)',
      textColor: '#10b981',
      showCancel: false,
      confirmText: 'Go to Dashboard',
    },
    warning: {
      icon: '⚠️',
      title: 'Many Tools Enabled',
      message: `You have ${toolCount} tools enabled. Having more than ${MCP_COMPOSER_CONFIG.thresholds.optimal} tools may cause AI assistants to have difficulty choosing the right tool, leading to potential collisions and unexpected behavior.`,
      bgColor: 'rgba(245, 158, 11, 0.2)',
      borderColor: 'rgba(245, 158, 11, 0.5)',
      textColor: '#f59e0b',
      showCancel: true,
      confirmText: `${actionVerb} Anyway`,
    },
    danger: {
      icon: '🚨',
      title: 'Too Many Tools!',
      message: `You have ${toolCount} tools enabled. Having more than ${MCP_COMPOSER_CONFIG.thresholds.warning} tools is strongly discouraged as it significantly increases the chance of tool collisions and poor AI performance.${!isDefaultServer ? ' Consider creating multiple focused MCP servers instead.' : ''}`,
      bgColor: 'rgba(239, 68, 68, 0.2)',
      borderColor: 'rgba(239, 68, 68, 0.5)',
      textColor: '#ef4444',
      showCancel: true,
      confirmText: `I Understand, ${actionVerb} Anyway`,
    },
  };

  const c = config[type];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        border: `2px solid ${c.borderColor}`,
        borderRadius: '20px',
        padding: 'clamp(1.5rem, 4vw, 2rem)',
        maxWidth: '31rem',
        width: '100%',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '3rem' }}>{c.icon}</span>
          <h2 style={{ color: c.textColor, fontSize: '1.5rem', fontWeight: 700, margin: '1rem 0 0.5rem' }}>
            {c.title}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
            {c.message}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          {c.showCancel && (
            <button
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: '#fff',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={onConfirm}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '10px',
              border: 'none',
              background: `linear-gradient(135deg, ${c.textColor}, ${c.textColor}dd)`,
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {c.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// Tool count warning icon component with click-to-show tooltip
export const ToolCountWarning: React.FC<{ count: number }> = ({ count }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const severity = getToolCountSeverity(count);
  const color = getToolCountColor(severity);

  if (severity === 'optimal') return null;

  const tooltipText = severity === 'warning'
    ? `${count} tools: May cause AI confusion`
    : `${count} tools: High collision risk!`;

  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginLeft: '0.5rem' }}>
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        onBlur={() => setShowTooltip(false)}
        aria-label={tooltipText}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: `${color}33`,
          color: color,
          fontSize: '0.7rem',
          fontWeight: 700,
          cursor: 'pointer',
          border: 'none',
          padding: 0,
        }}
      >
        !
      </button>
      {showTooltip && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            padding: '0.5rem 0.75rem',
            background: 'rgba(0,0,0,0.9)',
            color: '#fff',
            fontSize: '0.8rem',
            borderRadius: '8px',
            whiteSpace: 'nowrap',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {tooltipText}
          <span style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '6px',
            borderStyle: 'solid',
            borderColor: 'rgba(0,0,0,0.9) transparent transparent transparent',
          }} />
        </span>
      )}
    </span>
  );
};

// Tool count badge component
export const ToolCountBadge: React.FC<{ count: number }> = ({ count }) => {
  const severity = getToolCountSeverity(count);
  const color = getToolCountColor(severity);

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.25rem 0.5rem',
      borderRadius: '12px',
      background: `${color}22`,
      color: color,
      fontSize: '0.75rem',
      fontWeight: 600,
    }}>
      {count} tools
      {severity !== 'optimal' && <ToolCountWarning count={count} />}
    </span>
  );
};

export const MCPComposerPage: React.FC<MCPComposerPageProps> = ({ isPro, isPlus }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editServerId = searchParams.get('edit');
  const isDefaultServer = editServerId === 'default';
  const canAccessPro = isPro || isPlus;

  const [tools, setTools] = useState<MCPTool[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverName, setServerName] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [showModal, setShowModal] = useState<SaveModalType>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [allToolNames, setAllToolNames] = useState<string[]>([]);
  // Map of tool name -> tool ID for Supabase updates
  const [toolIdMap, setToolIdMap] = useState<Record<string, string>>({});
  // Tool docs modal state
  const [viewingToolDocs, setViewingToolDocs] = useState<MCPTool | null>(null);
  // Track if there are GraphQL tools (for filter)
  const [hasGraphQLTools, setHasGraphQLTools] = useState(false);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Check if feature is enabled (only for Pro users)
  useEffect(() => {
    if (canAccessPro && !isMcpComposerEnabled()) {
      router.push('/dashboard');
    }
  }, [router, canAccessPro]);

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <div style={{ minHeight: '100vh', padding: 'clamp(1rem, 4vw, 2rem)', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <UpgradeModal
          isOpen={true}
          title="MCP Composer - Pro Feature"
          featureName="MCP Composer with custom server creation"
          showCloseButton={false}
        />
        <div style={{ maxWidth: '56rem', margin: '0 auto', filter: 'blur(8px)', pointerEvents: 'none' }}>
          <div style={{ marginBottom: '2rem' }}>
            <BackToTools />
          </div>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
            <h1 style={{
              fontSize: 'clamp(1.75rem, 6vw, 4rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              MCP COMPOSER
            </h1>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Function to refresh tools list (called when REST API tools change)
  const refreshTools = async () => {
    try {
      const toolsRes = await fetch('/api/tools');
      const toolsData: ToolsResponse = await toolsRes.json();
      setTools(toolsData.tools);
      setCategories(toolsData.categories);
      const toolNames = toolsData.tools.map((t: MCPTool) => t.name);
      setAllToolNames(toolNames);
    } catch (error) {
      console.error('Failed to refresh tools:', error);
    }
  };

  // Fetch tools first, then load server data from Supabase
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch all available tools
        const toolsRes = await fetch('/api/tools');
        const toolsData: ToolsResponse = await toolsRes.json();
        setTools(toolsData.tools);
        setCategories(toolsData.categories);
        const toolNames = toolsData.tools.map((t: MCPTool) => t.name);
        setAllToolNames(toolNames);

        // Now load server data based on edit mode
        if (editServerId) {
          try {
            const serverRes = await fetch(`/api/servers/${encodeURIComponent(editServerId)}`);
            if (serverRes.ok) {
              const { server } = await serverRes.json();

              // Build tool ID map from server response
              const idMap: Record<string, string> = {};
              server.tools.forEach((t: { name: string; toolId: string }) => {
                idMap[t.name] = t.toolId;
              });
              setToolIdMap(idMap);

              // Get enabled tool names
              const enabledTools = server.tools
                .filter((t: { isEnabled: boolean }) => t.isEnabled)
                .map((t: { name: string }) => t.name);

              if (isDefaultServer) {
                setSelectedTools(enabledTools.length > 0 ? enabledTools : toolNames);
                setServerName('Default Server');
              } else {
                setServerName(server.name || server.serverName);
                setSelectedTools(enabledTools);
              }
              setIsEditMode(true);
            } else if (isDefaultServer) {
              // No server config yet for default, all tools are enabled
              setSelectedTools(toolNames);
              setServerName('Default Server');
              setIsEditMode(true);
            }
          } catch (error) {
            console.error('Failed to load server config:', error);
            if (isDefaultServer) {
              setSelectedTools(toolNames);
              setServerName('Default Server');
              setIsEditMode(true);
            }
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Failed to load tools:', error);
        setLoading(false);
      }
    };

    loadData();
  }, [editServerId, isDefaultServer]);

  const filteredTools = tools.filter(tool => {
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesType = selectedType === 'all' || (tool.toolType || 'NATIVE') === selectedType;
    const matchesSearch = searchQuery === '' ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesType && matchesSearch;
  });

  // Get unique tool types for filter
  const toolTypes = ['NATIVE', 'REST', 'MCP', 'GQL', 'A2A'].filter(type =>
    type === 'GQL' ? hasGraphQLTools : tools.some(t => (t.toolType || 'NATIVE') === type)
  );

  const toggleTool = (toolName: string) => {
    setSelectedTools(prev =>
      prev.includes(toolName)
        ? prev.filter(t => t !== toolName)
        : [...prev, toolName]
    );
  };

  const selectAll = () => {
    const allFilteredNames = filteredTools.map(t => t.name);
    setSelectedTools(prev => {
      const newSet = new Set([...prev, ...allFilteredNames]);
      return Array.from(newSet);
    });
  };

  const deselectAll = () => {
    const filteredNames = new Set(filteredTools.map(t => t.name));
    setSelectedTools(prev => prev.filter(t => !filteredNames.has(t)));
  };

  const handleSave = () => {
    // For default server, only need selected tools. For custom, also need name.
    const canSave = isDefaultServer
      ? selectedTools.length > 0
      : selectedTools.length > 0 && serverName.trim();

    if (!canSave) return;

    const severity = getToolCountSeverity(selectedTools.length);
    if (severity === 'optimal') {
      setShowModal('success');
    } else if (severity === 'warning') {
      setShowModal('warning');
    } else {
      setShowModal('danger');
    }
  };

  const confirmSave = async () => {
    setSaving(true);

    try {
      if (isEditMode && editServerId) {
        // Update existing server
        const selectedSet = new Set(selectedTools);
        const disabledTools = allToolNames.filter(name => !selectedSet.has(name));

        const response = await fetch(`/api/servers/${encodeURIComponent(editServerId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: isDefaultServer ? undefined : serverName.trim(),
            disabledTools,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update server configuration');
        }
      } else {
        // Create new server
        const response = await fetch('/api/servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: serverName.trim(),
            serverName: serverName.trim().toLowerCase().replace(/\s+/g, '-'),
            tools: selectedTools,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create server');
        }
      }

      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to save server configuration:', error);
      setSaving(false);
    }
  };

  const formatToolName = (name: string) => {
    return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '3px solid rgba(167, 139, 250, 0.3)',
          borderTopColor: '#a78bfa',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
    }}>
      <SideAds
        leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
        leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
        leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
        rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
        rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
        rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
      />

      <main style={{
        maxWidth: '56rem',
        margin: '0 auto',
        padding: 'clamp(1rem, 4vw, 2rem)',
      }}>
        {/* Back Link */}
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: '1rem',
            padding: '0.5rem 1rem',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50px',
            transition: 'all 0.3s ease',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'translateX(-5px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.transform = 'translateX(0)';
          }}
          >
            <span style={{ fontSize: '1.2rem' }}>←</span>
            <span>Back to Dashboard</span>
          </div>
        </Link>

        {/* Page Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            color: '#fff',
            fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
            fontWeight: 800,
            margin: '0 0 0.75rem',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            🔧 {isDefaultServer ? 'Configure Default Server' : isEditMode ? 'Edit MCP Server' : 'Create Custom MCP Server'}
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)',
            margin: 0,
            lineHeight: 1.6,
          }}>
            {isDefaultServer
              ? 'Toggle tools on or off for your default server. Disabled tools will not be available to AI assistants.'
              : isEditMode
                ? 'Update your custom MCP server configuration. Add or remove tools as needed.'
                : 'Build a focused MCP server with only the tools you need. Fewer tools means better AI performance and fewer collisions.'}
          </p>
        </div>

        {/* Top Ad - after title */}
        <div style={{ marginBottom: '1.5rem' }}>
          <AdBanner slot={ADS_CONFIG.slots.mcpComposerTop} format="horizontal" />
        </div>

        {/* Disclaimer */}
        <div style={{
          background: 'rgba(102, 126, 234, 0.1)',
          border: '1px solid rgba(102, 126, 234, 0.3)',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1.5rem',
        }}>
          <h3 style={{ color: '#667eea', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            💡 Why create a custom MCP server?
          </h3>
          <ul style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8 }}>
            <li><strong>Better AI focus:</strong> Fewer tools means the AI can choose more accurately</li>
            <li><strong>Reduced collisions:</strong> Similar tools won&apos;t confuse the AI</li>
            <li><strong>Faster responses:</strong> Less context for the AI to process</li>
            <li><strong>Task-specific:</strong> Create servers for specific workflows (e.g., &quot;Health Tools&quot;, &quot;Finance Tools&quot;)</li>
          </ul>
        </div>

        {/* REST API Tools Section */}
        {/* Server Name Input - hidden for default server - FIRST */}
        {!isDefaultServer && (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: 'clamp(1rem, 3vw, 1.5rem)',
            marginBottom: '1.5rem',
          }}>
            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
              Server Name *
            </label>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="e.g., Health & Fitness Tools"
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                fontSize: '1rem',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* Selected Tools Summary */}
        <div style={{
          background: selectedTools.length > 0
            ? `${getToolCountColor(getToolCountSeverity(selectedTools.length))}22`
            : 'rgba(255,255,255,0.05)',
          border: `1px solid ${selectedTools.length > 0
            ? `${getToolCountColor(getToolCountSeverity(selectedTools.length))}44`
            : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>Selected:</span>
            <ToolCountBadge count={selectedTools.length} />
          </div>
          {(() => {
            // For default server, only need selected tools. For custom, also need name.
            const canSave = isDefaultServer
              ? selectedTools.length > 0
              : selectedTools.length > 0 && serverName.trim();
            return (
              <button
                onClick={handleSave}
                disabled={!canSave}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: canSave
                    ? 'linear-gradient(135deg, #667eea, #764ba2)'
                    : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: canSave ? 'pointer' : 'not-allowed',
                  opacity: canSave ? 1 : 0.5,
                }}
              >
                {isDefaultServer ? 'Save Configuration' : isEditMode ? 'Update Server' : 'Create Server'}
              </button>
            );
          })()}
        </div>
        {/* Search & Filter */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          marginBottom: '1rem',
        }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: searchQuery ? '0.875rem 2.5rem 0.875rem 1rem' : '0.875rem 1rem',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: '1rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
                aria-label="Clear search"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Category Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              onClick={() => setSelectedCategory('all')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                border: 'none',
                background: selectedCategory === 'all'
                  ? 'linear-gradient(135deg, #667eea, #764ba2)'
                  : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All ({tools.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '20px',
                  border: 'none',
                  background: selectedCategory === cat
                    ? 'linear-gradient(135deg, #667eea, #764ba2)'
                    : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                {categoryIcons[cat] || '📦'} {cat}
              </button>
            ))}
          </div>

          {/* Type Filter Pills */}
          {toolTypes.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginRight: '0.25rem' }}>Type:</span>
              <button
                onClick={() => setSelectedType('all')}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '16px',
                  border: 'none',
                  background: selectedType === 'all'
                    ? 'linear-gradient(135deg, #667eea, #764ba2)'
                    : 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {toolTypes.map(type => {
                const typeColors: Record<string, string> = {
                  NATIVE: '#9ca3af',
                  REST: '#10b981',
                  MCP: '#3b82f6',
                  GQL: '#ec4899',
                  A2A: '#fbbf24',
                };
                const isActive = selectedType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '16px',
                      border: 'none',
                      background: isActive
                        ? `${typeColors[type]}33`
                        : 'rgba(255,255,255,0.08)',
                      color: isActive ? typeColors[type] : 'rgba(255,255,255,0.7)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={selectAll}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Select All Visible
          </button>
          <button
            onClick={deselectAll}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Deselect All Visible
          </button>
          {selectedTools.length > 0 && (
            <button
              onClick={() => setSelectedTools([])}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ✕ Clear All ({selectedTools.length})
            </button>
          )}
        </div>

        {/* Results Count */}
        <p style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.85rem',
          marginBottom: '1rem',
        }}>
          Showing {filteredTools.length} of {tools.length} tools
        </p>

        {/* Tools Grid - Grouped by Type */}
        {(() => {
          // Group tools by type
          const groupedTools: Record<string, typeof filteredTools> = {};
          filteredTools.forEach(tool => {
            const type = tool.toolType || 'NATIVE';
            if (!groupedTools[type]) groupedTools[type] = [];
            groupedTools[type].push(tool);
          });

          // Type display config
          const typeConfig: Record<string, { label: string; icon: string; color: string }> = {
            NATIVE: { label: 'Native Tools', icon: '⚡', color: '#9ca3af' },
            REST: { label: 'REST API Tools', icon: '☁️', color: '#10b981' },
            MCP: { label: 'MCP Tools', icon: '🔌', color: '#3b82f6' },
            GQL: { label: 'GraphQL Tools', icon: '◈', color: '#ec4899' },
            A2A: { label: 'Agent-to-Agent Tools', icon: '🤖', color: '#fbbf24' },
          };

          const typeOrder = ['NATIVE', 'REST', 'MCP', 'GQL', 'A2A'];
          const activeTypes = typeOrder.filter(t => groupedTools[t]?.length > 0);

          return activeTypes.map((type, typeIndex) => {
            const config = typeConfig[type] || { label: type, icon: '📦', color: '#9ca3af' };
            const toolsInGroup = groupedTools[type];

            return (
              <div key={type} style={{ marginBottom: typeIndex < activeTypes.length - 1 ? '2rem' : '0' }}>
                {/* Type Separator Header */}
                {activeTypes.length > 1 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                    paddingBottom: '0.5rem',
                    borderBottom: `1px solid ${config.color}33`,
                  }}>
                    <span style={{ fontSize: '1.25rem' }}>{config.icon}</span>
                    <h3 style={{
                      color: config.color,
                      fontSize: '1rem',
                      fontWeight: 700,
                      margin: 0,
                    }}>
                      {config.label}
                    </h3>
                    <span style={{
                      padding: '0.15rem 0.5rem',
                      borderRadius: '10px',
                      background: `${config.color}22`,
                      color: config.color,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}>
                      {toolsInGroup.length}
                    </span>
                  </div>
                )}

                {/* Tools Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '1rem',
                }}>
                  {toolsInGroup.map(tool => {
            const isSelected = selectedTools.includes(tool.name);
            return (
              <button
                key={tool.name}
                onClick={() => toggleTool(tool.name)}
                style={{
                  background: isSelected
                    ? 'rgba(102, 126, 234, 0.2)'
                    : 'rgba(255,255,255,0.05)',
                  border: isSelected
                    ? '2px solid rgba(102, 126, 234, 0.5)'
                    : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  padding: '1rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}>
                  <h3 style={{
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    margin: 0,
                  }}>
                    {formatToolName(tool.name)}
                  </h3>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    border: isSelected
                      ? '2px solid #667eea'
                      : '2px solid rgba(255,255,255,0.3)',
                    background: isSelected ? '#667eea' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>
                <p style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '0.8rem',
                  margin: '0 0 0.5rem',
                  lineHeight: 1.4,
                }}>
                  {tool.description}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                  {/* Category Badge */}
                  <span style={{
                    fontSize: '0.7rem',
                    background: 'rgba(167, 139, 250, 0.2)',
                    color: '#a78bfa',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '6px',
                  }}>
                    {categoryIcons[tool.category] || '📦'} {tool.category}
                  </span>
                  {/* Type Badge */}
                  <span style={{
                    fontSize: '0.65rem',
                    background: tool.toolType === 'REST' ? 'rgba(16, 185, 129, 0.2)' :
                               tool.toolType === 'MCP' ? 'rgba(59, 130, 246, 0.2)' :
                               tool.toolType === 'GQL' ? 'rgba(236, 72, 153, 0.2)' :
                               tool.toolType === 'A2A' ? 'rgba(251, 191, 36, 0.2)' :
                               'rgba(156, 163, 175, 0.2)',
                    color: tool.toolType === 'REST' ? '#10b981' :
                           tool.toolType === 'MCP' ? '#3b82f6' :
                           tool.toolType === 'GQL' ? '#ec4899' :
                           tool.toolType === 'A2A' ? '#fbbf24' :
                           '#9ca3af',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '4px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                    {tool.toolType || 'NATIVE'}
                  </span>
                  {/* Widget Badge */}
                  {tool.hasWidget && (
                    <span style={{
                      fontSize: '0.65rem',
                      background: 'rgba(139, 92, 246, 0.2)',
                      color: '#8b5cf6',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}>
                      🎨 Widget
                    </span>
                  )}
                  {/* Docs Button */}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingToolDocs(tool);
                    }}
                    style={{
                      fontSize: '0.65rem',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#10b981',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title="View tool definition"
                  >
                    📖 Docs
                  </span>
                </div>
              </button>
            );
          })}
                </div>
              </div>
            );
          });
        })()}

        {filteredTools.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: 'rgba(255,255,255,0.5)',
          }}>
            <p style={{ fontSize: '1.1rem', margin: 0 }}>No tools found matching your criteria.</p>
          </div>
        )}

        {/* Import Your APIs Section */}
        <div style={{
          marginTop: '2rem',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08))',
          border: '1px solid rgba(102, 126, 234, 0.2)',
          borderRadius: '16px',
          padding: 'clamp(1rem, 3vw, 1.5rem)',
        }}>
          <h2 style={{
            color: '#fff',
            fontSize: 'clamp(1.1rem, 3vw, 1.25rem)',
            fontWeight: 700,
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            📥 Import Your APIs
          </h2>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 'clamp(0.85rem, 2vw, 0.95rem)',
            lineHeight: 1.6,
            margin: '0 0 1rem',
          }}>
            Turn your existing APIs into AI-ready MCP tools. Import specifications and your AI assistant will be able to call these endpoints directly.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem',
          }}>
            <Link href="/dashboard/swagger-import" style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>☁️</span>
                  <span style={{ color: '#10b981', fontWeight: 700, fontSize: 'clamp(0.9rem, 2vw, 1rem)' }}>OpenAPI / Swagger</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(0.75rem, 1.8vw, 0.85rem)', margin: 0, lineHeight: 1.5 }}>
                  Import REST APIs from OpenAPI 3.0 or Swagger 2.0 specs. Paste JSON/YAML or fetch from URL.
                </p>
              </div>
            </Link>
            <Link href="/dashboard/graphql-import" style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'rgba(102, 126, 234, 0.1)',
                border: '1px solid rgba(102, 126, 234, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(102, 126, 234, 0.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>◈</span>
                  <span style={{ color: '#667eea', fontWeight: 700, fontSize: 'clamp(0.9rem, 2vw, 1rem)' }}>GraphQL</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(0.75rem, 1.8vw, 0.85rem)', margin: 0, lineHeight: 1.5 }}>
                  Connect to any GraphQL endpoint. Auto-discover queries and mutations via introspection.
                </p>
              </div>
            </Link>
            <Link href="/dashboard/mcp-import" style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'rgba(251, 146, 60, 0.1)',
                border: '1px solid rgba(251, 146, 60, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(251, 146, 60, 0.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(251, 146, 60, 0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🔌</span>
                  <span style={{ color: '#fb923c', fontWeight: 700, fontSize: 'clamp(0.9rem, 2vw, 1rem)' }}>MCP Server</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(0.75rem, 1.8vw, 0.85rem)', margin: 0, lineHeight: 1.5 }}>
                  Connect to an external MCP server and import its tools directly into your composition.
                </p>
              </div>
            </Link>
            <Link href="/dashboard/agent-import" style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.15)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245, 158, 11, 0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🤖</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 'clamp(0.9rem, 2vw, 1rem)' }}>A2A Agent</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(0.75rem, 1.8vw, 0.85rem)', margin: 0, lineHeight: 1.5 }}>
                  Connect to A2A protocol agents. Your AI can communicate with other AI agents.
                </p>
              </div>
            </Link>
          </div>
        </div>

        {/* REST API Tools Section - Imported Swagger/OpenAPI */}
        <div style={{ marginTop: '2rem' }}>
          <RestApiToolsSection
            selectedTools={selectedTools}
            onToolSelect={(toolName, selected) => {
              if (selected) {
                setSelectedTools(prev => [...prev, toolName]);
              } else {
                setSelectedTools(prev => prev.filter(t => t !== toolName));
              }
            }}
            onDataChange={refreshTools}
          />
        </div>

        {/* GraphQL Tools Section */}
        <div style={{ marginTop: '2rem' }}>
          <GraphQLToolsSection
            selectedTools={selectedTools}
            onToolSelect={(toolName, selected) => {
              if (selected) {
                setSelectedTools(prev => [...prev, toolName]);
              } else {
                setSelectedTools(prev => prev.filter(t => t !== toolName));
              }
            }}
            onDataChange={refreshTools}
            onHasTools={setHasGraphQLTools}
          />
        </div>

        {/* MCP Tools Section */}
        <div style={{ marginTop: '2rem' }}>
          <MCPToolsSection
            selectedTools={selectedTools}
            onToolSelect={(toolName, selected) => {
              if (selected) {
                setSelectedTools(prev => [...prev, toolName]);
              } else {
                setSelectedTools(prev => prev.filter(t => t !== toolName));
              }
            }}
            onDataChange={refreshTools}
          />
        </div>

        {/* A2A Agents Section */}
        <div style={{ marginTop: '2rem' }}>
          <AgentToolsSection
            selectedTools={selectedTools}
            onToolSelect={(toolName, selected) => {
              if (selected) {
                setSelectedTools(prev => [...prev, toolName]);
              } else {
                setSelectedTools(prev => prev.filter(t => t !== toolName));
              }
            }}
            onDataChange={refreshTools}
          />
        </div>

        {/* Bottom Ad */}
        <div style={{ marginTop: '2rem' }}>
          <AdBanner slot={ADS_CONFIG.slots.mcpComposerBottom} format="horizontal" />
        </div>
      </main>

      <Footer />

      {/* Save Modal */}
      <SaveModal
        type={showModal}
        toolCount={selectedTools.length}
        isEditMode={isEditMode}
        isDefaultServer={isDefaultServer}
        onConfirm={() => {
          if (showModal === 'success') {
            confirmSave();
          } else {
            // For warning/danger, show success after confirmation
            setShowModal('success');
          }
        }}
        onCancel={() => setShowModal(null)}
      />

      {/* Tool Docs Modal */}
      {viewingToolDocs && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setViewingToolDocs(null)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30,30,40,0.98), rgba(20,20,30,0.98))',
              border: '1px solid rgba(102, 126, 234, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>{viewingToolDocs.name}</h3>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background: 'rgba(167, 139, 250, 0.2)',
                    color: '#a78bfa',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}>
                    {viewingToolDocs.category}
                  </span>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background: viewingToolDocs.toolType === 'REST' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                    color: viewingToolDocs.toolType === 'REST' ? '#10b981' : '#3b82f6',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}>
                    {viewingToolDocs.toolType || 'NATIVE'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setViewingToolDocs(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem',
                }}
              >
                ×
              </button>
            </div>

            {viewingToolDocs.description && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                  Description
                </div>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
                  {viewingToolDocs.description}
                </p>
              </div>
            )}

            {/* Input Schema */}
            {viewingToolDocs.inputSchema && Object.keys(viewingToolDocs.inputSchema).length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Input Schema
                </div>
                <pre style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  margin: 0,
                  fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.8)',
                  overflow: 'auto',
                  maxHeight: '200px',
                }}>
                  {JSON.stringify(viewingToolDocs.inputSchema, null, 2)}
                </pre>
              </div>
            )}

            {/* Output Schema */}
            {viewingToolDocs.outputSchema && Object.keys(viewingToolDocs.outputSchema).length > 0 && (
              <div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Output Schema
                </div>
                <pre style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  margin: 0,
                  fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.8)',
                  overflow: 'auto',
                  maxHeight: '200px',
                }}>
                  {JSON.stringify(viewingToolDocs.outputSchema, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
