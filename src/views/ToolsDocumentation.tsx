'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { AdBanner } from '../components/AdBanner';
import { ADS_CONFIG } from '../config/ads.config';

interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
  minimum?: number;
  maximum?: number;
  minItems?: number;
}

interface ToolSchema {
  type: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

interface Tool {
  name: string;
  description: string;
  category: string;
  hasWidget: boolean;
  inputSchema: ToolSchema;
  outputSchema: ToolSchema;
}

interface ToolsResponse {
  tools: Tool[];
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

export default function ToolsDocumentation() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetch('/api/tools')
      .then(res => res.json())
      .then((data: ToolsResponse) => {
        setTools(data.tools);
        setCategories(data.categories);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredTools = tools.filter(tool => {
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSearch = searchQuery === '' ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
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
        <h4 style={{
          color,
          fontSize: '0.85rem',
          fontWeight: 700,
          margin: '0 0 0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>{title}</h4>
        {hasProps ? (
          <div>
            {Object.entries(schema.properties!).map(([key, prop]) =>
              renderSchemaProperty(key, prop, schema.required?.includes(key) || false)
            )}
          </div>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
            No parameters
          </p>
        )}
      </div>
    );
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
      <Header />

      <main style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: 'clamp(1rem, 4vw, 2rem)',
      }}>
        {/* Header Ad */}
        <div style={{ marginBottom: '1.5rem' }}>
          <AdBanner slot={ADS_CONFIG.slots.docsHeader} format="horizontal" />
        </div>

        {/* Back Link */}
        <Link href="/dashboard" style={{
          color: '#a78bfa',
          fontSize: '0.9rem',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem',
        }}>
          ← Back to Dashboard
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
            🛠️ MCP Tools Documentation
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)',
            margin: 0,
            lineHeight: 1.6,
          }}>
            Complete reference for all {tools.length} available tools. Use these with ChatGPT, Claude, Cursor, and other AI assistants.
          </p>
        </div>

        {/* Search & Filter */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}>
          {/* Search */}
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
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}>
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

        {/* Results Count */}
        <p style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '0.85rem',
          marginBottom: '1rem',
        }}>
          Showing {filteredTools.length} of {tools.length} tools
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginBottom: '0.5rem',
                  }}>
                    <h3 style={{
                      color: '#fff',
                      fontSize: 'clamp(1rem, 2.5vw, 1.15rem)',
                      fontWeight: 700,
                      margin: 0,
                    }}>
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
                  <p style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 'clamp(0.85rem, 2vw, 0.95rem)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}>
                    {tool.description}
                  </p>
                  <div style={{ marginTop: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      background: 'rgba(167, 139, 250, 0.2)',
                      color: '#a78bfa',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '6px',
                    }}>
                      {categoryIcons[tool.category] || '📦'} {tool.category}
                    </span>
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
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '1rem',
                  }}>
                    {renderSchema(tool.inputSchema, 'Input', '#60a5fa')}
                    {renderSchema(tool.outputSchema, 'Output', '#34d399')}
                  </div>

                  {/* API Tool Name */}
                  <div style={{
                    paddingTop: '1rem',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    <span style={{
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: '0.8rem',
                      marginRight: '0.5rem',
                    }}>API Name:</span>
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

        {filteredTools.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: 'rgba(255,255,255,0.5)',
          }}>
            <p style={{ fontSize: '1.1rem', margin: 0 }}>No tools found matching your criteria.</p>
          </div>
        )}

        {/* Footer Ad */}
        <div style={{ marginTop: '2rem' }}>
          <AdBanner slot={ADS_CONFIG.slots.docsFooter} format="horizontal" />
        </div>
      </main>

      <Footer />
    </div>
  );
}

