'use client';

import Link from 'next/link';
import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { findTab, tabHref } from '@/src/lib/ai-tabs';
import type { DeviceQuery } from './device';
import { useControlPanelData } from './useControlPanelData';
import s from './ai.module.css';

/** Small building blocks shared by the ai. tabs. Colours come from the design tokens (ai.module.css). */

export function PageHeading({ children, lede }: { children: React.ReactNode; lede?: React.ReactNode }) {
  return (
    <header className={s.pageHead}>
      <h1 className={s.h1}>{children}</h1>
      {lede ? <p className={s.lede}>{lede}</p> : null}
    </header>
  );
}

export function Section({ title, actions, children, id }: { title: string; actions?: React.ReactNode; children: React.ReactNode; id?: string }) {
  const hid = useId();
  return (
    <section className={s.card} aria-labelledby={hid} id={id}>
      <div className={s.cardHead}>
        <h2 id={hid} className={s.h2}>
          {title}
        </h2>
        {actions ? <div className={s.cardActions}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <p className={s.muted}>{children}</p>;
}

export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className={s.alert}>
      {children}
    </p>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className={s.notice}>
      {children}
    </p>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'; children: React.ReactNode }) {
  return <span className={`${s.badge} ${s[`badge_${tone}`]}`}>{children}</span>;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', busy, className, disabled, children, ...rest }, ref) {
  return (
    <button type="button" ref={ref} {...rest} className={`${s.btn} ${s[`btn_${variant}`]} ${className ?? ''}`} disabled={disabled || busy} aria-busy={busy || undefined}>
      {children}
    </button>
  );
});

/** Two-step destructive action: the first press asks, "Confirm …" does it, "Cancel" backs out. */
export function ConfirmButton({ label, text, confirmLabel, onConfirm, busy }: { label: string; text?: string; confirmLabel: string; onConfirm: () => void; busy?: boolean }) {
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);
  if (!asking) {
    return (
      <Button variant="ghost" onClick={() => setAsking(true)} busy={busy} aria-label={text ? label : undefined}>
        {text ?? label}
      </Button>
    );
  }
  return (
    <span className={s.confirm}>
      <Button
        ref={confirmRef}
        variant="danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={s.switch} onClick={() => onChange(!checked)}>
      <span className={s.switchTrack} aria-hidden="true">
        <span className={s.switchThumb} />
      </span>
      <span className={s.switchText} aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  multiline,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'password' | 'url' | 'month' | 'number';
  placeholder?: string;
  multiline?: boolean;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.label}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className={s.input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <input id={id} className={s.input} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete ?? 'off'} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export function SelectField({ label, value, options, onChange, hideLabel, caption }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void; hideLabel?: boolean; caption?: string }) {
  const id = useId();
  return (
    <div className={s.field}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : s.label}>
        {label}
      </label>
      {caption ? (
        <span className={s.selectCaption} aria-hidden="true">
          {caption}
        </span>
      ) : null}
      <select id={id} className={s.input} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Form({ onSubmit, children }: { onSubmit: () => void; children: React.ReactNode }) {
  return (
    <form
      className={s.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

export function Stat({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div className={s.stat}>
      <dt className={s.statLabel}>{label}</dt>
      <dd className={`${s.statValue} ${small ? s.statValueSm : ''}`}>{value}</dd>
    </div>
  );
}

export function Stats({ children }: { children: React.ReactNode }) {
  return <dl className={s.stats}>{children}</dl>;
}

/** A list of rows that reads as a table on wide screens and as cards on phones. */
export function Rows({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <ul className={s.rows} aria-label={label}>
      {children}
    </ul>
  );
}

export function Row({ title, meta, actions, children, dim }: { title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; dim?: boolean }) {
  return (
    <li className={`${s.row} ${dim ? s.rowDim : ''}`}>
      <div className={s.rowMain}>
        <div className={s.rowTitle}>{title}</div>
        {meta ? <div className={s.rowMeta}>{meta}</div> : null}
        {children}
      </div>
      {actions ? <div className={s.rowActions}>{actions}</div> : null}
    </li>
  );
}

/** The "connect the extension" prompt of a device-backed page. */
export function ConnectPrompt() {
  const { base } = useControlPanelData();
  return (
    <div className={s.gate}>
      <h2 className={s.h2}>Connect the extension</h2>
      <p className={s.muted}>This section manages your device through the Tex browser extension. Open this page in the browser where the extension is installed and paired.</p>
      <p>
        <Link href={tabHref(findTab(['docs'])!, base)} className={s.link}>
          How to install
        </Link>
      </p>
    </div>
  );
}

/** A device-backed page body: shown only while the extension is connected, else one connect prompt. */
export function DeviceOnly({ children }: { children: React.ReactNode }) {
  const { connected } = useControlPanelData();
  return connected ? <>{children}</> : <ConnectPrompt />;
}

/** Not connected / loading / error states shared by every device-backed section. */
export function DeviceGate<T>({ query, children }: { query: DeviceQuery<T>; children: (data: T) => React.ReactNode }) {
  if (query.status === 'disconnected') return <ConnectPrompt />;
  if (query.status === 'loading') return <p className={s.muted} role="status">Loading…</p>;
  if (query.status === 'error') {
    return (
      <div className={s.errorBox}>
        <Alert>{query.error}</Alert>
        <Button onClick={() => query.reload()}>Retry</Button>
      </div>
    );
  }
  return <>{children(query.data as T)}</>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hid = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className={s.backdrop} onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={hid} className={s.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 id={hid} className={s.h2}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
