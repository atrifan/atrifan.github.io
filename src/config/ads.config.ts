/**
 * Google AdSense Configuration
 * 
 * INSTRUCTIONS:
 * 1. Sign up for Google AdSense at https://www.google.com/adsense
 * 2. Get your Publisher ID (format: ca-pub-XXXXXXXXXXXXXXXX)
 * 3. Create ad units in your AdSense dashboard
 * 4. Replace the values below with your actual IDs
 */

export const ADS_CONFIG = {
  // Your Google AdSense Publisher ID
  publisherId: 'ca-pub-7299057534028491',

  // Ad Unit Slot IDs - Created in AdSense dashboard
  slots: {
    // Homepage ads
    homeHero: '3908062551',
    homeFooter: '2008657523',

    // CUT page ads
    cutTop: '1990322133',
    cutResults: '7655735873',
    cutFooter: '3517180317',

    // STACK page ads
    stackTop: '8364158792',
    stackResults: '9878558629',
    stackFooter: '7679786607',

    // WHEN page ads
    whenTop: '2750893556',
    whenFooter: '1433942458',

    // TAP page ads
    tapTop: '1791011581',
    tapFooter: '1948947773',

    // LUCK page ads
    luckTop: '4415329015',
    luckResults: '4327699107',
    luckFooter: '3102247343',

    // MATCH page ads
    matchTop: '4991889997',
    matchResults: '2146234808',
    matchFooter: '9777312817',
  },

  // Enable/disable ads (useful for development)
  enabled: true,

  // Test mode - shows placeholder ads instead of real ones
  testMode: import.meta.env.DEV,
};

/**
 * Get the full ad client string
 */
export const getAdClient = (): string => ADS_CONFIG.publisherId;

/**
 * Check if ads should be displayed
 */
export const shouldShowAds = (): boolean => ADS_CONFIG.enabled;

