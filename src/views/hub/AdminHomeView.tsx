import { CopyUrl } from '@/src/components/admin/CopyUrl';
import type { AdminCard } from '@/src/lib/admin-home/cards';

/** Admin home (hub /admin): one card per admin area with its key number, and the admin QA MCP. */
export function AdminHomeView({ cards, mcpUrl, mcpDocsUrl }: { cards: AdminCard[]; mcpUrl: string; mcpDocsUrl: string }) {
  return (
    <div className="page">
      <header className="account-header">
        <h1>Admin</h1>
        <p className="muted">What is waiting, and where to work on it.</p>
      </header>

      <ul role="list" className="admin-grid">
        {cards.map((c) => (
          <li key={c.area}>
            <article className="admin-card" aria-labelledby={`admin-card-${c.area}`} data-attention={c.attention ? 'true' : undefined}>
              <h2 id={`admin-card-${c.area}`} className="admin-card-title">
                <a href={c.href}>{c.title}</a>
              </h2>
              <p className="admin-card-value">{c.value}</p>
              <p className="admin-card-caption">{c.caption}</p>
            </article>
          </li>
        ))}
        <li className="admin-grid-wide">
          <article className="admin-card" aria-labelledby="admin-card-mcp">
            <h2 id="admin-card-mcp" className="admin-card-title">
              Admin QA MCP
            </h2>
            <p className="admin-card-caption">Review the QA queue from an MCP client.</p>
            <CopyUrl url={mcpUrl} label="Copy MCP URL" />
            <a href={mcpDocsUrl} className="admin-card-more">
              Admin QA MCP docs
            </a>
          </article>
        </li>
      </ul>
    </div>
  );
}
