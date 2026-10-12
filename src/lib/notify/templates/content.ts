import type { NotificationType, Payload } from '../types.ts';
import { appUrl } from '../urls.ts';
import { oneLine, type EmailContent } from './layout.ts';

/** Per-event copy. Short, friendly, one action each. */

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

function clip(text: string, max = 600): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const jobUrl = (p: { url?: string; jobId: string }) => p.url ?? appUrl('gigs', `/jobs/${encodeURIComponent(p.jobId)}`);
const roomUrl = (p: { url?: string; contractId: string }, tab?: string) =>
  p.url ?? appUrl('gigs', `/contracts/${encodeURIComponent(p.contractId)}${tab ? `?tab=${tab}` : ''}`);
const profileUrl = (p: { url?: string }, section: string) => p.url ?? appUrl('hub', `/profile#${section}`);

type Builders = { [T in NotificationType]: (p: Payload<T>) => Omit<EmailContent, 'subject'> & { subject: string } };

const builders: Builders = {
  job_posted: (p) => ({
    subject: `Your job is live: ${p.jobTitle}`,
    preheader: 'Agents can now see it and send bids.',
    heading: 'Your job is posted',
    paragraphs: [`"${p.jobTitle}" is live. Agents can now see it and send you bids. We'll email you when the first ones arrive.`],
    cta: { label: 'View your job', url: jobUrl(p) },
  }),
  bid_received: (p) => ({
    subject: `New bid on ${p.jobTitle}`,
    preheader: `${p.bidderName} bid ${formatMoney(p.amountCents, p.currency)}.`,
    heading: 'You have a new bid',
    paragraphs: [`${p.bidderName} sent a bid on "${p.jobTitle}".`],
    details: [
      ['Bidder', p.bidderName],
      ['Amount', formatMoney(p.amountCents, p.currency)],
    ],
    cta: { label: 'Compare bids', url: jobUrl(p) },
  }),
  bid_accepted: (p) => ({
    subject: `Your bid was accepted: ${p.jobTitle}`,
    preheader: 'The client picked your bid.',
    heading: 'Your bid was accepted',
    paragraphs: [`Good news: the client accepted your ${formatMoney(p.amountCents, p.currency)} bid on "${p.jobTitle}". Work can start once payment is confirmed.`],
    cta: { label: 'Open the job', url: jobUrl(p) },
  }),
  contract_created: (p) => ({
    subject: `Contract created: ${p.jobTitle}`,
    preheader: `You and ${p.counterpartyName} have a contract.`,
    heading: 'Your contract is ready',
    paragraphs: [`A contract for "${p.jobTitle}" is in place with ${p.counterpartyName}.`],
    details: [
      ['With', p.counterpartyName],
      ['Total', formatMoney(p.amountCents, p.currency)],
    ],
    cta: { label: 'View contract', url: jobUrl(p) },
  }),
  payment_confirmed: (p) => ({
    subject: `Payment confirmed: ${p.jobTitle}`,
    preheader: `${formatMoney(p.amountCents, p.currency)} is held safely until delivery.`,
    heading: 'Payment confirmed',
    paragraphs: [`We received ${formatMoney(p.amountCents, p.currency)} for "${p.jobTitle}". It's held until the work is delivered and accepted.`],
    cta: { label: 'Open the job room', url: jobUrl(p) },
  }),
  steering_awaiting_approval: (p) => ({
    subject: `Your input is needed: ${p.jobTitle}`,
    preheader: `${p.requestedBy} asked a question.`,
    heading: 'A steering request needs your answer',
    paragraphs: [`${p.requestedBy} needs a decision on "${p.jobTitle}" before continuing:`],
    quote: clip(p.summary),
    cta: { label: 'Review request', url: jobUrl(p) },
  }),
  scope_change_awaiting_approval: (p) => ({
    subject: `Scope change to approve: ${p.jobTitle}`,
    preheader: `${p.requestedBy} proposed a change.`,
    heading: 'A scope change needs your approval',
    paragraphs: [`${p.requestedBy} proposed a change to "${p.jobTitle}":`],
    quote: clip(p.summary),
    details:
      p.priceDeltaCents === undefined || p.priceDeltaCents === 0
        ? undefined
        : [
            [
              'Price change',
              `${p.priceDeltaCents > 0 ? '+' : '−'}${formatMoney(Math.abs(p.priceDeltaCents), p.currency)}`,
            ],
          ],
    cta: { label: 'Review change', url: jobUrl(p) },
  }),
  submission_received: (p) => ({
    subject: `Work submitted: ${p.jobTitle}`,
    preheader: `${p.providerName} submitted the work. QA is next.`,
    heading: 'Work was submitted',
    paragraphs: [`${p.providerName} submitted the work for "${p.jobTitle}". It goes through independent QA next, and we'll let you know the verdict.`],
    cta: { label: 'View submission', url: jobUrl(p) },
  }),
  qa_verdict: (p) => {
    const verdict = {
      pass: { word: 'passed', heading: 'QA passed', line: `The work for "${p.jobTitle}" passed independent QA.` },
      fail: { word: 'failed', heading: 'QA did not pass', line: `The work for "${p.jobTitle}" did not pass independent QA.` },
      needs_changes: {
        word: 'needs changes',
        heading: 'QA asked for changes',
        line: `Independent QA checked the work for "${p.jobTitle}" and found a few things to fix.`,
      },
    }[p.verdict];
    return {
      subject: `QA ${verdict.word}: ${p.jobTitle}`,
      preheader: verdict.line,
      heading: verdict.heading,
      paragraphs: [verdict.line],
      quote: p.summary ? clip(p.summary) : undefined,
      cta: { label: 'See the QA report', url: jobUrl(p) },
    };
  },
  delivery_ready: (p) => ({
    subject: `Delivery ready: ${p.jobTitle}`,
    preheader: 'Your delivery is ready to review.',
    heading: 'Your delivery is ready',
    paragraphs: [`The work for "${p.jobTitle}" passed QA and is ready for you. Review it and accept it when you're happy.`],
    cta: { label: 'Review delivery', url: jobUrl(p) },
  }),
  auto_accept_reminder: (p) => ({
    subject: `Reminder: ${p.jobTitle} auto-accepts soon`,
    preheader: `It will be accepted automatically on ${formatDate(p.autoAcceptAt)}.`,
    heading: 'Delivery auto-accepts soon',
    paragraphs: [
      `The delivery for "${p.jobTitle}" will be accepted automatically on ${formatDate(p.autoAcceptAt)}, and the payment released.`,
      'If something is wrong, review it or open a dispute before then.',
    ],
    cta: { label: 'Review delivery', url: jobUrl(p) },
  }),
  dispute_opened: (p) => ({
    subject: `Dispute opened: ${p.jobTitle}`,
    preheader: `${p.openedBy} opened a dispute.`,
    heading: 'A dispute was opened',
    paragraphs: [
      `${p.openedBy} opened a dispute on "${p.jobTitle}". Payment stays on hold while it's reviewed.`,
    ],
    quote: p.reason ? clip(p.reason) : undefined,
    cta: { label: 'View dispute', url: jobUrl(p) },
  }),
  dispute_resolved: (p) => ({
    subject: `Dispute resolved: ${p.jobTitle}`,
    preheader: 'The dispute has a decision.',
    heading: 'The dispute is resolved',
    paragraphs: [`The dispute on "${p.jobTitle}" has been resolved. The decision:`],
    quote: clip(p.outcome),
    cta: { label: 'View details', url: jobUrl(p) },
  }),
  payout_sent: (p) => ({
    subject: `Payout sent: ${formatMoney(p.amountCents, p.currency)}`,
    preheader: 'It should reach your account in a few business days.',
    heading: 'Your payout is on its way',
    paragraphs: [
      `We sent ${formatMoney(p.amountCents, p.currency)}${p.jobTitle ? ` for "${p.jobTitle}"` : ''} to your connected Stripe account. It usually arrives within a few business days.`,
    ],
    cta: { label: 'View payouts', url: profileUrl(p, 'payouts') },
  }),
  review_received: (p) => ({
    subject: `New ${p.rating}-star review from ${p.reviewerName}`,
    preheader: p.comment ? clip(p.comment, 120) : `${p.reviewerName} left you a review.`,
    heading: 'You got a new review',
    paragraphs: [
      `${p.reviewerName} left you a review${p.jobTitle ? ` for "${p.jobTitle}"` : ''}.`,
    ],
    quote: p.comment ? clip(p.comment) : undefined,
    details: [['Rating', `${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)} (${p.rating}/5)`]],
    cta: { label: 'See your reviews', url: profileUrl(p, 'reviews') },
  }),
  review_requested: (p) => ({
    subject: `How did it go? Review ${p.counterpartyName}`,
    preheader: `Leave a review for "${p.jobTitle}".`,
    heading: 'Leave a review',
    paragraphs: [
      `"${p.jobTitle}" is done. A short review of ${p.counterpartyName} helps everyone on Tulzo pick who to work with.`,
    ],
    cta: { label: 'Write a review', url: p.url ?? appUrl('gigs', `/contracts/${encodeURIComponent(p.contractId)}/delivery#review`) },
  }),
  progress_update: (p) => ({
    subject: `Progress on ${p.jobTitle}`,
    preheader: p.percentComplete !== undefined ? `About ${p.percentComplete}% done.` : 'Your provider posted an update.',
    heading: 'New progress update',
    paragraphs: [`Your provider posted an update on "${p.jobTitle}":`],
    quote: clip(p.summary),
    details: p.percentComplete !== undefined ? [['Progress', `${p.percentComplete}%`]] : undefined,
    cta: { label: 'Open the job room', url: roomUrl(p) },
  }),
  milestone_completed: (p) => ({
    subject: `Milestone done: ${p.milestoneTitle}`,
    preheader: `"${p.milestoneTitle}" is done on ${p.jobTitle}.`,
    heading: 'A milestone is done',
    paragraphs: [`Your provider marked "${p.milestoneTitle}" as done on "${p.jobTitle}".`],
    cta: { label: 'See the milestones', url: roomUrl(p, 'milestones') },
  }),
  package_installed: (p) => ({
    subject: `New install of ${p.packageName}`,
    preheader: 'Someone installed your package.',
    heading: 'Your package was installed',
    paragraphs: [`Someone installed "${p.packageName}"${p.version ? ` (version ${p.version})` : ''}. Installs are anonymous counts.`],
    cta: { label: 'See install activity', url: p.url ?? appUrl('marketplace', '/publisher/activity') },
  }),
  package_approved: (p) => ({
    subject: `${p.packageName} is live in the marketplace`,
    preheader: 'Your package passed review.',
    heading: 'Your package is approved',
    paragraphs: [`"${p.packageName}" passed review and is now listed in the marketplace.`],
    cta: { label: 'View your package', url: p.url ?? appUrl('marketplace', `/${encodeURIComponent(p.packageId)}`) },
  }),
  package_rejected: (p) => ({
    subject: `${p.packageName} wasn't approved`,
    preheader: 'Your package needs changes before it can be listed.',
    heading: "Your package wasn't approved",
    paragraphs: [`"${p.packageName}" wasn't approved for the marketplace. You can publish a new version with the changes.`],
    quote: p.reason ? clip(p.reason) : undefined,
    cta: { label: 'Open your packages', url: p.url ?? appUrl('marketplace', '/publish') },
  }),
  submission_awaiting_qa: (p) => ({
    subject: `Submission awaiting QA: ${p.jobTitle}`,
    preheader: `${p.providerName} submitted work for review.`,
    heading: 'A submission is waiting for QA',
    paragraphs: [`${p.providerName} submitted "${p.jobTitle}" and it is waiting in the QA queue.`],
    cta: { label: 'Open the QA queue', url: p.url ?? appUrl('hub', '/admin/qa') },
  }),
};

export function buildContent<T extends NotificationType>(type: T, payload: Payload<T>): EmailContent {
  const build = builders[type] as (p: Payload<T>) => EmailContent;
  const content = build(payload);
  return { ...content, subject: oneLine(content.subject).slice(0, 110) };
}
