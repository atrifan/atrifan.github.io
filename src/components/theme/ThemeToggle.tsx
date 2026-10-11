'use client';

import { useId } from 'react';
import { THEME_CHOICES, type ThemeChoice } from '@/src/lib/theme';
import { useTheme } from './ThemeProvider';

const LABEL: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', system: 'System' };

function Icon({ choice }: { choice: ThemeChoice }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  if (choice === 'light') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (choice === 'dark') {
    return (
      <svg {...common}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

/**
 * Light / Dark / System switch. Native radios in a radiogroup, so arrow keys,
 * focus and checked state work without custom key handling.
 */
export function ThemeToggle() {
  const { choice, setChoice } = useTheme();
  const name = useId();
  return (
    <div role="radiogroup" aria-label="Theme" className="theme-toggle">
      {THEME_CHOICES.map((c) => (
        <label key={c} className="theme-option" title={LABEL[c]}>
          <input
            type="radio"
            name={name}
            value={c}
            checked={choice === c}
            onChange={() => setChoice(c)}
          />
          <Icon choice={c} />
          <span className="visually-hidden">{LABEL[c]}</span>
        </label>
      ))}
    </div>
  );
}
