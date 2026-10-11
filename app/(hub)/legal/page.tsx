import type { Metadata } from 'next';

const DESCRIPTION = "Tulzo's privacy policy, cookie policy and terms and conditions.";

export const metadata: Metadata = {
  title: 'Legal',
  description: DESCRIPTION,
  alternates: { canonical: '/legal' },
  openGraph: { title: 'Legal | Tulzo', description: DESCRIPTION, url: '/legal' },
};

const DOCS = [
  {
    href: 'https://www.iubenda.com/privacy-policy/11077306',
    title: 'Privacy policy',
    desc: 'What personal data we collect, why, and your rights under the GDPR.',
  },
  {
    href: 'https://www.iubenda.com/privacy-policy/11077306/cookie-policy',
    title: 'Cookie policy',
    desc: 'Which cookies we use. Analytics and ads only run after you agree; change your choice with "Cookie settings" in the footer.',
  },
  {
    href: 'https://www.iubenda.com/terms-and-conditions/11077306',
    title: 'Terms and conditions',
    desc: 'The rules for using Tulzo, including plans, credits and gigs.',
  },
];

export default function Legal() {
  return (
    <div className="page account-page">
      <header className="account-header">
        <h1>Legal</h1>
        <p className="muted">Our policies are hosted by iubenda.</p>
      </header>
      <ul className="link-list" role="list">
        {DOCS.map((d) => (
          <li key={d.title}>
            <a href={d.href} rel="noopener" className="link-card">
              <strong>{d.title}</strong>
            </a>
            <span className="muted">{d.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
