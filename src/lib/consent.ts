/**
 * Cookie consent (iubenda). Analytics and ads only load after consent. Pure.
 *
 * iubenda purposes: 1 necessary, 2 functionality, 3 experience, 4 measurement (GA),
 * 5 marketing (AdSense). With perPurposeConsent the preference carries `purposes`;
 * otherwise only the global `consent` flag.
 */

export interface ConsentState {
  analytics: boolean;
  ads: boolean;
}

const MEASUREMENT = '4';
const MARKETING = '5';

export function consentFromPreference(pref: unknown): ConsentState {
  if (!pref || typeof pref !== 'object') return { analytics: false, ads: false };
  const { consent, purposes } = pref as { consent?: unknown; purposes?: unknown };
  if (purposes && typeof purposes === 'object') {
    const p = purposes as Record<string, unknown>;
    return { analytics: p[MEASUREMENT] === true, ads: p[MARKETING] === true };
  }
  const all = consent === true;
  return { analytics: all, ads: all };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const IUBENDA_SITE_ID = 3856498;
export const IUBENDA_COOKIE_POLICY_ID = 11077306;

/**
 * `_iub.csConfiguration`: a slim bar along the bottom (no overlay, no title, small text)
 * naming this surface's domain. These local options override the iubenda dashboard's
 * site config (cs.iubenda.com/cookie-solution/confs/js/<id>.js), except the banner text:
 * with TCF enabled there, iubenda shows its fixed TCF wording and ignores `content`. The footer's "Cookie settings" link reopens it, so there
 * is no floating button over the content.
 */
export function iubendaConfig({ siteHost, consentDomain }: { siteHost: string; consentDomain?: string }) {
  const host = escapeHtml(siteHost);
  const shared = (consentDomain ?? '').trim();
  return {
    // One consent for tulzo.online and every subdomain.
    ...(shared ? { localConsentDomain: shared } : {}),
    siteId: IUBENDA_SITE_ID,
    cookiePolicyId: IUBENDA_COOKIE_POLICY_ID,
    lang: 'en',
    storage: { useSiteId: true },
    perPurposeConsent: true,
    floatingPreferencesButtonDisplay: false,
    banner: {
      position: 'bottom',
      backgroundOverlay: false,
      showTitle: false,
      closeButtonDisplay: false,
      acceptButtonDisplay: true,
      rejectButtonDisplay: true,
      customizeButtonDisplay: true,
      explicitWithdrawal: true,
      listPurposes: false,
      showPurposesToggles: false,
      // The iubenda site record still says tulzo.vercel.app; this names the real domain.
      ownerName: siteHost,
      fontSizeBody: '14px',
      content: `${host} uses cookies for analytics and ads only if you agree. See the %{cookie_policy_link}.`,
    },
  };
}
