/**
 * ReasoningBubble Component
 * 
 * Displays reasoning events from A2A agents with visual indicators:
 * - Brain icon (🧠) for "thinking" type reasoning
 * - Hammer icon (🔨) for "action" type reasoning
 */

import React, { useState } from 'react';

export interface ReasoningEvent {
  id: string;
  reasoningType: 'thinking' | 'action';
  title: string;
  text: string;
  timestamp?: Date;
}

interface ReasoningBubbleProps {
  event: ReasoningEvent;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export const ReasoningBubble: React.FC<ReasoningBubbleProps> = ({
  event,
  isExpanded: controlledExpanded,
  onToggle,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;
  
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const icon = event.reasoningType === 'thinking' ? '🧠' : '🔨';
  const bgColor = event.reasoningType === 'thinking' 
    ? 'rgba(139, 92, 246, 0.15)' // Purple for thinking
    : 'rgba(245, 158, 11, 0.15)'; // Amber for action
  const borderColor = event.reasoningType === 'thinking'
    ? 'rgba(139, 92, 246, 0.4)'
    : 'rgba(245, 158, 11, 0.4)';
  const iconBg = event.reasoningType === 'thinking'
    ? 'rgba(139, 92, 246, 0.3)'
    : 'rgba(245, 158, 11, 0.3)';

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '0.5rem 0.75rem',
        marginBottom: '0.5rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onClick={handleToggle}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: iconBg,
            fontSize: '14px',
          }}
        >
          {icon}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.9)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {event.title}
        </span>
        <span
          style={{
            fontSize: '0.7rem',
            color: 'rgba(255, 255, 255, 0.5)',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        >
          ▼
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && event.text && (
        <div
          style={{
            marginTop: '0.5rem',
            paddingTop: '0.5rem',
            borderTop: `1px solid ${borderColor}`,
            fontSize: '0.8rem',
            color: 'rgba(255, 255, 255, 0.8)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {event.text}
        </div>
      )}
    </div>
  );
};

/**
 * ReasoningBubbleList - Displays a list of reasoning events
 */
interface ReasoningBubbleListProps {
  events: ReasoningEvent[];
  maxVisible?: number;
}

export const ReasoningBubbleList: React.FC<ReasoningBubbleListProps> = ({
  events,
  maxVisible = 5,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const visibleEvents = showAll ? events : events.slice(-maxVisible);
  const hiddenCount = events.length - maxVisible;

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (events.length === 0) return null;

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.25rem 0.5rem',
            fontSize: '0.7rem',
            color: 'rgba(255, 255, 255, 0.6)',
            cursor: 'pointer',
            marginBottom: '0.5rem',
          }}
        >
          Show {hiddenCount} more reasoning step{hiddenCount > 1 ? 's' : ''}...
        </button>
      )}
      {visibleEvents.map(event => (
        <ReasoningBubble
          key={event.id}
          event={event}
          isExpanded={expandedIds.has(event.id)}
          onToggle={() => toggleExpanded(event.id)}
        />
      ))}
    </div>
  );
};

export default ReasoningBubble;

