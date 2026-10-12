import { describe, expect, it } from 'vitest';
import { connectCard, connectNotice, connectReturnParam } from '@/src/lib/connect-view';

describe('connectCard', () => {
  it('maps each Connect status to a label, tone and action', () => {
    expect(connectCard({ connect_status: 'none', connected: false })).toMatchObject({ status: 'none', label: 'Not linked', tone: 'neutral', action: 'link' });
    expect(connectCard({ connect_status: 'pending', connected: true })).toMatchObject({ status: 'pending', label: 'Onboarding not finished', tone: 'warning', action: 'continue' });
    expect(connectCard({ connect_status: 'restricted', connected: true })).toMatchObject({ status: 'restricted', label: 'Action needed', tone: 'warning', action: 'continue' });
    expect(connectCard({ connect_status: 'enabled', connected: true })).toMatchObject({ status: 'enabled', label: 'Payouts enabled', tone: 'success', action: 'dashboard' });
    expect(connectCard({ connect_status: 'disabled', connected: true })).toMatchObject({ status: 'disabled', label: 'Disabled by Stripe', tone: 'danger', action: null });
  });

  it('every state explains itself', () => {
    for (const s of ['none', 'pending', 'restricted', 'enabled', 'disabled']) {
      expect(connectCard({ connect_status: s, connected: s !== 'none' }).description.length).toBeGreaterThan(20);
    }
  });

  it('no data or an unknown status is "none"', () => {
    expect(connectCard(null).status).toBe('none');
    expect(connectCard(undefined).status).toBe('none');
    expect(connectCard({ connect_status: 'weird' }).status).toBe('none');
    expect(connectCard({}).status).toBe('none');
  });

  it('an account that exists but reports "none" is still being onboarded', () => {
    expect(connectCard({ connect_status: 'none', connected: true }).status).toBe('pending');
  });
});

describe('connectReturnParam', () => {
  it('accepts return and refresh only', () => {
    expect(connectReturnParam('return')).toBe('return');
    expect(connectReturnParam('refresh')).toBe('refresh');
    expect(connectReturnParam('other')).toBeNull();
    expect(connectReturnParam('')).toBeNull();
    expect(connectReturnParam(null)).toBeNull();
  });
});

describe('connectNotice', () => {
  it('thanks the user on return and says whether payouts are on', () => {
    expect(connectNotice('return', 'enabled')).toBe('Thanks for finishing with Stripe. Payouts are enabled.');
    expect(connectNotice('return', 'pending')).toBe(
      'Thanks for finishing with Stripe. Stripe may need a moment to check your details.',
    );
  });

  it('explains an expired link', () => {
    expect(connectNotice('refresh', 'pending')).toBe('Your Stripe link expired. Continue where you left off.');
  });

  it('says nothing without a return param', () => {
    expect(connectNotice(null, 'enabled')).toBeNull();
  });
});
