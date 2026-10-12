'use client';

/**
 * QA checks on a contract. Versions created by an accept API that stores `qa_checks` show
 * those; older ones fall back to the choice this browser made for the job.
 */
import { useEffect, useState } from 'react';
import { normalizeQaChecks, parseStoredQaChecks, qaCheckLabel, qaStorageKey } from '@/src/lib/jobs/client/qa-checks';
import type { QaCheck } from '@/src/config/qa.config';

export function ContractQaChecks({ jobId, stored }: { jobId: string; stored: string[] | null }) {
  const [checks, setChecks] = useState<QaCheck[]>(normalizeQaChecks(stored ?? []));
  useEffect(() => {
    if (stored == null) setChecks(parseStoredQaChecks(window.sessionStorage.getItem(qaStorageKey(jobId))));
  }, [jobId, stored]);
  return (
    <ul className="gigs-list">
      {checks.map((c) => (
        <li key={c}>{qaCheckLabel(c)}</li>
      ))}
    </ul>
  );
}
