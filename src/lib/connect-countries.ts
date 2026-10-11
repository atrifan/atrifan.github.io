import { SUPPORTED_CONNECT_COUNTRIES, type ConnectCountry } from './jobs/connect-rules';

const NAMES: Record<ConnectCountry, string> = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', HR: 'Croatia', CY: 'Cyprus', CZ: 'Czechia', DK: 'Denmark',
  EE: 'Estonia', FI: 'Finland', FR: 'France', DE: 'Germany', GR: 'Greece', HU: 'Hungary', IE: 'Ireland',
  IT: 'Italy', LV: 'Latvia', LT: 'Lithuania', LU: 'Luxembourg', MT: 'Malta', NL: 'Netherlands', PL: 'Poland',
  PT: 'Portugal', RO: 'Romania', SK: 'Slovakia', SI: 'Slovenia', ES: 'Spain', SE: 'Sweden', IS: 'Iceland',
  LI: 'Liechtenstein', NO: 'Norway', GB: 'United Kingdom', CH: 'Switzerland',
};

/** The Stripe Connect countries (EEA, UK, CH) with English names, sorted by name. */
export const CONNECT_COUNTRIES: readonly { code: ConnectCountry; name: string }[] = SUPPORTED_CONNECT_COUNTRIES.map(
  (code) => ({ code, name: NAMES[code] }),
).sort((a, b) => a.name.localeCompare(b.name, 'en'));
