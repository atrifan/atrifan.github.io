'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency, formatTokenCount } from '../config/ai-tokens.config';

interface MonthSummary {
  year: number;
  month: number;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
}

interface HistoryData {
  currentPeriod: { year: number; month: number };
  months: MonthSummary[];
  totalMonths: number;
}

interface BudgetData {
  period: { year: number; month: number; isHistorical: boolean };
  budget: { monthlyBudgetUsd: number };
  usage: {
    totalCost: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    budgetUsedPercent: number;
    byModel: Record<string, { inputTokens: number; outputTokens: number; cost: number; count: number }>;
    embeddingCost: number;
    embeddingTokens: number;
  };
  models: Array<{
    modelId: string;
    modelName: string;
    icon: string;
    provider: string;
    usedTokens: number;
    inputTokens: number;
    outputTokens: number;
    usedCost: number;
    requestCount: number;
  }>;
  embeddingModels: Array<{
    modelId: string;
    modelName: string;
    icon: string;
    usedTokens: number;
    usedCost: number;
    requestCount: number;
  }>;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  borderRadius: '16px',
  padding: '1.25rem',
  border: '1px solid rgba(255, 255, 255, 0.1)',
};

export function BudgetHistoryViewer() {
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<{ year: number; month: number } | null>(null);
  const [periodData, setPeriodData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available months
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('/api/ai/budget/history');
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch history');
        }
        const data = await response.json();
        setHistoryData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  // Fetch data for selected period
  const fetchPeriodData = useCallback(async (year: number, month: number) => {
    setPeriodLoading(true);
    try {
      const response = await fetch(`/api/ai/budget?year=${year}&month=${month}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch period data');
      }
      const data = await response.json();
      setPeriodData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load period data');
    } finally {
      setPeriodLoading(false);
    }
  }, []);

  // When a period is selected, fetch its data
  useEffect(() => {
    if (selectedPeriod) {
      fetchPeriodData(selectedPeriod.year, selectedPeriod.month);
    }
  }, [selectedPeriod, fetchPeriodData]);

  if (loading) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Loading history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
        <div style={{ color: '#ef4444' }}>{error}</div>
      </div>
    );
  }

  if (!historyData || historyData.months.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📊</div>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>No usage history available yet</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          Start using AI features to see your usage history here
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', marginTop: 0 }}>
        📅 Usage History
      </h3>
      <MonthYearFilter
        months={historyData.months}
        currentPeriod={historyData.currentPeriod}
        selectedPeriod={selectedPeriod}
        onSelect={setSelectedPeriod}
      />
      {selectedPeriod && (
        <PeriodDetails data={periodData} loading={periodLoading} period={selectedPeriod} />
      )}
    </div>
  );
}

// Dropdown select styles
const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.1)',
  color: '#fff',
  fontSize: '0.85rem',
  cursor: 'pointer',
  minWidth: '100px',
};

// Month/Year filter component with dropdowns
function MonthYearFilter({
  months,
  currentPeriod,
  selectedPeriod,
  onSelect
}: {
  months: MonthSummary[];
  currentPeriod: { year: number; month: number };
  selectedPeriod: { year: number; month: number } | null;
  onSelect: (period: { year: number; month: number }) => void;
}) {
  // Get unique years from available months
  const availableYears = [...new Set(months.map(m => m.year))].sort((a, b) => b - a);

  // Get months available for selected year
  const selectedYear = selectedPeriod?.year || currentPeriod.year;
  const availableMonthsForYear = months
    .filter(m => m.year === selectedYear)
    .map(m => m.month)
    .sort((a, b) => b - a);

  const handleYearChange = (year: number) => {
    // When year changes, select the most recent month available for that year
    const monthsForYear = months.filter(m => m.year === year).map(m => m.month);
    const latestMonth = Math.max(...monthsForYear);
    onSelect({ year, month: latestMonth });
  };

  const handleMonthChange = (month: number) => {
    onSelect({ year: selectedYear, month });
  };

  // Find summary for selected period
  const selectedSummary = months.find(
    m => m.year === selectedPeriod?.year && m.month === selectedPeriod?.month
  );

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Year dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Year:</label>
          <select
            value={selectedYear}
            onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
            style={selectStyle}
          >
            {availableYears.map(year => (
              <option key={year} value={year} style={{ background: '#1e293b' }}>
                {year} {year === currentPeriod.year ? '(current)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Month dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Month:</label>
          <select
            value={selectedPeriod?.month || ''}
            onChange={(e) => handleMonthChange(parseInt(e.target.value, 10))}
            style={selectStyle}
          >
            <option value="" disabled style={{ background: '#1e293b' }}>Select month</option>
            {availableMonthsForYear.map(month => {
              const isCurrent = currentPeriod.year === selectedYear && currentPeriod.month === month;
              return (
                <option key={month} value={month} style={{ background: '#1e293b' }}>
                  {MONTH_NAMES[month - 1]} {isCurrent ? '(current)' : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Quick summary of selected period */}
        {selectedSummary && (
          <div style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.35rem 0.75rem',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(16, 185, 129, 0.2)',
          }}>
            <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>
              {formatCurrency(selectedSummary.totalCost)}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
              {selectedSummary.requestCount} requests
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Period details component
function PeriodDetails({
  data,
  loading,
  period
}: {
  data: BudgetData | null;
  loading: boolean;
  period: { year: number; month: number };
}) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Loading {MONTH_NAMES[period.month - 1]} {period.year}...</div>
      </div>
    );
  }

  if (!data) return null;

  const usedModels = data.models.filter(m => m.usedTokens > 0).sort((a, b) => b.usedCost - a.usedCost);
  const usedEmbeddings = data.embeddingModels.filter(m => m.usedTokens > 0).sort((a, b) => b.usedCost - a.usedCost);

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h4 style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, margin: 0 }}>
          {MONTH_NAMES[period.month - 1]} {period.year}
        </h4>
        {data.period.isHistorical && (
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
            Historical
          </span>
        )}
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ color: '#10b981', fontSize: '1.1rem', fontWeight: 700 }}>{formatCurrency(data.usage.totalCost)}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Total Spent</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
          <div style={{ color: '#f59e0b', fontSize: '1.1rem', fontWeight: 700 }}>{data.usage.budgetUsedPercent.toFixed(1)}%</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Budget Used</div>
        </div>
      </div>

      {/* Token breakdown with input/output */}
      <div style={{
        background: 'rgba(102, 126, 234, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(102, 126, 234, 0.2)',
        padding: '0.75rem',
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ color: '#667eea', fontSize: '1.1rem', fontWeight: 700 }}>{formatTokenCount(data.usage.totalTokens)}</span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>total tokens</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: '#22c55e', fontSize: '0.9rem' }}>↑</span>
            <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '0.85rem' }}>{formatTokenCount(data.usage.totalInputTokens || 0)}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>input</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ color: '#f97316', fontSize: '0.9rem' }}>↓</span>
            <span style={{ color: '#f97316', fontWeight: 600, fontSize: '0.85rem' }}>{formatTokenCount(data.usage.totalOutputTokens || 0)}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>output</span>
          </div>
        </div>
      </div>

      {/* Model breakdown */}
      {usedModels.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 500 }}>
            🤖 Chat Models
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {usedModels.map(model => (
              <ModelRow key={model.modelId} model={model} totalCost={data.usage.totalCost} />
            ))}
          </div>
        </div>
      )}

      {/* Embedding breakdown */}
      {usedEmbeddings.length > 0 && (
        <div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 500 }}>
            🔗 Embedding Models
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {usedEmbeddings.map(model => (
              <EmbeddingModelRow key={model.modelId} model={model} totalCost={data.usage.totalCost} />
            ))}
          </div>
        </div>
      )}

      {usedModels.length === 0 && usedEmbeddings.length === 0 && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', padding: '1rem' }}>
          No usage recorded for this month
        </div>
      )}
    </div>
  );
}

// Chat model row component with input/output breakdown
function ModelRow({
  model,
  totalCost,
  showInputOutput = true
}: {
  model: {
    modelId: string;
    modelName: string;
    icon: string;
    usedTokens: number;
    inputTokens?: number;
    outputTokens?: number;
    usedCost: number;
    requestCount: number
  };
  totalCost: number;
  showInputOutput?: boolean;
}) {
  const costPercent = totalCost > 0 ? (model.usedCost / totalCost) * 100 : 0;
  const hasInputOutput = showInputOutput && (model.inputTokens !== undefined || model.outputTokens !== undefined);

  return (
    <div style={{
      padding: '0.5rem 0.75rem',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '8px',
      fontSize: '0.8rem',
    }}>
      {/* Top row: model name, requests, cost */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>{model.icon}</span>
          <span style={{ color: '#fff' }}>{model.modelName}</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
            {model.requestCount} req
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: '#10b981', fontWeight: 600, minWidth: '50px', textAlign: 'right' }}>
            {formatCurrency(model.usedCost)}
          </span>
          <div style={{
            width: '40px',
            height: '4px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(costPercent, 100)}%`,
              height: '100%',
              background: '#667eea',
              borderRadius: '2px',
            }} />
          </div>
        </div>
      </div>

      {/* Bottom row: token breakdown */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        marginTop: '0.35rem',
        paddingLeft: '1.5rem',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
          {formatTokenCount(model.usedTokens)} total
        </span>
        {hasInputOutput && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ color: '#22c55e', fontSize: '0.75rem' }}>↑</span>
              <span style={{ color: '#22c55e', fontSize: '0.7rem' }}>{formatTokenCount(model.inputTokens || 0)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ color: '#f97316', fontSize: '0.75rem' }}>↓</span>
              <span style={{ color: '#f97316', fontSize: '0.7rem' }}>{formatTokenCount(model.outputTokens || 0)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Embedding model row (no input/output, just tokens)
function EmbeddingModelRow({
  model,
  totalCost
}: {
  model: { modelId: string; modelName: string; icon: string; usedTokens: number; usedCost: number; requestCount: number };
  totalCost: number;
}) {
  const costPercent = totalCost > 0 ? (model.usedCost / totalCost) * 100 : 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.5rem 0.75rem',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '8px',
      fontSize: '0.8rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>{model.icon}</span>
        <span style={{ color: '#fff' }}>{model.modelName}</span>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
          {model.requestCount} req
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
          {formatTokenCount(model.usedTokens)}
        </span>
        <span style={{ color: '#10b981', fontWeight: 600, minWidth: '50px', textAlign: 'right' }}>
          {formatCurrency(model.usedCost)}
        </span>
        <div style={{
          width: '40px',
          height: '4px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(costPercent, 100)}%`,
            height: '100%',
            background: '#667eea',
            borderRadius: '2px',
          }} />
        </div>
      </div>
    </div>
  );
}

