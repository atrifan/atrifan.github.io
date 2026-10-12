/** /gigs/docs/admin-qa: the Admin QA MCP, for Tulzo admins only (noindex). */
import { CodeBlock } from './CodeBlock';

const TOOLS: Array<[string, string]> = [
  ['qa_queue_list', 'Submissions waiting for QA (default status awaiting_qa): contract, job, provider → customer, price, commission, customer total, submitted_at, attempt.'],
  ['qa_submission_get', 'The contract version, the approved spec and acceptance criteria, both parties’ plans, the QA checks the customer paid for, the steering history and earlier attempts.'],
  ['qa_credentials_get', 'Repo URL, pinned commit_sha, the decrypted read-only PAT and a short-lived review key for /api/chat. Every call is audited; refused once the PAT is purged.'],
  ['qa_mark', 'Record the verdict: validated, requires_changes or rejected. A reason is required for requires_changes and rejected. Revokes the review key.'],
];

export function AdminQaDocs({ mcpUrl }: { mcpUrl: string }) {
  return (
    <div className="page gigs-page">
      <header className="gigs-head">
        <p className="eyebrow">Admin docs</p>
        <h1 className="gigs-title">Admin QA MCP</h1>
        <p className="gigs-lede">Review submissions with your own agent. Only Tulzo admins can list or call these tools.</p>
      </header>
      <article className="gigs-doc">
        <section aria-labelledby="admin-url">
          <h2 id="admin-url">Connect</h2>
          <p>
            Server URL: <code>{mcpUrl}</code> (on the hub, not on gigs.).
          </p>
          <p>It uses the same Clerk OAuth sign-in as the Jobs MCP. After sign-in it checks admin rights; others get an error and no tools.</p>
          <CodeBlock label="Admin QA MCP URL" code={mcpUrl} />
          <CodeBlock label="Claude Code" code={`claude mcp add --transport http tulzo-admin-qa ${mcpUrl}`} />
        </section>
        <section aria-labelledby="admin-tools">
          <h2 id="admin-tools">Tools</h2>
          {TOOLS.map(([name, text]) => (
            <div key={name} className="gigs-tool">
              <h3>{name}</h3>
              <p>{text}</p>
            </div>
          ))}
        </section>
        <section aria-labelledby="admin-flow">
          <h2 id="admin-flow">Review flow</h2>
          <ol>
            <li>
              <code>qa_queue_list</code>, pick the oldest submission.
            </li>
            <li>
              <code>qa_submission_get</code> for the spec and the checks paid for.
            </li>
            <li>
              <code>qa_credentials_get</code>, clone the pinned commit on your own machine, review it. Model calls go through <code>/api/chat</code> with the
              review key, so they are paid from the customer&apos;s QA reserve.
            </li>
            <li>
              <code>qa_mark</code> with the verdict, the reason and a short report.
            </li>
          </ol>
          <p>Never run submitted code on Tulzo infrastructure, and never share the PAT or the review key.</p>
        </section>
      </article>
    </div>
  );
}
