'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

interface Execution {
  id: string;
  status: string;
  trigger_type: string;
  current_step: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  has_pending_inputs: boolean;
  pending_inputs_count: number;
  log_count: number;
}

interface ExecutionLog {
  id: string;
  timestamp: string;
  level: string;
  step_id: string | null;
  step_name: string | null;
  message: string;
  status: string | null;
}

interface Props {
  automationId: string;
  automationName: string;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  running: '#3b82f6',
  pending: '#8b5cf6',
  waiting_input: '#f59e0b',
  paused: '#6b7280',
  completed: '#10b981',
  failed: '#ef4444',
  cancelled: '#ef4444',
};

const STATUS_ICONS: Record<string, string> = {
  running: '⚡',
  pending: '⏳',
  waiting_input: '📝',
  paused: '⏸️',
  completed: '✅',
  failed: '❌',
  cancelled: '🛑',
};

export function ExecutionInstancesPanel({ automationId, automationName, onClose }: Props) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/automations/${automationId}/executions?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.executions || []);
      }
    } catch (err) {
      console.error('Failed to fetch executions:', err);
    } finally {
      setLoading(false);
    }
  }, [automationId]);

  const fetchLogs = useCallback(async (executionId: string) => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/ai/automations/${automationId}/executions/${executionId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [automationId]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  useEffect(() => {
    if (selectedExecution) {
      fetchLogs(selectedExecution);
    }
  }, [selectedExecution, fetchLogs]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel(`executions-${automationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'automation_executions',
        filter: `automation_id=eq.${automationId}`,
      }, () => {
        fetchExecutions();
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [automationId, fetchExecutions]);

  const handleStop = async (executionId: string) => {
    setActionLoading(executionId);
    try {
      await fetch(`/api/ai/automations/${automationId}/executions/${executionId}`, {
        method: 'DELETE',
      });
      fetchExecutions();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (executionId: string) => {
    if (!confirm('Delete this execution and its logs?')) return;
    setActionLoading(executionId);
    try {
      await fetch(`/api/ai/automations/${automationId}/executions/${executionId}?hard=true`, {
        method: 'DELETE',
      });
      if (selectedExecution === executionId) {
        setSelectedExecution(null);
        setLogs([]);
      }
      fetchExecutions();
    } finally {
      setActionLoading(null);
    }
  };

  const formatTime = (date: string) => new Date(date).toLocaleString();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(135deg, rgba(30,30,50,0.98), rgba(20,20,40,0.98))', borderRadius: '16px', width: '100%', maxWidth: '1000px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>📊 Executions: {automationName}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

