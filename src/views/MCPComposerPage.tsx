'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { ADS_CONFIG } from '../config/ads.config';
import { isMcpComposerEnabled, getToolCountSeverity, getToolCountColor, MCP_COMPOSER_CONFIG } from '../config/mcp-composer.config';
import type { MCPTool, SaveModalType, CustomMCPServer, DefaultServerConfig } from '../types/mcp-composer';

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
        maxWidth: '500px',
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

export const MCPComposerPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editServerId = searchParams.get('edit');
  const isDefaultServer = editServerId === 'default';

  const [tools, setTools] = useState<MCPTool[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverName, setServerName] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showModal, setShowModal] = useState<SaveModalType>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [allToolNames, setAllToolNames] = useState<string[]>([]);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Check if feature is enabled
  useEffect(() => {
    if (!isMcpComposerEnabled()) {
      router.push('/dashboard');
    }
  }, [router]);

  // Fetch tools first, then load server data
  useEffect(() => {
    fetch('/api/tools')
      .then(res => res.json())
      .then((data: ToolsResponse) => {
        setTools(data.tools);
        setCategories(data.categories);
        const toolNames = data.tools.map((t: MCPTool) => t.name);
        setAllToolNames(toolNames);

        // Now load server data based on edit mode
        if (editServerId) {
          if (isDefaultServer) {
            // Editing default server - load disabled tools config
            try {
              const defaultConfig = localStorage.getItem('defaultServerConfig');
              if (defaultConfig) {
                const config: DefaultServerConfig = JSON.parse(defaultConfig);
                // Selected tools = all tools minus disabled tools
                const disabledSet = new Set(config.disabledTools);
                setSelectedTools(toolNames.filter((name: string) => !disabledSet.has(name)));
              } else {
                // No config yet, all tools are enabled
                setSelectedTools(toolNames);
              }
            } catch (error) {
              console.error('Failed to load default server config:', error);
              setSelectedTools(toolNames);
            }
            setServerName('Default Server');
            setIsEditMode(true);
          } else {
            // Editing custom server
            try {
              const stored = localStorage.getItem('customMcpServers');
              if (stored) {
                const servers: CustomMCPServer[] = JSON.parse(stored);
                const serverToEdit = servers.find(s => s.id === editServerId);
                if (serverToEdit) {
                  setServerName(serverToEdit.name);
                  setSelectedTools(serverToEdit.tools);
                  setIsEditMode(true);
                }
              }
            } catch (error) {
              console.error('Failed to load server for editing:', error);
            }
          }
        }

        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [editServerId, isDefaultServer]);

  const filteredTools = tools.filter(tool => {
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSearch = searchQuery === '' ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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

  const confirmSave = () => {
    if (isDefaultServer) {
      // Save default server config - store disabled tools
      const selectedSet = new Set(selectedTools);
      const disabledTools = allToolNames.filter(name => !selectedSet.has(name));

      const config: DefaultServerConfig = {
        disabledTools,
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem('defaultServerConfig', JSON.stringify(config));
      router.push('/dashboard');
      return;
    }

    // For custom servers, store in localStorage (later will be API)
    const customServers: CustomMCPServer[] = JSON.parse(
      localStorage.getItem('customMcpServers') || '[]'
    );

    if (isEditMode && editServerId) {
      // Update existing server
      const serverIndex = customServers.findIndex(s => s.id === editServerId);
      if (serverIndex !== -1) {
        customServers[serverIndex] = {
          ...customServers[serverIndex],
          name: serverName.trim(),
          tools: selectedTools,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      // Create new server
      const newServer: CustomMCPServer = {
        id: `mcp_${Date.now()}`,
        name: serverName.trim(),
        tools: selectedTools,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      customServers.push(newServer);
    }

    localStorage.setItem('customMcpServers', JSON.stringify(customServers));
    router.push('/dashboard');
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
      <Header />

      <main style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: 'clamp(1rem, 4vw, 2rem)',
      }}>
        {/* Top Ad */}
        <div style={{ marginBottom: '1.5rem' }}>
          <AdBanner slot={ADS_CONFIG.slots.mcpComposerTop} format="horizontal" />
        </div>

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
                : 'Compose a focused MCP server with only the tools you need. Fewer tools means better AI performance and fewer collisions.'}
          </p>
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

        {/* Server Name Input - hidden for default server */}
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
          <input
            type="text"
            placeholder="🔍 Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.875rem 1rem',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: '1rem',
              outline: 'none',
            }}
          />

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
        </div>

        {/* Bulk Actions */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
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
        </div>

        {/* Results Count */}
        <p style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.85rem',
          marginBottom: '1rem',
        }}>
          Showing {filteredTools.length} of {tools.length} tools
        </p>
        {/* Tools Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          {filteredTools.map(tool => {
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
                <span style={{
                  fontSize: '0.7rem',
                  background: 'rgba(167, 139, 250, 0.2)',
                  color: '#a78bfa',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '6px',
                }}>
                  {categoryIcons[tool.category] || '📦'} {tool.category}
                </span>
              </button>
            );
          })}
        </div>

        {filteredTools.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: 'rgba(255,255,255,0.5)',
          }}>
            <p style={{ fontSize: '1.1rem', margin: 0 }}>No tools found matching your criteria.</p>
          </div>
        )}

        {/* Coming Soon Sections */}
        <div style={{ marginTop: '3rem' }}>
          <h2 style={{
            color: '#fff',
            fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
            fontWeight: 700,
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            🚀 Coming Soon
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}>
            {/* Swagger/OpenAPI */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: '16px',
              padding: '1.5rem',
              opacity: 0.7,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>📄</span>
                <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                  Tools from REST API
                </h3>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                Import your REST API endpoints as MCP tools using Swagger/OpenAPI 3.0 specification.
              </p>
              <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                background: 'rgba(251, 191, 36, 0.2)',
                color: '#fbbf24',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '12px',
              }}>
                Coming Soon
              </span>
            </div>

            {/* GraphQL */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: '16px',
              padding: '1.5rem',
              opacity: 0.7,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>◈</span>
                <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                  Tools from GraphQL
                </h3>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                Connect your GraphQL server and automatically generate MCP tools from your schema.
              </p>
              <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                background: 'rgba(251, 191, 36, 0.2)',
                color: '#fbbf24',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '12px',
              }}>
                Coming Soon
              </span>
            </div>

            {/* MCP Server */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: '16px',
              padding: '1.5rem',
              opacity: 0.7,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🔌</span>
                <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                  Tools from your MCP
                </h3>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                Connect an existing MCP server and import its tools into your custom composition.
              </p>
              <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                background: 'rgba(251, 191, 36, 0.2)',
                color: '#fbbf24',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '12px',
              }}>
                Coming Soon
              </span>
            </div>

            {/* Agent as Tool */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: '16px',
              padding: '1.5rem',
              opacity: 0.7,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🤖</span>
                <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                  Agent as a Tool
                </h3>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                Wrap an AI agent as a tool, enabling agent-to-agent communication and orchestration.
              </p>
              <span style={{
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                background: 'rgba(251, 191, 36, 0.2)',
                color: '#fbbf24',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '12px',
              }}>
                Coming Soon
              </span>
            </div>
          </div>
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
    </div>
  );
};
