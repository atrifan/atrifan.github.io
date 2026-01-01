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

  // Ad Unit Slot IDs
  // Create these in your AdSense dashboard and replace with actual IDs
  slots: {
    // Top banner ad (horizontal, appears at top of pages)
    topBanner: '1234567890',

    // Bottom banner ad (horizontal, appears at bottom of pages)
    bottomBanner: '6677889900',

    // Side banner ad (vertical, appears on desktop sidebar)
    sideBanner: '0987654321',

    // In-content ads (horizontal, appears between content sections)
    inContent1: '1122334455',
    inContent2: '5544332211',

    // Footer banner ad (horizontal, appears at bottom)
    footerBanner: '9988776655',

    // Home page specific ads
    homeHero: '1111111111',
    homeTools: '2222222222',
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

