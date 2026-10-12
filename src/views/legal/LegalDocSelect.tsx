'use client';

/** The legal documents as a select, for narrow screens (the side nav is hidden below 960px). */
export function LegalDocSelect({ options, current }: { options: { href: string; title: string }[]; current: string }) {
  return (
    <div className="field legal-select">
      <label htmlFor="legal-doc-select">Legal document</label>
      <select
        id="legal-doc-select"
        className="input"
        value={current}
        onChange={(e) => {
          if (e.target.value !== current) window.location.assign(e.target.value);
        }}
      >
        {options.map((o) => (
          <option key={o.href} value={o.href}>
            {o.title}
          </option>
        ))}
      </select>
    </div>
  );
}
