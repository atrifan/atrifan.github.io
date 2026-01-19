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
    homeTop: '3908062551',
    homeHero: '3908062551',
    homeSectionSeparator: '3908062551', // Between category sections
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

    // RANK page ads
    rankTop: '8760578767',
    rankResults: '5178564580',
    rankFooter: '2895182025',

    // BRAIN page ads (IQ Test)
    brainTop: '7831474627',
    brainResults: '3836389298',
    brainFooter: '6377958007',

    // VIBE page ads (Cat/Dog Quiz)
    vibeTop: '1730274161',
    vibeResults: '8087798954',
    vibeFooter: '1254797299',

    // CYCLE page ads (Period & Fertility Calculator)
    cycleTop: '7896227263',
    cycleResults: '8705572595',
    cycleFooter: '8952984604',

    // RISK page ads (Trading Risk Calculator)
    riskTop: '7912539132',
    riskResults: '4846218639',
    riskFooter: '6186386313',

    // BLOOD page ads (Blood Donation & Compatibility Calculator)
    bloodTop: '4959034746',
    bloodResults: '3908062551',
    bloodFooter: '2008657523',

    // PRICING page ads
    pricingTop: '6996372276',
    pricingFooter: '2643367756',

    // DASHBOARD page ads
    dashboardTop: '2779099121',
    dashboardFooter: '5852835087',

    // DOCS page ads
    docsHeader: '7221401854',
    docsFooter: '5908320187',

    // MCP Creator page ads
    mcpComposerTop: '7221401854',
    mcpComposerBottom: '5908320187',

    // Swagger Import page ads (uses same slots as MCP Creator)
    swaggerImportTop: '7221401854',
    swaggerImportBottom: '5908320187',

    // GraphQL Import page ads
    graphqlImportTop: '7221401854',
    graphqlImportBottom: '5908320187',

    // MCP Server Import page ads
    mcpImportTop: '7221401854',
    mcpImportBottom: '5908320187',

    // A2A Agent Import page ads
    agentImportTop: '7221401854',
    agentImportBottom: '5908320187',

    // AI Chat page ads
    chatTop: '7221401854',
    chatBottom: '5908320187',
    chatInputArea: '5908320187', // Above the chat input textarea

    // AI Automation page ads
    automationTop: '7221401854',
    automationBottom: '5908320187',

    // Generic tool page ads (for new AI tools)
    toolTop: '7221401854',
    toolBottom: '5908320187',

    // ECLIPSE page ads (Eclipse Finder)
    eclipseTop: '7221401854',
    eclipseResults: '5908320187',
    eclipseFooter: '2816426440',

    // Side ads (desktop only) - Left side
    sideLeftHorizontalTop: '2816426440',
    sideLeftVerticalMiddle: '2194459973',
    sideLeftHorizontalBottom: '1971098699',

    // Side ads (desktop only) - Right side
    sideRightHorizontalTop: '7416842979',
    sideRightVerticalMiddle: '9554075240',
    sideRightHorizontalBottom: '6103761301',
  },

  // Enable/disable ads (useful for development)
  enabled: true,

  // Test mode - shows placeholder ads instead of real ones
  // Set to false to test real ad containers locally (Google won't serve actual ads on localhost)
  testMode: false,
};

/**
 * Get the full ad client string
 */
export const getAdClient = (): string => ADS_CONFIG.publisherId;

/**
 * Check if ads should be displayed
 */
export const shouldShowAds = (): boolean => ADS_CONFIG.enabled;

