'use client';

import React, { useState, useRef, useEffect } from 'react';

// Types - exported for use in parent components
export interface Automation {
  id: string;
  name: string;
  display_name?: string;
  description?: string;
  category: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  schedule_type: string;
  cron_expression?: string;
  yaml_definition?: string;
  total_runs?: number;
  successful_runs?: number;
  created_at: string;
  updated_at: string;
}

export interface Execution {
  id: string;
  automation_id: string;
  status: 'pending' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled';
  trigger_type: string;
  current_step?: string;
  error?: string;
  started_at: string;
  completed_at?: string;
}

interface CategoryInfo {
  id: string;
  label: string;
  icon: string;
}

interface AutomationFinderProps {
  automations: Automation[];
  categories?: CategoryInfo[];
  onSelectAutomation: (automation: Automation) => void;
  onRunAutomation: (automation: Automation) => void;
  onEditAutomation: (automation: Automation) => void;
  onDeleteAutomation: (automation: Automation) => void;
  onViewExecution: (execution: Execution, automation: Automation) => void;
  onViewLogs: (execution: Execution) => void;
  onProvideInput: (execution: Execution) => void;
  onStopExecution: (execution: Execution) => void;
  onDeleteExecution: (execution: Execution) => void;
  selectedAutomationId?: string;
  onCreateNew?: () => void;
  onRefresh?: () => void;
}

// Status indicator colors
const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',      // gray
  active: '#10b981',     // green
  paused: '#f59e0b',     // amber
  archived: '#6b7280',   // gray
  pending: '#6b7280',    // gray
  running: '#3b82f6',    // blue (pulsing)
  waiting_input: '#f59e0b', // amber (pulsing)
  completed: '#10b981',  // green
  failed: '#ef4444',     // red
  cancelled: '#6b7280',  // gray
};

// Category folder colors
const CATEGORY_COLORS: Record<string, string> = {
  general: '#6b7280',
  marketing: '#ec4899',
  sales: '#10b981',
  support: '#8b5cf6',
  development: '#3b82f6',
  data: '#f59e0b',
  communication: '#06b6d4',
  productivity: '#ef4444',
};

// Default category options
const DEFAULT_CATEGORIES: CategoryInfo[] = [
  { id: 'general', label: 'General', icon: '📁' },
  { id: 'marketing', label: 'Marketing', icon: '📣' },
  { id: 'sales', label: 'Sales', icon: '💰' },
  { id: 'operations', label: 'Operations', icon: '⚙️' },
  { id: 'support', label: 'Support', icon: '🎧' },
  { id: 'development', label: 'Development', icon: '💻' },
  { id: 'data', label: 'Data', icon: '📊' },
  { id: 'communication', label: 'Communication', icon: '💬' },
];

export function AutomationFinder({
  automations,
  categories: categoryList,
  onSelectAutomation,
  onRunAutomation,
  onEditAutomation,
  onDeleteAutomation,
  onViewExecution,
  onViewLogs,
  onProvideInput,
  onStopExecution,
  onDeleteExecution,
  selectedAutomationId,
  onCreateNew,
  onRefresh,
}: AutomationFinderProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['my_automations']));
  const [expandedAutomations, setExpandedAutomations] = useState<Set<string>>(new Set());
  const [executions, setExecutions] = useState<Record<string, Execution[]>>({});
  const [loadingExecutions, setLoadingExecutions] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'folder' | 'automation' | 'execution'; item: unknown } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Merge provided categories with defaults
  const allCategories = categoryList || DEFAULT_CATEGORIES;

  // Helper to get category display name
  const getCategoryDisplay = (categoryId: string): { label: string; icon: string } => {
    const found = allCategories.find(c => c.id === categoryId);
    if (found) return { label: found.label, icon: found.icon };
    // Fallback: capitalize the ID
    return { label: categoryId.charAt(0).toUpperCase() + categoryId.slice(1).replace(/_/g, ' '), icon: '📁' };
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Group automations by category
  const groupedByCategory = automations.reduce((acc, auto) => {
    const cat = auto.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(auto);
    return acc;
  }, {} as Record<string, Automation[]>);

  // Filter automations by search
  const filteredCategories = searchQuery.trim()
    ? Object.entries(groupedByCategory).reduce((acc, [cat, autos]) => {
        const filtered = autos.filter(a =>
          (a.display_name || a.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.description?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (filtered.length > 0) acc[cat] = filtered;
        return acc;
      }, {} as Record<string, Automation[]>)
    : groupedByCategory;

  // Toggle folder expansion
  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Toggle automation expansion (show executions)
  const toggleAutomation = async (automationId: string) => {
    const isExpanding = !expandedAutomations.has(automationId);
    setExpandedAutomations(prev => {
      const next = new Set(prev);
      if (next.has(automationId)) next.delete(automationId);
      else next.add(automationId);
      return next;
    });
    if (isExpanding && !executions[automationId]) {
      await fetchExecutions(automationId);
    }
  };

  // Fetch executions for an automation
  const fetchExecutions = async (automationId: string) => {
    setLoadingExecutions(prev => new Set(prev).add(automationId));
    try {
      const res = await fetch(`/api/ai/automations/${automationId}/executions?limit=10`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(prev => ({ ...prev, [automationId]: data.executions || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch executions:', err);
    } finally {
      setLoadingExecutions(prev => {
        const next = new Set(prev);
        next.delete(automationId);
        return next;
      });
    }
  };

  // Context menu handler
  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'automation' | 'execution', item: unknown) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, item });
  };

  // Get status indicator style
  const getStatusIndicator = (status: string, isPulsing = false) => {
    const color = STATUS_COLORS[status] || '#6b7280';
    return {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: color,
      boxShadow: isPulsing ? `0 0 8px ${color}` : 'none',
      animation: isPulsing ? 'pulse 2s infinite' : 'none',
    };
  };

  // Format schedule for display
  const formatSchedule = (auto: Automation) => {
    if (auto.schedule_type === 'manual') return 'Manual';
    if (auto.schedule_type === 'cron' && auto.cron_expression) return `⏰ ${auto.cron_expression}`;
    return auto.schedule_type;
  };

  // SVG Icons for file manager look
  const FolderIcon = ({ open, color = '#f59e0b' }: { open: boolean; color?: string }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      {open ? (
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z" fill={color} fillOpacity="0.2" />
      ) : (
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill={color} fillOpacity="0.2" />
      )}
    </svg>
  );

  const FileIcon = ({ status }: { status: string }) => {
    const color = STATUS_COLORS[status] || '#6b7280';
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill={color} fillOpacity="0.15" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  };

  const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '13px' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .fm-row:hover { background: rgba(255,255,255,0.06) !important; }
        .fm-row.selected { background: rgba(59, 130, 246, 0.15) !important; border-color: rgba(59, 130, 246, 0.4) !important; }
        .fm-action { opacity: 0; transition: opacity 0.15s; }
        .fm-row:hover .fm-action { opacity: 1; }
        .fm-context-menu { background: rgba(30,30,40,0.98); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); padding: 4px 0; min-width: 160px; }
        .fm-context-item { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.9); }
        .fm-context-item:hover { background: rgba(255,255,255,0.1); }
        .fm-context-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0; }
      `}</style>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0 0.25rem' }}>
        <input
          type="text"
          placeholder="🔍 Search automations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '0.4rem 0.6rem', color: '#fff', fontSize: '12px', outline: 'none' }}
        />
        {onCreateNew && (
          <button onClick={onCreateNew} title="New Automation" style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '6px', padding: '0.4rem 0.6rem', color: '#10b981', cursor: 'pointer', fontSize: '12px' }}>+ New</button>
        )}
        {onRefresh && (
          <button onClick={onRefresh} title="Refresh" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '0.4rem 0.5rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '12px' }}>↻</button>
        )}
      </div>

      {/* Root folder: My Automations */}
      <div>
        <div
          className="fm-row"
          onClick={() => toggleFolder('my_automations')}
          onContextMenu={(e) => handleContextMenu(e, 'folder', { id: 'my_automations', name: 'My Automations' })}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.5rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid transparent', userSelect: 'none' }}
        >
          <ChevronIcon expanded={expandedFolders.has('my_automations')} />
          <FolderIcon open={expandedFolders.has('my_automations')} />
          <span style={{ color: '#fff', fontWeight: 500, flex: 1 }}>My Automations</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '10px' }}>{automations.length}</span>
        </div>

        {/* Category folders */}
        {expandedFolders.has('my_automations') && (
          <div style={{ marginLeft: '1rem', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '0.5rem' }}>
            {Object.entries(filteredCategories).sort(([a], [b]) => {
              const aDisplay = getCategoryDisplay(a).label;
              const bDisplay = getCategoryDisplay(b).label;
              return aDisplay.localeCompare(bDisplay);
            }).map(([categoryId, autos]) => {
              const categoryDisplay = getCategoryDisplay(categoryId);
              return (
              <div key={categoryId}>
                <div
                  className="fm-row"
                  onClick={() => toggleFolder(categoryId)}
                  onContextMenu={(e) => handleContextMenu(e, 'folder', { id: categoryId, name: categoryDisplay.label })}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.5rem', cursor: 'pointer', borderRadius: '5px', border: '1px solid transparent', userSelect: 'none', marginTop: '2px' }}
                >
                  <ChevronIcon expanded={expandedFolders.has(categoryId)} />
                  <span style={{ fontSize: '14px' }}>{categoryDisplay.icon}</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', flex: 1 }}>{categoryDisplay.label}</span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>{autos.length}</span>
                </div>

                {expandedFolders.has(categoryId) && (
                  <AutomationList
                    automations={autos}
                    executions={executions}
                    loadingExecutions={loadingExecutions}
                    expandedAutomations={expandedAutomations}
                    selectedAutomationId={selectedAutomationId}
                    onToggleAutomation={toggleAutomation}
                    onSelectAutomation={onSelectAutomation}
                    onRunAutomation={onRunAutomation}
                    onEditAutomation={onEditAutomation}
                    onDeleteAutomation={onDeleteAutomation}
                    onViewLogs={onViewLogs}
                    onProvideInput={onProvideInput}
                    onStopExecution={onStopExecution}
                    onDeleteExecution={onDeleteExecution}
                    getStatusIndicator={getStatusIndicator}
                    formatSchedule={formatSchedule}
                    onContextMenu={handleContextMenu}
                    FileIcon={FileIcon}
                    ChevronIcon={ChevronIcon}
                  />
                )}
              </div>
            );})}
            {Object.keys(filteredCategories).length === 0 && searchQuery && (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '1rem', textAlign: 'center' }}>No automations match &quot;{searchQuery}&quot;</div>
            )}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="fm-context-menu" style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999 }}>
          {contextMenu.type === 'automation' && (
            <>
              <div className="fm-context-item" onClick={() => { onEditAutomation(contextMenu.item as Automation); setContextMenu(null); }}>✏️ Edit</div>
              <div className="fm-context-item" onClick={() => { onRunAutomation(contextMenu.item as Automation); setContextMenu(null); }}>▶️ Run</div>
              <div className="fm-context-divider" />
              <div className="fm-context-item" onClick={() => { navigator.clipboard.writeText((contextMenu.item as Automation).id); setContextMenu(null); }}>📋 Copy ID</div>
              <div className="fm-context-divider" />
              <div className="fm-context-item" style={{ color: '#ef4444' }} onClick={() => { onDeleteAutomation(contextMenu.item as Automation); setContextMenu(null); }}>🗑️ Delete</div>
            </>
          )}
          {contextMenu.type === 'folder' && (
            <>
              <div className="fm-context-item" onClick={() => { toggleFolder((contextMenu.item as { id: string }).id); setContextMenu(null); }}>📂 Toggle Folder</div>
              {onCreateNew && <div className="fm-context-item" onClick={() => { onCreateNew(); setContextMenu(null); }}>➕ New Automation</div>}
            </>
          )}
          {contextMenu.type === 'execution' && (
            <>
              <div className="fm-context-item" onClick={() => { onViewLogs(contextMenu.item as Execution); setContextMenu(null); }}>📋 View Logs</div>
              {(contextMenu.item as Execution).status === 'waiting_input' && (
                <div className="fm-context-item" onClick={() => { onProvideInput(contextMenu.item as Execution); setContextMenu(null); }}>✍️ Provide Input</div>
              )}
              {['running', 'waiting_input'].includes((contextMenu.item as Execution).status) && (
                <div className="fm-context-item" style={{ color: '#ef4444' }} onClick={() => { onStopExecution(contextMenu.item as Execution); setContextMenu(null); }}>⏹️ Stop</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Sub-component for automation list
function AutomationList({
  automations,
  executions,
  loadingExecutions,
  expandedAutomations,
  selectedAutomationId,
  onToggleAutomation,
  onSelectAutomation,
  onRunAutomation,
  onEditAutomation,
  onDeleteAutomation,
  onViewLogs,
  onProvideInput,
  onStopExecution,
  onDeleteExecution,
  getStatusIndicator,
  formatSchedule,
  onContextMenu,
  FileIcon,
  ChevronIcon,
}: {
  automations: Automation[];
  executions: Record<string, Execution[]>;
  loadingExecutions: Set<string>;
  expandedAutomations: Set<string>;
  selectedAutomationId?: string;
  onToggleAutomation: (id: string) => void;
  onSelectAutomation: (auto: Automation) => void;
  onRunAutomation: (auto: Automation) => void;
  onEditAutomation: (auto: Automation) => void;
  onDeleteAutomation: (auto: Automation) => void;
  onViewLogs: (exec: Execution) => void;
  onProvideInput: (exec: Execution) => void;
  onStopExecution: (exec: Execution) => void;
  onDeleteExecution: (exec: Execution) => void;
  getStatusIndicator: (status: string, isPulsing?: boolean) => React.CSSProperties;
  formatSchedule: (auto: Automation) => string;
  onContextMenu: (e: React.MouseEvent, type: 'folder' | 'automation' | 'execution', item: unknown) => void;
  FileIcon: React.FC<{ status: string }>;
  ChevronIcon: React.FC<{ expanded: boolean }>;
}) {
  return (
    <div style={{ marginLeft: '0.75rem', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '0.4rem' }}>
      {automations.map(auto => (
        <AutomationItem
          key={auto.id}
          automation={auto}
          executions={executions[auto.id] || []}
          isLoading={loadingExecutions.has(auto.id)}
          isExpanded={expandedAutomations.has(auto.id)}
          isSelected={selectedAutomationId === auto.id}
          onToggle={() => onToggleAutomation(auto.id)}
          onSelect={() => onSelectAutomation(auto)}
          onRun={() => onRunAutomation(auto)}
          onEdit={() => onEditAutomation(auto)}
          onDelete={() => onDeleteAutomation(auto)}
          onViewLogs={onViewLogs}
          onProvideInput={onProvideInput}
          onStopExecution={onStopExecution}
          onDeleteExecution={onDeleteExecution}
          getStatusIndicator={getStatusIndicator}
          formatSchedule={formatSchedule}
          onContextMenu={onContextMenu}
          FileIcon={FileIcon}
          ChevronIcon={ChevronIcon}
        />
      ))}
    </div>
  );
}



// Individual automation item with executions
function AutomationItem({
  automation: auto,
  executions,
  isLoading,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  onRun,
  onEdit,
  onDelete,
  onViewLogs,
  onProvideInput,
  onStopExecution,
  onDeleteExecution,
  getStatusIndicator,
  formatSchedule,
  onContextMenu,
  FileIcon,
  ChevronIcon,
}: {
  automation: Automation;
  executions: Execution[];
  isLoading: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewLogs: (exec: Execution) => void;
  onProvideInput: (exec: Execution) => void;
  onStopExecution: (exec: Execution) => void;
  onDeleteExecution: (exec: Execution) => void;
  getStatusIndicator: (status: string, isPulsing?: boolean) => React.CSSProperties;
  formatSchedule: (auto: Automation) => string;
  onContextMenu: (e: React.MouseEvent, type: 'folder' | 'automation' | 'execution', item: unknown) => void;
  FileIcon: React.FC<{ status: string }>;
  ChevronIcon: React.FC<{ expanded: boolean }>;
}) {
  // Always show chevron so users can expand to check for executions
  // (executions are fetched on first expand, not upfront)
  const hasExecutions = true;

  return (
    <div>
      {/* Automation row */}
      <div
        className={`fm-row ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelect()}
        onDoubleClick={() => onEdit()}
        onContextMenu={(e) => onContextMenu(e, 'automation', auto)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.3rem 0.4rem',
          cursor: 'pointer',
          borderRadius: '5px',
          border: '1px solid transparent',
          marginTop: '1px',
        }}
      >
        <span onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}>
          {hasExecutions ? <ChevronIcon expanded={isExpanded} /> : <span style={{ width: '12px' }} />}
        </span>
        <FileIcon status={auto.status} />
        <span style={{ color: '#fff', fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {auto.display_name || auto.name}
        </span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{formatSchedule(auto)}</span>
        <div className="fm-action" style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
          <button onClick={onRun} title="Run" style={{ background: 'rgba(16, 185, 129, 0.25)', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', fontSize: '10px', color: '#10b981' }}>▶</button>
          <button onClick={onEdit} title="Edit" style={{ background: 'rgba(59, 130, 246, 0.25)', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', fontSize: '10px', color: '#3b82f6' }}>✎</button>
          <button onClick={onDelete} title="Delete" style={{ background: 'rgba(239, 68, 68, 0.25)', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', fontSize: '10px', color: '#ef4444' }}>×</button>
        </div>
      </div>

      {/* Executions list (history) */}
      {isExpanded && (
        <div style={{ marginLeft: '1.25rem', borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '0.35rem', marginTop: '2px' }}>
          {isLoading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', padding: '0.4rem' }}>⏳ Loading history...</div>
          ) : executions.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', padding: '0.4rem', fontStyle: 'italic' }}>No execution history</div>
          ) : (
            <>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', padding: '0.2rem 0.4rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📜 History</div>
              {executions.map(exec => (
                <ExecutionItem
                  key={exec.id}
                  execution={exec}
                  onViewLogs={() => onViewLogs(exec)}
                  onProvideInput={() => onProvideInput(exec)}
                  onStop={() => onStopExecution(exec)}
                  onDelete={() => onDeleteExecution(exec)}
                  getStatusIndicator={getStatusIndicator}
                  onContextMenu={onContextMenu}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Individual execution item (history entry)
function ExecutionItem({
  execution: exec,
  onViewLogs,
  onProvideInput,
  onStop,
  onDelete,
  getStatusIndicator,
  onContextMenu,
}: {
  execution: Execution;
  onViewLogs: () => void;
  onProvideInput: () => void;
  onStop: () => void;
  onDelete: () => void;
  getStatusIndicator: (status: string, isPulsing?: boolean) => React.CSSProperties;
  onContextMenu: (e: React.MouseEvent, type: 'folder' | 'automation' | 'execution', item: unknown) => void;
}) {
  const isPulsing = exec.status === 'running' || exec.status === 'waiting_input';
  const statusLabel = exec.status.replace('_', ' ');
  const timeStr = new Date(exec.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="fm-row"
      onClick={onViewLogs}
      onContextMenu={(e) => onContextMenu(e, 'execution', exec)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.25rem 0.4rem',
        borderRadius: '4px',
        cursor: 'pointer',
        border: '1px solid transparent',
        marginTop: '1px',
      }}
    >
      <div style={getStatusIndicator(exec.status, isPulsing)} />
      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', fontFamily: 'monospace' }}>
        {exec.id.slice(0, 6)}
      </span>
      <span style={{ fontSize: '10px', color: STATUS_COLORS[exec.status], textTransform: 'capitalize', flex: 1 }}>
        {statusLabel}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>{timeStr}</span>
      <div className="fm-action" style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
        <button onClick={onViewLogs} title="View Logs" style={{ background: 'rgba(59, 130, 246, 0.25)', border: 'none', borderRadius: '3px', padding: '2px 4px', cursor: 'pointer', fontSize: '9px', color: '#3b82f6' }}>📋</button>
        {exec.status === 'waiting_input' && (
          <button onClick={onProvideInput} title="Provide Input" style={{ background: 'rgba(245, 158, 11, 0.3)', border: 'none', borderRadius: '3px', padding: '2px 4px', cursor: 'pointer', fontSize: '9px', color: '#f59e0b' }}>✍</button>
        )}
        {['running', 'waiting_input'].includes(exec.status) && (
          <button onClick={onStop} title="Stop" style={{ background: 'rgba(239, 68, 68, 0.25)', border: 'none', borderRadius: '3px', padding: '2px 4px', cursor: 'pointer', fontSize: '9px', color: '#ef4444' }}>⏹</button>
        )}
        {['completed', 'failed', 'cancelled'].includes(exec.status) && (
          <button onClick={onDelete} title="Delete" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', padding: '2px 4px', cursor: 'pointer', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>×</button>
        )}
      </div>
    </div>
  );
}
