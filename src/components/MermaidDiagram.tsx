'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  definition: string;
  title?: string;
  onNodeClick?: (nodeId: string) => void;
  onDefinitionChange?: (newDefinition: string) => void;
  editable?: boolean;
  minHeight?: string;
  maxHeight?: string;
}

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#8b5cf6',
    primaryTextColor: '#fff',
    primaryBorderColor: '#6366f1',
    lineColor: '#a78bfa',
    secondaryColor: '#1e1b4b',
    tertiaryColor: '#312e81',
    background: '#0f0f23',
    mainBkg: '#1e1b4b',
    nodeBorder: '#6366f1',
    clusterBkg: 'rgba(139, 92, 246, 0.1)',
    clusterBorder: 'rgba(139, 92, 246, 0.3)',
    titleColor: '#fff',
    edgeLabelBackground: '#1e1b4b',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    padding: 15,
  },
  securityLevel: 'loose',
});

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  definition,
  title,
  onNodeClick,
  onDefinitionChange,
  editable = false,
  minHeight = '300px',
  maxHeight = '500px',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState<'diagram' | 'markdown'>('diagram');
  const [editedDefinition, setEditedDefinition] = useState(definition);

  // Sync edited definition when definition prop changes
  useEffect(() => {
    setEditedDefinition(definition);
  }, [definition]);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!definition.trim()) {
        setSvgContent('');
        return;
      }

      try {
        setError(null);
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, definition);
        setSvgContent(svg);
      } catch (err) {
        console.error('Mermaid render error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      }
    };

    renderDiagram();
  }, [definition]);

  // Handle zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.25, Math.min(3, prev + delta)));
  };

  // Handle pan
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Reset view
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Copy diagram definition
  const copyDefinition = () => {
    navigator.clipboard.writeText(definition);
  };

  if (error) {
    return (
      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '1rem' }}>
        <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.5rem' }}>⚠️ Diagram Error</div>
        <pre style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', whiteSpace: 'pre-wrap', margin: 0 }}>{error}</pre>
      </div>
    );
  }

  // Apply markdown changes when switching back to diagram view
  const applyMarkdownChanges = () => {
    if (editedDefinition !== definition && onDefinitionChange) {
      onDefinitionChange(editedDefinition);
    }
    setViewMode('diagram');
  };

  return (
    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{title || 'Flow Diagram'}</span>
          {/* View Mode Toggle */}
          {editable && (
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', padding: '2px' }}>
              <button
                onClick={() => viewMode === 'markdown' ? applyMarkdownChanges() : setViewMode('diagram')}
                style={{
                  background: viewMode === 'diagram' ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.25rem 0.5rem',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: viewMode === 'diagram' ? 600 : 400,
                }}
              >
                📊 View
              </button>
              <button
                onClick={() => setViewMode('markdown')}
                style={{
                  background: viewMode === 'markdown' ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.25rem 0.5rem',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: viewMode === 'markdown' ? 600 : 400,
                }}
              >
                ✏️ Edit
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {viewMode === 'diagram' && (
            <>
              <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>+</button>
              <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>−</button>
              <button onClick={resetView} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>⟲</button>
            </>
          )}
          <button onClick={copyDefinition} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>📋</button>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'diagram' ? (
        <>
          {/* Diagram Area */}
          <div
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ minHeight, maxHeight, overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', flex: 1 }}
          >
            {svgContent ? (
              <div
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center', transition: isDragging ? 'none' : 'transform 0.1s ease' }}
                dangerouslySetInnerHTML={{ __html: svgContent }}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const nodeId = target.closest('[id^="flowchart-"]')?.id?.replace('flowchart-', '').split('-')[0];
                  if (nodeId && onNodeClick) onNodeClick(nodeId);
                }}
              />
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>No diagram to display</div>
            )}
          </div>

          {/* Zoom indicator */}
          <div style={{ padding: '0.25rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textAlign: 'right', flexShrink: 0 }}>
            {Math.round(zoom * 100)}% • Scroll to zoom, drag to pan
          </div>
        </>
      ) : (
        <>
          {/* Markdown Editor */}
          <textarea
            value={editedDefinition}
            onChange={(e) => setEditedDefinition(e.target.value)}
            style={{
              flex: 1,
              minHeight,
              maxHeight,
              padding: '1rem',
              background: 'rgba(0,0,0,0.2)',
              border: 'none',
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              lineHeight: 1.6,
              resize: 'none',
              outline: 'none',
            }}
            placeholder="Enter Mermaid diagram definition..."
          />
          {/* Editor footer */}
          <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
              Edit the Mermaid syntax directly
            </span>
            <button
              onClick={applyMarkdownChanges}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: '6px',
                padding: '0.35rem 0.75rem',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 500,
              }}
            >
              ✓ Apply Changes
            </button>
          </div>
        </>
      )}
    </div>
  );
};

