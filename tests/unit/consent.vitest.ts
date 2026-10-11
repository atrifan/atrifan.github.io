import { describe, expect, it } from 'vitest';
import { consentFromPreference, iubendaConfig } from '@/src/lib/consent';

describe('consentFromPreference', () => {
  it('per-purpose: measurement (4) allows analytics, marketing (5) allows ads', () => {
    expect(consentFromPreference({ consent: true, purposes: { 1: true, 4: true, 5: false } })).toEqual({ analytics: true, ads: false });
    expect(consentFromPreference({ consent: false, purposes: { '4': false, '5': true } })).toEqual({ analytics: false, ads: true });
    expect(consentFromPreference({ purposes: { 4: true, 5: true } })).toEqual({ analytics: true, ads: true });
  });

  it('purposes that are not an object fall back to the global consent', () => {
    expect(consentFromPreference({ consent: true, purposes: 1 })).toEqual({ analytics: true, ads: true });
    expect(consentFromPreference({ consent: true, purposes: 'all' })).toEqual({ analytics: true, ads: true });
  });

  it('a purpose has to be exactly true', () => {
    expect(consentFromPreference({ purposes: { 4: 'true', 5: 1 } })).toEqual({ analytics: false, ads: false });
  });

  it('without purposes, the global consent decides', () => {
    expect(consentFromPreference({ consent: true })).toEqual({ analytics: true, ads: true });
    expect(consentFromPreference({ consent: false })).toEqual({ analytics: false, ads: false });
    expect(consentFromPreference({ consent: 'yes' })).toEqual({ analytics: false, ads: false });
  });

  it('nothing known means no tracking', () => {
    expect(consentFromPreference(undefined)).toEqual({ analytics: false, ads: false });
    expect(consentFromPreference(null)).toEqual({ analytics: false, ads: false });
    expect(consentFromPreference('x')).toEqual({ analytics: false, ads: false });
    expect(consentFromPreference({ purposes: null, consent: true })).toEqual({ analytics: true, ads: true });
  });
});

describe('iubendaConfig', () => {
  const cfg = iubendaConfig({ siteHost: 'tulzo.online' });

  it('keeps the site and cookie policy ids, per-purpose consent and English', () => {
    expect(cfg).toMatchObject({ siteId: 3856498, cookiePolicyId: 11077306, lang: 'en', perPurposeConsent: true });
    expect(cfg.storage).toEqual({ useSiteId: true });
    expect(cfg.banner.explicitWithdrawal).toBe(true);
  });

  it('is a small bottom bar without an overlay, and never a centered modal', () => {
    expect(cfg.banner.position).toBe('bottom');
    expect(cfg.banner.backgroundOverlay).toBe(false);
    expect(cfg.banner.showTitle).toBe(false);
    expect(cfg.banner.fontSizeBody).toBe('14px');
    expect(cfg.banner.acceptButtonDisplay).toBe(true);
    expect(cfg.banner.rejectButtonDisplay).toBe(true);
    expect(cfg.banner.customizeButtonDisplay).toBe(true);
    expect(cfg.banner.closeButtonDisplay).toBe(false);
  });

  it('names the surface domain, not tulzo.vercel.app', () => {
    expect(cfg.banner.content).toContain('tulzo.online');
    expect(JSON.stringify(cfg)).not.toContain('vercel.app');
    expect(iubendaConfig({ siteHost: 'gigs.tulzo.online' }).banner.content).toContain('gigs.tulzo.online');
  });

  it('names the domain as the owner and hides the purpose toggles from the bar (they stay in "Learn more")', () => {
    expect(cfg.banner.ownerName).toBe('tulzo.online');
    expect(cfg.banner.showPurposesToggles).toBe(false);
    expect(cfg.banner.listPurposes).toBe(false);
  });

  it('shares consent across subdomains only when a root domain is given', () => {
    expect(iubendaConfig({ siteHost: 'gigs.tulzo.online', consentDomain: 'tulzo.online' }).localConsentDomain).toBe('tulzo.online');
    expect('localConsentDomain' in cfg).toBe(false);
    expect('localConsentDomain' in iubendaConfig({ siteHost: 'x', consentDomain: undefined })).toBe(false);
    expect(iubendaConfig({ siteHost: 'x', consentDomain: ' tulzo.online ' }).localConsentDomain).toBe('tulzo.online');
    expect('localConsentDomain' in iubendaConfig({ siteHost: 'x', consentDomain: '  ' })).toBe(false);
  });

  it('escapes the host into the banner HTML', () => {
    expect(iubendaConfig({ siteHost: '<b>x</b>' }).banner.content).toMatch(/^&lt;b&gt;x&lt;\/b&gt; uses cookies/);
    expect(iubendaConfig({ siteHost: 'a&"b' }).banner.content).toMatch(/^a&amp;&quot;b uses/);
  });

  it('no floating button over the content: the footer "Cookie settings" link reopens the preferences', () => {
    expect(cfg.floatingPreferencesButtonDisplay).toBe(false);
  });
});
