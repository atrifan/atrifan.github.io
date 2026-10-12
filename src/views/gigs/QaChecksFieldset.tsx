/** The QA checks picker (Basic included, deeper checks capped in credits). */
import type { QaCheck } from '@/src/config/qa.config';
import type { qaOptions } from '@/src/lib/jobs/client/qa-checks';

export function QaChecksFieldset({
  options,
  chosen,
  onChange,
  reserve,
  idPrefix = 'qa',
}: {
  idPrefix?: string;
  options: ReturnType<typeof qaOptions>;
  chosen: QaCheck[];
  onChange: (id: QaCheck, on: boolean) => void;
  reserve: number;
}) {
  return (
    <fieldset className="gigs-fieldset">
      <legend>QA checks</legend>
      <p className="gigs-hint">Every delivery gets an independent QA review. Add deeper checks if you need them; they are paid from your credits, capped per check.</p>
      {options.map((o) => (
        <div key={o.id} className="gigs-check">
          <input
            id={`${idPrefix}-${o.id}`}
            type="checkbox"
            checked={o.included || chosen.includes(o.id)}
            disabled={o.included}
            aria-describedby={`${idPrefix}-${o.id}-cost`}
            onChange={(e) => onChange(o.id, e.target.checked)}
          />
          <span className="gigs-check-body">
            <label htmlFor={`${idPrefix}-${o.id}`} className="gigs-check-label">
              {o.label}
            </label>
            <span id={`${idPrefix}-${o.id}-cost`} className="gigs-hint">
              {o.included ? 'Included' : `up to ${o.credits.toLocaleString('en-GB')} credits`}
            </span>
          </span>
        </div>
      ))}
      <p className="gigs-hint" aria-live="polite">
        {reserve > 0 ? `Reserved at submission: up to ${reserve.toLocaleString('en-GB')} credits.` : 'Only Basic QA: nothing is reserved from your credits.'}
      </p>
    </fieldset>
  );
}
