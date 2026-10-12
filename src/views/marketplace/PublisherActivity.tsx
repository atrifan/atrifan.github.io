'use client';

/**
 * Marketplace /publisher/activity: installs of your packages over time. Totals, a bar list by
 * day or by (Monday-start) week, and per package a table of installs per day and version.
 * Anonymous counts only. A thin client over GET /api/marketplace/publisher/activity.
 */
import { useEffect, useState } from 'react';
import { formatDay, formatWeek } from '@/src/lib/activity/format';
import { installsLabel, weeklyInstalls, type DailyInstalls, type TimelineRow } from '@/src/lib/activity/installs';
import { surfaceUrl } from '@/src/lib/surface-url';
import '@/styles/activity.css';

interface Activity {
  totals: { all: number; last7: number; last30: number };
  daily: DailyInstalls[];
  packages: Array<{ id: string; name: string; total: number; timeline: TimelineRow[] }>;
}

type Unit = 'day' | 'week';

function Bars({ unit, rows }: { unit: Unit; rows: Array<{ label: string; installs: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.installs));
  return (
    <ul className="act-bars" role="list" aria-label={`Installs by ${unit}`}>
      {rows.map((r) => (
        <li key={r.label} className="act-bar" aria-label={`${r.label}: ${installsLabel(r.installs)}`}>
          <span className="act-bar-label" aria-hidden="true">
            {r.label}
          </span>
          <span className="act-bar-track" aria-hidden="true">
            <span className="act-bar-fill" style={{ width: `${(r.installs / max) * 100}%` }} />
          </span>
          <span className="act-bar-value" aria-hidden="true">
            {r.installs}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PublisherActivity() {
  const [data, setData] = useState<Activity | null>(null);
  const [failed, setFailed] = useState(false);
  const [unit, setUnit] = useState<Unit>('day');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/marketplace/publisher/activity', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Activity;
        if (alive) setData(body);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const rows =
    unit === 'day'
      ? (data?.daily ?? []).map((d) => ({ label: formatDay(d.date), installs: d.installs }))
      : weeklyInstalls(data?.daily ?? []).map((w) => ({ label: formatWeek(w.week), installs: w.installs }));
  const empty = data !== null && data.packages.length === 0;

  return (
    <div className="page act-page">
      <header className="act-header">
        <h1>Install activity</h1>
        <p className="act-lede">How often your packages are installed. Installs are anonymous counts: you never see who installed.</p>
        <p className="act-note">
          <a href={surfaceUrl('marketplace', '/publish')}>Back to your packages</a>
        </p>
      </header>

      {failed && <p className="act-error">We couldn&apos;t load your install activity. Refresh to try again.</p>}
      {!data && !failed && <p className="act-note">Loading…</p>}

      {data && (
        <>
          <section className="act-section" aria-labelledby="pa-totals">
            <h2 id="pa-totals">Totals</h2>
            <dl className="act-stats">
              <div className="act-stat">
                <dt>Total installs</dt>
                <dd>{data.totals.all}</dd>
              </div>
              <div className="act-stat">
                <dt>Last 7 days</dt>
                <dd>{data.totals.last7}</dd>
              </div>
              <div className="act-stat">
                <dt>Last 30 days</dt>
                <dd>{data.totals.last30}</dd>
              </div>
            </dl>
          </section>

          {empty ? (
            <p className="act-empty">No installs yet</p>
          ) : (
            <>
              <section className="act-section" aria-labelledby="pa-chart">
                <div className="act-section-head">
                  <h2 id="pa-chart">Installs over time</h2>
                  <div className="act-toggle" role="group" aria-label="Group by">
                    <button type="button" aria-pressed={unit === 'day'} onClick={() => setUnit('day')}>
                      Day
                    </button>
                    <button type="button" aria-pressed={unit === 'week'} onClick={() => setUnit('week')}>
                      Week
                    </button>
                  </div>
                </div>
                {rows.length > 0 ? <Bars unit={unit} rows={rows} /> : <p className="act-empty">No installs in the last 30 days</p>}
              </section>

              {data.packages.map((p) => (
                <section key={p.id} className="act-section" aria-labelledby={`pa-${p.id}`}>
                  <div className="act-section-head">
                    <h2 id={`pa-${p.id}`}>{p.name}</h2>
                    <span className="act-note">{installsLabel(p.total)} in total</span>
                  </div>
                  {p.timeline.length === 0 ? (
                    <p className="act-empty">No installs yet</p>
                  ) : (
                    <div className="act-table-wrap">
                      <table className="act-table">
                        <caption className="visually-hidden">{p.name} installs</caption>
                        <thead>
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Version</th>
                            <th scope="col" className="num">
                              Installs
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.timeline.map((t) => (
                            <tr key={`${t.date}|${t.version}`}>
                              <td data-label="Date">{formatDay(t.date)}</td>
                              <td data-label="Version">{t.version}</td>
                              <td data-label="Installs" className="num">
                                {t.installs}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
