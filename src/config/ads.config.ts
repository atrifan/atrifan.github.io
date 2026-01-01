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

    // SLEEP page ads
    sleepTop: '8572876503',
    sleepResults: '4936883827',
    sleepFooter: '5946713168',

    // AGE page ads
    ageTop: '9077462900',
    ageResults: '3984918325',
    ageFooter: '5971937350',

    // STACK page ads
    stackTop: '8364158792',
    stackResults: '9878558629',
    stackFooter: '7679786607',

    // TIP page ads
    tipTop: '3464020051',
    tipResults: '2150938388',
    tipFooter: '1540564295',

    // PERCENT page ads
    percentTop: '4658855687',
    percentResults: '5152506244',
    percentFooter: '5288237616',

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

    // DAYS page ads
    daysTop: '9719610676',
    daysResults: '2480264969',
    daysFooter: '5563569788',

    // ZONE page ads
    zoneTop: '1213261230',
    zoneResults: '6409747593',
    zoneFooter: '3783584259',

    // CONVERT page ads
    convertTop: '8684557141',
    convertResults: '8900179562',
    convertFooter: '8854101629',

    // NAMES page ads
    namesTop: '7371475478',
    namesResults: '6114234123',
    namesFooter: '2470502587',

    // FLIP page ads
    flipTop: '6227938283',
    flipResults: '4801152458',
    flipFooter: '3432230461',

    // SPIN page ads
    spinTop: '4250488112',
    spinResults: '4960934556',
    spinFooter: '4914856613',

    // DECIDE page ads
    decideTop: '3154202322',
    decideResults: '8885891210',
    decideFooter: '1624324772',

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

