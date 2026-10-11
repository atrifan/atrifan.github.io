import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { categoryLabel, installMode, kindLabel } from '@/src/lib/marketplace/kinds';
import { catalogSearch, parseCatalogQuery } from '@/src/lib/marketplace/catalog-query';
import { ratingCountText, ratingValue } from '@/src/lib/marketplace/format';
import { cliInstallCommand, mcpTools, packagePermissions } from '@/src/lib/marketplace/install-plan';
import { serializeJsonLd, softwareApplicationJsonLd } from '@/src/lib/marketplace/json-ld';
import type { PackageDetail as Detail } from '@/src/lib/marketplace-service';
import { surfaceUrl } from '@/src/lib/surface-url';
import { DetailInstall, RatePackage } from './DetailClient';
import { KindIcon, StarIcon } from './KindIcon';
import { PackageBadges } from './PackageCard';

const DATE = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtDate = (iso: string) => DATE.format(new Date(iso));

/**
 * A package page: summary + install, the sanitised Markdown description (raw HTML is dropped and
 * unsafe link protocols are removed by react-markdown), tools and permissions for MCP servers and
 * A2A agents, the CLI install command, versions, ratings and reviews, and the publisher.
 */
export function PackageDetail({ detail, canonicalUrl }: { detail: Detail; canonicalUrl: string }) {
  const { item, versions, reviews } = detail;
  const target = { id: item.id, name: item.name, type: item.type, blobUrl: item.blobUrl, config: item.config };
  const mode = installMode(item.type);
  const tools = mode === 'mcp' ? mcpTools(item.config) : [];
  const permissions = packagePermissions(target);
  const cli = cliInstallCommand(target);
  const category = categoryLabel(item.category);
  const path = surfaceUrl('marketplace', `/${encodeURIComponent(item.id)}`);
  const versionList = versions.length > 0 ? versions : [{ version: item.version, changelog: null, created_at: item.updatedAt }];
  const written = reviews.filter((r) => r.review && r.review.trim());
  const jsonLd = softwareApplicationJsonLd(
    {
      name: item.name,
      description: item.description,
      type: item.type,
      version: item.version,
      publisher: item.publisher,
      rating: item.rating,
      ratingCount: item.ratingCount,
      updatedAt: item.updatedAt,
    },
    canonicalUrl,
  );

  return (
    <div className="page mp-page mp-detail">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="mp-breadcrumb">
        <a href={surfaceUrl('marketplace', '/')}>Marketplace</a>
        <span aria-hidden="true">/</span>
        <a href={surfaceUrl('marketplace', `/${catalogSearch(parseCatalogQuery({}), { kind: item.type })}`)}>{kindLabel(item.type)}</a>
      </nav>

      <header className="mp-detail-head">
        <span className="mp-kind-icon mp-kind-icon-lg">
          <KindIcon kind={item.type} size={30} />
        </span>
        <div className="mp-detail-titles">
          <div className="mp-card-top">
            <span className="mp-pill">{kindLabel(item.type)}</span>
            <PackageBadges verified={item.verified} translatedFrom={item.translatedFrom} />
          </div>
          <h1 className="mp-title">{item.name}</h1>
          <p className="mp-publisher">by {item.publisher}</p>
          <p className="mp-detail-summary">{item.description}</p>
          <p className="mp-detail-facts">
            {item.rating !== null && item.ratingCount > 0 ? (
              <span className="mp-meta mp-rating">
                <StarIcon />
                <span>{ratingValue(item.rating)}</span>
                <span className="mp-sep">·</span>
                <span>{ratingCountText(item.ratingCount)}</span>
              </span>
            ) : (
              <span className="mp-meta">No ratings yet</span>
            )}
            <span className="mp-meta">Version {item.version}</span>
          </p>
        </div>
        <DetailInstall pkg={target} installs={item.installs} />
      </header>

      <div className="mp-detail-body">
        <div className="mp-detail-main">
          <section aria-labelledby="mp-about" className="mp-section">
            <h2 id="mp-about" className="mp-h2">
              About
            </h2>
            <div className="mp-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                {item.longDescription || item.description}
              </ReactMarkdown>
            </div>
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
          </section>

          {mode === 'mcp' && tools.length > 0 && (
            <section aria-labelledby="mp-tools" className="mp-section">
              <h2 id="mp-tools" className="mp-h2">
                Tools
              </h2>
              <ul className="mp-list" role="list">
                {tools.map((t) => (
                  <li key={t.name}>
                    <code>{t.name}</code>
                    {t.description && <span className="muted"> — {t.description}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mode !== 'archive' && (
            <section aria-labelledby="mp-perms" className="mp-section">
              <h2 id="mp-perms" className="mp-h2">
                Permissions
              </h2>
              {permissions.length > 0 ? (
                <ul className="mp-list" role="list">
                  {permissions.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No extra access declared.</p>
              )}
            </section>
          )}

          {cli && (
            <section aria-labelledby="mp-cli" className="mp-section">
              <h2 id="mp-cli" className="mp-h2">
                Install from the command line
              </h2>
              <p className="muted">
                {mode === 'mcp' ? 'Add this server to Claude Code:' : 'Download the package archive:'}
              </p>
              <pre className="mp-code" tabIndex={0} aria-label="Command">
                <code>{cli}</code>
              </pre>
            </section>
          )}

          <section aria-labelledby="mp-reviews" className="mp-section">
            <h2 id="mp-reviews" className="mp-h2">
              Ratings and reviews
            </h2>
            <p className="mp-rating-summary">
              {item.rating !== null && item.ratingCount > 0 ? (
                <>
                  <span className="mp-rating-big">{ratingValue(item.rating)}</span>
                  <span className="muted">out of 5 · {ratingCountText(item.ratingCount)}</span>
                </>
              ) : (
                <span className="muted">No ratings yet</span>
              )}
            </p>
            <RatePackage packageId={item.id} packagePath={path} />
            {written.length > 0 && (
              <ul className="mp-reviews" role="list">
                {written.map((r, i) => (
                  <li key={i} className="mp-review">
                    <span className="mp-review-stars" aria-label={`${r.rating} out of 5`} role="img">
                      {'★'.repeat(r.rating)}
                      <span className="mp-review-stars-off">{'★'.repeat(5 - r.rating)}</span>
                    </span>
                    <p>{r.review}</p>
                    <time className="mp-meta" dateTime={r.created_at}>
                      {fmtDate(r.created_at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="mp-detail-side">
          <section aria-labelledby="mp-publisher" className="mp-side-card">
            <h2 id="mp-publisher" className="mp-h3">
              Publisher
            </h2>
            <p>{item.publisher}</p>
            <dl className="mp-facts">
              <dt>Published</dt>
              <dd>{fmtDate(item.createdAt)}</dd>
              <dt>Updated</dt>
              <dd>{fmtDate(item.updatedAt)}</dd>
              {category && (
                <>
                  <dt>Category</dt>
                  <dd>
                    <a href={surfaceUrl('marketplace', `/${catalogSearch(parseCatalogQuery({}), { category: item.category as never })}`)}>{category}</a>
                  </dd>
                </>
              )}
              {item.translatedFrom && (
                <>
                  <dt>Source</dt>
                  <dd>{item.translatedFrom}</dd>
                </>
              )}
            </dl>
          </section>
          <section aria-labelledby="mp-versions" className="mp-side-card">
            <h2 id="mp-versions" className="mp-h3">
              Versions
            </h2>
            <ol className="mp-versions" role="list">
              {versionList.map((v) => (
                <li key={v.version}>
                  <span className="mp-version">{v.version}</span>
                  <time className="mp-meta" dateTime={v.created_at}>
                    {fmtDate(v.created_at)}
                  </time>
                  {v.changelog && <span className="mp-meta mp-changelog">{v.changelog}</span>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
