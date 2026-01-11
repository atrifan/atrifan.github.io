'use client';

import React, { useState, CSSProperties } from 'react';

export interface CustomHeader {
  key: string;
  value: string;
}

interface CustomHeadersCardProps {
  headers: CustomHeader[];
  onHeadersChange: (headers: CustomHeader[]) => void;
  inputStyle?: CSSProperties;
}

export function CustomHeadersCard({
  headers,
  onHeadersChange,
  inputStyle = {},
}: CustomHeadersCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleKeyChange = (index: number, value: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], key: value };
    onHeadersChange(newHeaders);
  };

  const handleValueChange = (index: number, value: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], value: value };
    onHeadersChange(newHeaders);
  };

  const handleRemove = (index: number) => {
    onHeadersChange(headers.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onHeadersChange([...headers, { key: '', value: '' }]);
  };

  const toggleButtonStyle: CSSProperties = {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const removeButtonStyle: CSSProperties = {
    background: 'rgba(239, 68, 68, 0.2)',
    border: 'none',
    color: '#ef4444',
    borderRadius: '6px',
    padding: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  };

  const addButtonStyle: CSSProperties = {
    background: 'rgba(255,255,255,0.1)',
    border: '1px dashed rgba(255,255,255,0.3)',
    color: 'rgba(255,255,255,0.7)',
    borderRadius: '6px',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    width: '100%',
  };

  const headerCount = headers.filter(h => h.key.trim() && h.value.trim()).length;

  return (
    <div style={{ marginTop: '1rem' }}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        style={toggleButtonStyle}
      >
        {isExpanded ? '▼' : '▶'} Custom Headers {headerCount > 0 && `(${headerCount})`}
      </button>

      {isExpanded && (
        <div style={{ marginTop: '0.5rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
          {headers.map((header, index) => (
            <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={header.key}
                onChange={(e) => handleKeyChange(index, e.target.value)}
                placeholder="Header name"
                style={{ ...inputStyle, fontSize: '0.85rem', flex: 1, minWidth: '120px' }}
              />
              <input
                type="text"
                value={header.value}
                onChange={(e) => handleValueChange(index, e.target.value)}
                placeholder="Header value"
                style={{ ...inputStyle, fontSize: '0.85rem', flex: 2, minWidth: '150px' }}
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                style={removeButtonStyle}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAdd}
            style={addButtonStyle}
          >
            + Add Header
          </button>
        </div>
      )}
    </div>
  );
}

