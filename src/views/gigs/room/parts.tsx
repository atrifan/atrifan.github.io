'use client';

/** Small pieces shared by the job room tabs. */
import { useCallback, useState, type ReactNode } from 'react';
import { formatDate } from '@/src/lib/jobs/client/format';

/** "12 Oct 2026, 10:31 UTC". Marked volatile: it depends on when the row was written. */
export function When({ iso }: { iso: string }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return (
    <time dateTime={iso} data-volatile="">
      {`${formatDate(iso)}, ${hh}:${mm} UTC`}
    </time>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="gigs-hint room-empty">{children}</p>;
}

/** Run an async action with a busy flag and a readable error. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

export function ErrorText({ id, error }: { id?: string; error: string | null }) {
  if (!error) return null;
  return (
    <p id={id} className="gigs-error" role="alert">
      {error}
    </p>
  );
}

/** One item per non-empty line. */
export function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
