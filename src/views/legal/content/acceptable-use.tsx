/**
 * /legal/acceptable-use.
 *
 * Draft: review with a qualified lawyer before relying on it.
 */
import type { LegalFacts } from '@/src/lib/legal/facts';
import { DocLink } from '../links';
import type { LegalDoc } from '../types';

export function acceptableUseDoc(f: LegalFacts): LegalDoc {
  void f;
  return {
    slug: 'acceptable-use',
    title: 'Acceptable use policy',
    description: "What you can't do on Tulzo: illegal content, malware, abuse of the API and MCP, scraping, IP infringement and fraud.",
    summary: [
      'Use Tulzo lawfully and respect other people and their rights.',
      'No illegal content, malware, fraud or IP infringement, in jobs, offers, packages or messages.',
      "Don't abuse the API or MCP server, and don't scrape Tulzo.",
      'Breaking this policy can lead to removal of content, suspension or closing of your account.',
    ],
    sections: [
      {
        id: 'content',
        title: 'Prohibited content',
        body: (
          <ul>
            <li>Anything illegal, including child sexual abuse material, terrorist content and illegal hate speech.</li>
            <li>Harassment, threats, or content that incites violence.</li>
            <li>Other people&apos;s personal data shared without a legal basis.</li>
            <li>Content that infringes copyright, trademarks, patents or trade secrets.</li>
            <li>Deceptive content, impersonation and spam.</li>
          </ul>
        ),
      },
      {
        id: 'jobs',
        title: 'Prohibited jobs and offers',
        body: (
          <ul>
            <li>Writing or spreading malware, ransomware, spyware or exploits for use against systems you don&apos;t own or have permission to test.</li>
            <li>Breaking into accounts or systems, evading security, licence or copy protection.</li>
            <li>Scraping or automated access that breaks a site&apos;s terms or the law.</li>
            <li>Fraud, fake reviews, phishing, money laundering or evading sanctions.</li>
            <li>Academic or exam cheating, and work that breaks someone else&apos;s contract or rights.</li>
            <li>Arranging payment outside Tulzo for work found on Tulzo.</li>
          </ul>
        ),
      },
      {
        id: 'packages',
        title: 'Prohibited packages',
        body: (
          <ul>
            <li>Malware, backdoors, hidden data collection or tracking.</li>
            <li>Packages that do something different from what their description says.</li>
            <li>Code or content you don&apos;t have the right to publish, or that breaks its licence.</li>
            <li>Packages that collect credentials or secrets without telling the user clearly.</li>
          </ul>
        ),
      },
      {
        id: 'api-mcp',
        title: 'API and MCP',
        body: (
          <ul>
            <li>Use your own API key; don&apos;t share, sell or publish it.</li>
            <li>Don&apos;t overload Tulzo, get around rate limits or plan limits, or probe for vulnerabilities without permission.</li>
            <li>Don&apos;t use the API or MCP server to do anything this policy forbids, including through an agent.</li>
          </ul>
        ),
      },
      {
        id: 'scraping',
        title: 'Scraping',
        body: (
          <p>
            Don&apos;t scrape, crawl or copy Tulzo&apos;s pages, listings or user data in bulk, except search engines following
            our robots.txt, and the documented API used within its limits.
          </p>
        ),
      },
      {
        id: 'enforcement',
        title: 'What we do about it',
        body: (
          <>
            <p>
              We can remove content, hide packages, cancel jobs, revoke API keys, and suspend or close accounts that break this
              policy. We tell you what we did and why, and you can challenge the decision.
            </p>
            <p>
              To report something, use the <DocLink slug="complaints" hash="form">complaints form</DocLink>.
            </p>
          </>
        ),
      },
    ],
  };
}
