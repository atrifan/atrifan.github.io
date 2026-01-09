'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  definition: string;
  title?: string;
  onNodeClick?: (nodeId: string) => void;
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

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ definition, title, onNodeClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

  return (
    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
        <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 500 }}>{title || 'Flow Diagram'}</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>+</button>
          <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>−</button>
          <button onClick={resetView} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>⟲</button>
          <button onClick={copyDefinition} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>📋</button>
        </div>
      </div>

      {/* Diagram Area */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ minHeight: '300px', maxHeight: '500px', overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
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
      <div style={{ padding: '0.25rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
        {Math.round(zoom * 100)}% • Scroll to zoom, drag to pan
      </div>
    </div>
  );
};

