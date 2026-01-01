/**
 * Shared Input Styles for consistent accessibility
 * Dark background with light text for better readability
 */

export const inputStyles = {
  // Standard text input
  textInput: {
    width: '100%',
    padding: '1rem',
    fontSize: '1.1rem',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    boxSizing: 'border-box' as const,
  },

  // Large text input (for main values)
  largeInput: {
    width: '100%',
    padding: '1rem',
    fontSize: '1.5rem',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
  },

  // Select dropdown
  select: {
    width: '100%',
    padding: '1rem',
    fontSize: '1.1rem',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(30,30,50,0.9)',
    color: '#fff',
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
  },

  // Small select (inline)
  smallSelect: {
    padding: '0.5rem 1rem',
    fontSize: '1rem',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(30,30,50,0.9)',
    color: '#fff',
    cursor: 'pointer',
  },

  // Textarea
  textarea: {
    width: '100%',
    padding: '1rem',
    fontSize: '1rem',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    resize: 'vertical' as const,
    minHeight: '120px',
    boxSizing: 'border-box' as const,
  },

  // Date/Time input
  dateTimeInput: {
    width: '100%',
    padding: '1rem',
    fontSize: '1.2rem',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    boxSizing: 'border-box' as const,
    colorScheme: 'dark',
  },

  // Number input (small, inline)
  smallNumberInput: {
    width: '100px',
    padding: '0.75rem',
    fontSize: '1.1rem',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    textAlign: 'center' as const,
  },
};

// CSS for placeholder text color (add to page styles)
export const inputPlaceholderCSS = `
  input::placeholder, textarea::placeholder {
    color: rgba(255,255,255,0.5);
  }
  input::-webkit-calendar-picker-indicator {
    filter: invert(1);
  }
  select option {
    background: #1f2937;
    color: #fff;
  }
`;

