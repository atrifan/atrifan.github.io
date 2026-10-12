'use client';

/** A code block with a copy button. Scrolls horizontally inside itself on small screens. */
import { useState } from 'react';

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="gigs-code">
      <div className="gigs-code-head">
        <span>{label}</span>
        <button type="button" className="gigs-copy" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${label}`}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre tabIndex={0} aria-label={label}>
        <code>{code}</code>
      </pre>
      <span className="visually-hidden" aria-live="polite">
        {copied ? 'Copied to the clipboard' : ''}
      </span>
    </div>
  );
}
