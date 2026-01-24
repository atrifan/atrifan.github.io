'use client';

import { useState, useEffect } from 'react';

// Types
interface Automation {
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

interface Execution {
  id: string;
  automation_id: string;
  status: 'pending' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled';
  trigger_type: string;
  current_step?: string;
  error?: string;
  started_at: string;
  completed_at?: string;
}

interface AutomationFinderProps {
  automations: Automation[];
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

// Category icons (default)
const CATEGORY_ICONS: Record<string, string> = {
  general: '📁',
  marketing: '📣',
  sales: '💰',
  support: '🎧',
  development: '💻',
  data: '📊',
  communication: '💬',
  productivity: '⚡',
};

export function AutomationFinder({
  automations,
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
}: AutomationFinderProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['my_automations']));
  const [expandedAutomations, setExpandedAutomations] = useState<Set<string>>(new Set());
  const [executions, setExecutions] = useState<Record<string, Execution[]>>({});
  const [loadingExecutions, setLoadingExecutions] = useState<Set<string>>(new Set());

  // Group automations by category
  const categories = automations.reduce((acc, auto) => {
    const cat = auto.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(auto);
    return acc;
  }, {} as Record<string, Automation[]>);

  // Toggle folder expansion
  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Toggle automation expansion (show executions)
  const toggleAutomation = async (automationId: string) => {
    const isExpanding = !expandedAutomations.has(automationId);
    
    setExpandedAutomations(prev => {
      const next = new Set(prev);
      if (next.has(automationId)) {
        next.delete(automationId);
      } else {
        next.add(automationId);
      }
      return next;
    });

    // Fetch executions if expanding and not already loaded
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

