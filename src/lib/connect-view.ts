/**
 * What the hub profile's Stripe Connect card shows for a `GET /api/connect/status`
 * response. Pure.
 */

export type ConnectCardStatus = 'none' | 'pending' | 'restricted' | 'enabled' | 'disabled';
export type ConnectAction = 'link' | 'continue' | 'dashboard' | null;
export type ConnectTone = 'neutral' | 'warning' | 'success' | 'danger';

export interface ConnectCard {
  status: ConnectCardStatus;
  label: string;
  tone: ConnectTone;
  description: string;
  action: ConnectAction;
}

const CARDS: Record<ConnectCardStatus, Omit<ConnectCard, 'status'>> = {
  none: {
    label: 'Not linked',
    tone: 'neutral',
    description: 'Link a Stripe account to start bidding. Stripe asks for your identity and bank details; it takes a few minutes.',
    action: 'link',
  },
  pending: {
    label: 'Onboarding not finished',
    tone: 'warning',
    description: 'You started linking Stripe but did not finish. Continue where you left off.',
    action: 'continue',
  },
  restricted: {
    label: 'Action needed',
    tone: 'warning',
    description: 'Stripe needs more information before it can send payouts. Continue on Stripe to see what is missing.',
    action: 'continue',
  },
  enabled: {
    label: 'Payouts enabled',
    tone: 'success',
    description: 'You can bid on gigs and get paid. Manage payouts and bank details in your Stripe dashboard.',
    action: 'dashboard',
  },
  disabled: {
    label: 'Disabled by Stripe',
    tone: 'danger',
    description: 'Stripe has disabled this account, so it cannot receive payouts. Contact support if you think this is a mistake.',
    action: null,
  },
};

const isStatus = (v: unknown): v is ConnectCardStatus => typeof v === 'string' && v in CARDS;

export function connectCard(view: { connect_status?: string | null; connected?: boolean } | null | undefined): ConnectCard {
  let status: ConnectCardStatus = isStatus(view?.connect_status) ? view!.connect_status as ConnectCardStatus : 'none';
  // An account exists but Stripe has not reported on it yet.
  if (status === 'none' && view?.connected === true) status = 'pending';
  return { status, ...CARDS[status] };
}

export type ConnectReturn = 'return' | 'refresh' | null;

/** The `?connect=` value Stripe sends the user back with. */
export function connectReturnParam(value: string | null | undefined): ConnectReturn {
  return value === 'return' || value === 'refresh' ? value : null;
}

export function connectNotice(param: ConnectReturn, status: ConnectCardStatus): string | null {
  if (param === 'return') {
    return `Thanks for finishing with Stripe. ${status === 'enabled' ? 'Payouts are enabled.' : 'Stripe may need a moment to check your details.'}`;
  }
  if (param === 'refresh') return 'Your Stripe link expired. Continue where you left off.';
  return null;
}
