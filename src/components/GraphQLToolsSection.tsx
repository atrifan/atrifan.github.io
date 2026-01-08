'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FaviconImage } from './FaviconImage';

interface GraphQLTool {
  id: string;
  name: string;
  description: string;
  has_widget: boolean;
}

interface GraphQLOperation {
  id: string;
  tool_id: string;
  operation_name: string;
  operation_type: string;
  description: string | null;
  tool?: GraphQLTool;
}

interface GraphQLEnvironment {
  id: string;
  name: string;
  host: string;
}

interface GraphQLSpec {
  id: string;
  server_name: string;
  api_title: string | null;
  api_description: string | null;
  source_url: string;
  created_at: string;
  updated_at: string;
  operation_count?: number;
  operations?: GraphQLOperation[];
  environments?: GraphQLEnvironment[];
}

interface GraphQLToolsSectionProps {
  onToolSelect?: (toolName: string, selected: boolean) => void;
  selectedTools?: string[];
  onDataChange?: () => void;
  onHasTools?: (hasTools: boolean) => void;
}

export function GraphQLToolsSection({ onToolSelect, selectedTools = [], onDataChange, onHasTools }: GraphQLToolsSectionProps) {
  const [specs, setSpecs] = useState<GraphQLSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null);

  useEffect(() => {
    fetchSpecs();
  }, []);

  // Report when we have tools
  useEffect(() => {
    if (onHasTools) {
      onHasTools(specs.length > 0);
    }
  }, [specs.length, onHasTools]);

  const fetchSpecs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/graphql/list');
      if (!response.ok) throw new Error('Failed to fetch GraphQL specs');
      const data = await response.json();
      setSpecs(data.specs || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleToolToggle = (toolName: string) => {
    if (onToolSelect) {
      onToolSelect(toolName, !selectedTools.includes(toolName));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
        Loading GraphQL APIs...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: '#ef4444' }}>
        {error}
      </div>
    );
  }

  if (specs.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08))',
        border: '1px solid rgba(102, 126, 234, 0.25)',
        borderRadius: '16px',
        padding: 'clamp(1.5rem, 4vw, 2rem)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>◈</div>
        <h3 style={{ color: '#fff', margin: '0 0 0.5rem' }}>No GraphQL APIs Imported</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 1rem' }}>
          Import a GraphQL schema to create tools from queries and mutations.
        </p>
        <Link
          href="/dashboard/graphql-import"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Import GraphQL Schema
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08), rgba(118, 75, 162, 0.08))',
      border: '1px solid rgba(102, 126, 234, 0.25)',
      borderRadius: '16px',
      padding: 'clamp(1rem, 3vw, 1.5rem)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ color: '#667eea', margin: 0, fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ◈ GraphQL Tools
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0.25rem 0 0', fontSize: 'clamp(0.8rem, 2vw, 0.85rem)' }}>
            Imported from GraphQL schemas
          </p>
        </div>
        <Link
          href="/dashboard/graphql-import"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            background: 'rgba(102, 126, 234, 0.2)',
            border: '1px solid rgba(102, 126, 234, 0.4)',
            color: '#667eea',
            fontWeight: 600,
            fontSize: '0.85rem',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>+</span> Import More
        </Link>
      </div>

      {/* Specs List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {specs.map(spec => (
          <div
            key={spec.id}
            style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(102, 126, 234, 0.2)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            {/* Spec Header */}
            <div
              style={{
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
              onClick={() => setExpandedSpec(expandedSpec === spec.id ? null : spec.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <FaviconImage
                  baseUrl={spec.source_url}
                  alt={spec.api_title || spec.server_name}
                  size={28}
                  borderRadius={6}
                  fallbackEmoji="◈"
                  fallbackBgColor="rgba(102, 126, 234, 0.2)"
                />
              <div>
                <div style={{ color: '#fff', fontWeight: 600 }}>{spec.api_title || spec.server_name}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                  {spec.operation_count || 0} operations • {spec.environments?.length || 0} env
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Link
                href={`/dashboard/graphql/${spec.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  background: 'rgba(102, 126, 234, 0.2)',
                  color: '#667eea',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                }}
              >
                Edit
              </Link>
              <span style={{ color: 'rgba(255,255,255,0.4)', transform: expandedSpec === spec.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </div>
          </div>

          {/* Expanded Operations */}
          {expandedSpec === spec.id && spec.operations && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '1rem', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                {spec.operations.map(op => {
                  const toolName = op.tool?.name || '';
                  const isSelected = selectedTools.includes(toolName);
                  return (
                    <div
                      key={op.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)',
                        border: isSelected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                        cursor: onToolSelect ? 'pointer' : 'default',
                      }}
                      onClick={() => toolName && handleToolToggle(toolName)}
                    >
                      {onToolSelect && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ cursor: 'pointer' }}
                        />
                      )}
                      <span
                        style={{
                          padding: '0.2rem 0.4rem',
                          borderRadius: '4px',
                          background: op.operation_type === 'query' ? 'rgba(102, 126, 234, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: op.operation_type === 'query' ? '#667eea' : '#f59e0b',
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {op.operation_type}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>{op.operation_name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {op.tool?.name || 'No tool'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        ))}
      </div>
    </div>
  );
}

