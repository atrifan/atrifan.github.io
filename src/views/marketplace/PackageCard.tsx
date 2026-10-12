'use client';

import { useState } from 'react';
import { formatInstalls, ratingAriaLabel, ratingValue } from '@/src/lib/marketplace/format';
import { kindLabel } from '@/src/lib/marketplace/kinds';
import { catalogSearch, parseCatalogQuery } from '@/src/lib/marketplace/catalog-query';
import { surfaceUrl } from '@/src/lib/surface-url';
import type { CatalogItem } from '@/src/lib/marketplace/wire-format';
import { InstallButton } from './InstallControls';
import { KindIcon, StarIcon, VerifiedIcon } from './KindIcon';

/** Badges shared by the card and the detail page. */
export function PackageBadges({ verified, translatedFrom }: { verified: boolean; translatedFrom: string | null }) {
  if (!verified && !translatedFrom) return null;
  return (
    <span className="mp-badges">
      {verified && (
        <span className="mp-badge mp-badge-verified" title="Approved by a Tulzo admin">
          <VerifiedIcon />
          <span className="mp-badge-text">Verified</span>
        </span>
      )}
      {translatedFrom && (
        <span className="mp-badge" title={`Translated from ${translatedFrom}`}>
          <span className="mp-badge-text">Translated</span>
        </span>
      )}
    </span>
  );
}

export function RatingInline({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null || count <= 0) return <span className="mp-meta">No ratings yet</span>;
  return (
    <span className="mp-meta mp-rating" role="img" aria-label={ratingAriaLabel(rating, count)}>
      <StarIcon />
      <span aria-hidden="true">{ratingValue(rating)}</span>
    </span>
  );
}

export function PackageCard({ item }: { item: CatalogItem }) {
  const [installs, setInstalls] = useState(item.installs);
  const headingId = `pkg-${item.id}`;
  return (
    <article className="mp-card" aria-labelledby={headingId}>
      <div className="mp-card-top">
        <span className="mp-kind-icon">
          <KindIcon kind={item.type} />
        </span>
        <span className="mp-pill">{kindLabel(item.type)}</span>
        <PackageBadges verified={item.verified} translatedFrom={item.translatedFrom} />
      </div>
      <div className="mp-card-head">
        <h2 id={headingId} className="mp-card-title">
          <a href={surfaceUrl('marketplace', `/${encodeURIComponent(item.id)}`)}>{item.name}</a>
        </h2>
        <p className="mp-publisher">by {item.publisher}</p>
      </div>
      <p className="mp-card-desc">{item.description}</p>
      {item.tags.length > 0 && (
        <ul className="mp-tags" role="list" aria-label="Tags">
          {item.tags.map((t) => (
            <li key={t}>
              <a className="mp-tag" href={surfaceUrl('marketplace', `/${catalogSearch(parseCatalogQuery({}), { tag: t })}`)}>
                {t}
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="mp-card-foot">
        <RatingInline rating={item.rating} count={item.ratingCount} />{' '}
        <span className="mp-meta">{formatInstalls(installs)}</span>{' '}
        <InstallButton pkg={item} onCounted={() => setInstalls((n) => n + 1)} />
      </div>
    </article>
  );
}
