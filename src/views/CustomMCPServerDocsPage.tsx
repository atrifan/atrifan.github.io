'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { UpgradeModal } from '../components/UpgradeModal';
import { BackToTools } from '../components/BackToTools';
import { FaviconImage } from '../components/FaviconImage';
import { ADS_CONFIG } from '../config/ads.config';
import { isMcpComposerEnabled, getToolCountSeverity, getToolCountColor } from '../config/mcp-composer.config';
import type { MCPTool } from '../types/mcp-composer';

// Server data from API
interface ServerFromApi {
  id: string;
  name: string;
  serverName: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  tools: {
    id: string;
    toolId: string;
    name: string;
    description: string;
    category: string;
    isEnabled: boolean;
  }[];
}
import { ToolCountBadge } from './MCPComposerPage';

interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
  minimum?: number;
  maximum?: number;
}

interface ToolSchema {
  type: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

interface ToolWithSchema extends MCPTool {
  inputSchema: ToolSchema;
  outputSchema: ToolSchema;
}

interface ToolsResponse {
  tools: ToolWithSchema[];
  totalCount: number;
  categories: string[];
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

// Tool type colors (consistent with MCP Composer)
const TOOL_TYPE_COLORS: Record<string, string> = {
  NATIVE: '#9ca3af',
  REST: '#10b981',
  MCP: '#3b82f6',
  GQL: '#ec4899',
  A2A: '#fbbf24',
};

interface CustomMCPServerDocsPageProps {
  serverId: string;
  isPro: boolean;
  isPlus: boolean;
}

export const CustomMCPServerDocsPage: React.FC<CustomMCPServerDocsPageProps> = ({ serverId, isPro, isPlus }) => {
  const router = useRouter();
  const canAccessPro = isPro || isPlus;
  const [server, setServer] = useState<ServerFromApi | null>(null);
  const [allTools, setAllTools] = useState<ToolWithSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Check if feature is enabled and load server from API
  useEffect(() => {
    if (!canAccessPro) return;

    if (!isMcpComposerEnabled()) {
      router.push('/dashboard');
      return;
    }

    const fetchServer = async () => {
      try {
        const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}`);
        if (response.ok) {
          const data = await response.json();
          setServer(data.server);
        } else {
          router.push('/dashboard');
        }
      } catch {
        router.push('/dashboard');
      }
    };

    fetchServer();
  }, [serverId, router, canAccessPro]);

  // Show upgrade modal for non-Pro users
  if (!canAccessPro) {
    return (
      <div style={{ minHeight: '100vh', padding: 'clamp(1rem, 4vw, 2rem)', background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <UpgradeModal
          isOpen={true}
          title="MCP Server Docs - Pro Feature"
          featureName="Custom MCP server documentation"
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
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              MCP SERVER DOCS
            </h1>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Fetch all tools
  useEffect(() => {
    fetch('/api/tools')
      .then(res => res.json())
      .then((data: ToolsResponse) => {
        setAllTools(data.tools);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Filter tools to only those enabled in this server
  const enabledToolNames = server?.tools.filter(t => t.isEnabled).map(t => t.name) || [];
  const serverTools = allTools.filter(tool => enabledToolNames.includes(tool.name));

  // Get unique tool types from server tools
  const toolTypes = ['NATIVE', 'REST', 'MCP', 'GQL', 'A2A'].filter(type =>
    serverTools.some(t => (t.toolType || 'NATIVE') === type)
  );

  // Apply search and type filters
  const filteredTools = serverTools.filter(tool => {
    const matchesType = selectedType === 'all' || (tool.toolType || 'NATIVE') === selectedType;
    const matchesSearch = searchQuery === '' ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const formatToolName = (name: string) => {
    return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const renderSchemaProperty = (key: string, prop: SchemaProperty, isRequired: boolean) => (
    <div key={key} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
      padding: '0.5rem 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <code style={{
          color: '#a78bfa',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          fontWeight: 600,
        }}>{key}</code>
        <span style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.75rem',
          background: 'rgba(255,255,255,0.1)',
          padding: '0.15rem 0.5rem',
          borderRadius: '4px',
        }}>
          {prop.type}
          {prop.enum && `: ${prop.enum.slice(0, 3).join(' | ')}${prop.enum.length > 3 ? '...' : ''}`}
        </span>
        {isRequired && (
          <span style={{
            fontSize: '0.7rem',
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            padding: '0.15rem 0.4rem',
            borderRadius: '4px',
            fontWeight: 600,
          }}>required</span>
        )}
      </div>
      {prop.description && (
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', margin: 0 }}>
          {prop.description}
        </p>
      )}
    </div>
  );

  const renderSchema = (schema: ToolSchema, title: string, color: string) => {
    const hasProps = schema.properties && Object.keys(schema.properties).length > 0;
    return (
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '12px',
        padding: '1rem',
        flex: 1,
        minWidth: '280px',
      }}>
        <h4 style={{ color, fontSize: '0.85rem', fontWeight: 700, margin: '0 0 0.75rem', textTransform: 'uppercase' }}>{title}</h4>
        {hasProps ? (
          <div>
            {Object.entries(schema.properties!).map(([key, prop]) =>
              renderSchemaProperty(key, prop, schema.required?.includes(key) || false)
            )}
          </div>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>No parameters</p>
        )}
      </div>
    );
  };

  if (loading || !server) {
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

  const severity = getToolCountSeverity(server.tools.length);
  const severityColor = getToolCountColor(severity);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <h1 style={{
              color: '#fff',
              fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              🔧 {server.name}
            </h1>
            <ToolCountBadge count={server.tools.length} />
          </div>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)',
            margin: 0,
            lineHeight: 1.6,
          }}>
            Custom MCP server with {serverTools.length} selected tools.
          </p>
        </div>

        {/* Top Ad - after title */}
        <div style={{ marginBottom: '1.5rem' }}>
          <AdBanner slot={ADS_CONFIG.slots.docsHeader} format="horizontal" />
        </div>

        {/* Warning Banner if too many tools */}
        {severity !== 'optimal' && (
          <div style={{
            background: `${severityColor}22`,
            border: `1px solid ${severityColor}44`,
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}>
            <span style={{ fontSize: '1.25rem' }}>{severity === 'warning' ? '⚠️' : '🚨'}</span>
            <div>
              <h3 style={{ color: severityColor, fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.25rem' }}>
                {severity === 'warning' ? 'Many Tools Selected' : 'Too Many Tools'}
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: 0 }}>
                {severity === 'warning'
                  ? 'Having more than 10 tools may cause AI assistants to have difficulty choosing the right tool.'
                  : 'Having more than 20 tools significantly increases the chance of tool collisions. Consider splitting into multiple servers.'}
              </p>
            </div>
          </div>
        )}

        {/* Search & Filter */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}>
          {/* Search */}
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

          {/* Type Filter Pills */}
          {toolTypes.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginRight: '0.25rem' }}>Type:</span>
              <button
                onClick={() => setSelectedType('all')}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '16px',
                  border: 'none',
                  background: selectedType === 'all'
                    ? 'linear-gradient(135deg, #667eea, #764ba2)'
                    : 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {toolTypes.map(type => {
                const color = TOOL_TYPE_COLORS[type] || '#9ca3af';
                const isActive = selectedType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '16px',
                      border: 'none',
                      background: isActive
                        ? `${color}33`
                        : 'rgba(255,255,255,0.08)',
                      color: isActive ? color : 'rgba(255,255,255,0.7)',
                      fontSize: '0.8rem',
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

        {/* Results Count */}
        <p style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.85rem',
          marginBottom: '1rem',
        }}>
          Showing {filteredTools.length} of {serverTools.length} tools
        </p>

        {/* Tools List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredTools.map(tool => (
            <div
              key={tool.name}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                overflow: 'hidden',
              }}
            >
              {/* Tool Header */}
              <button
                onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                style={{
                  width: '100%',
                  padding: 'clamp(1rem, 3vw, 1.25rem)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {/* Tool Icon */}
                {tool.sourceUrl && (
                  <FaviconImage
                    iconUrl={tool.iconUrl}
                    baseUrl={tool.sourceUrl}
                    alt={tool.name}
                    size={28}
                    borderRadius={6}
                    fallbackEmoji={
                      tool.toolType === 'REST' ? '☁️' :
                      tool.toolType === 'MCP' ? '🔌' :
                      tool.toolType === 'GQL' ? '◈' :
                      tool.toolType === 'A2A' ? '🤖' : '📦'
                    }
                    fallbackBgColor={
                      tool.toolType === 'REST' ? 'rgba(16, 185, 129, 0.2)' :
                      tool.toolType === 'MCP' ? 'rgba(59, 130, 246, 0.2)' :
                      tool.toolType === 'GQL' ? 'rgba(236, 72, 153, 0.2)' :
                      tool.toolType === 'A2A' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(156, 163, 175, 0.2)'
                    }
                    style={{ flexShrink: 0, alignSelf: 'flex-start', marginTop: '0.1rem' }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <h3 style={{ color: '#fff', fontSize: 'clamp(1rem, 2.5vw, 1.15rem)', fontWeight: 700, margin: 0 }}>
                      {formatToolName(tool.name)}
                    </h3>
                    {tool.hasWidget && (
                      <span style={{
                        fontSize: '0.7rem',
                        background: 'rgba(16, 185, 129, 0.2)',
                        color: '#34d399',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '6px',
                        fontWeight: 600,
                      }}>✨ Widget</span>
                    )}
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(0.85rem, 2vw, 0.95rem)', margin: 0, lineHeight: 1.5 }}>
                    {tool.description}
                  </p>
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      background: 'rgba(167, 139, 250, 0.2)',
                      color: '#a78bfa',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '6px',
                    }}>
                      {categoryIcons[tool.category] || '📦'} {tool.category}
                    </span>
                    {(() => {
                      const type = tool.toolType || 'NATIVE';
                      const color = TOOL_TYPE_COLORS[type] || '#9ca3af';
                      return (
                        <span style={{
                          fontSize: '0.75rem',
                          background: `${color}22`,
                          color: color,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '6px',
                        }}>
                          {type}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="2"
                  style={{
                    flexShrink: 0,
                    transform: expandedTool === tool.name ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {/* Expanded Content */}
              {expandedTool === tool.name && (
                <div style={{
                  padding: 'clamp(1rem, 3vw, 1.5rem)',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(0,0,0,0.2)',
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                    {renderSchema(tool.inputSchema, 'Input', '#60a5fa')}
                    {renderSchema(tool.outputSchema, 'Output', '#34d399')}
                  </div>
                  <div style={{ paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginRight: '0.5rem' }}>API Name:</span>
                    <code style={{
                      background: 'rgba(167, 139, 250, 0.2)',
                      color: '#a78bfa',
                      padding: '0.3rem 0.75rem',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                    }}>
                      {tool.name}
                    </code>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {serverTools.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'rgba(255,255,255,0.5)' }}>
            <p style={{ fontSize: '1.1rem', margin: 0 }}>No tools found in this server.</p>
          </div>
        )}

        {/* Bottom Ad */}
        <div style={{ marginTop: '2rem' }}>
          <AdBanner slot={ADS_CONFIG.slots.docsFooter} format="horizontal" />
        </div>
      </main>

      <Footer />
    </div>
  );
};
