'use client';

import { useState } from 'react';

/** A URL with a copy button; the button says "Copied" for 2s after a successful copy. */
export function CopyUrl({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="copy-url">
      <code className="copy-url-text">{url}</code>
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy} aria-label={copied ? 'Copied' : label}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {copied ? 'Copied to the clipboard' : ''}
      </span>
    </div>
  );
}
