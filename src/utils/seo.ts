/**
 * SEO Configuration for all Tulzo tools
 */

export interface SEOConfig {
  title: string;
  description: string;
  keywords: string[];
  ogTitle?: string;
  ogDescription?: string;
}

export const SEO_DATA: Record<string, SEOConfig> = {
  home: {
    title: 'Tulzo - 20+ Free Online Tools & Calculators | Health, Finance, Fun & More',
    description: 'Free online tools: sleep calculator, weight loss planner, blood type compatibility, IQ test, period tracker, tip calculator, coin flip, wheel spinner, trading risk calculator, timezone converter, decision maker & more. 100% free, no signup, works with AI assistants via MCP.',
    keywords: ['free online tools', 'calculators', 'IQ test', 'cat or dog person quiz', 'sleep calculator', 'tip calculator', 'coin flip', 'random wheel', 'age calculator', 'timezone converter', 'body percentile', 'decision maker', 'personality quiz', 'blood type calculator', 'period tracker', 'weight loss calculator', 'trading calculator', 'MCP server', 'AI tools'],
  },
  sleep: {
    title: 'Sleep Cycle Calculator - Find Best Bedtime & Wake Time | Tulzo',
    description: 'Free sleep cycle calculator for adults, teens & children. Calculate optimal bedtime and wake times based on 90-minute sleep cycles. Wake up refreshed, not groggy.',
    keywords: ['sleep calculator', 'sleep cycle calculator', 'bedtime calculator', 'wake up time', 'REM sleep', 'sleep cycles', 'best time to sleep', 'sleep schedule', 'children sleep calculator'],
  },
  unique: {
    title: 'How Unique Are You? – Rarity Percentile Calculator | Tulzo',
    description: 'Discover how rare your traits are! Calculate your uniqueness percentile based on height, weight, eye color, hair & ethnicity. Find out: 1 in how many people share your combination.',
    keywords: ['how unique am I', 'rarity calculator', 'uniqueness percentile', 'how rare am I', '1 in how many people', 'trait rarity calculator', 'physical uniqueness', 'body percentile'],
  },
  names: {
    title: 'Random Name Generator - Human, Pet & Fantasy Names | Tulzo',
    description: 'Free random name generator for humans, dogs, cats & other pets. Generate first names, full names, or fantasy character names. Perfect for writers, gamers & new pet owners.',
    keywords: ['name generator', 'random name generator', 'pet name generator', 'dog names', 'cat names', 'fantasy name generator', 'character name generator', 'baby name ideas'],
  },
  tip: {
    title: 'Tip Calculator - Calculate Tip & Split Bill Easily | Tulzo',
    description: 'Free tip calculator. Calculate tip amount, split bills between friends, and see total per person. Supports custom tip percentages from 10% to 30%.',
    keywords: ['tip calculator', 'gratuity calculator', 'bill splitter', 'split bill calculator', 'restaurant tip', 'how much to tip', 'tip percentage'],
  },
  flip: {
    title: 'Coin Flip - Heads or Tails Random Coin Toss | Tulzo',
    description: 'Free online coin flip simulator. Flip a virtual coin for heads or tails. Perfect for making quick decisions, settling disputes, or games. Animated & fun!',
    keywords: ['coin flip', 'flip a coin', 'heads or tails', 'coin toss', 'random coin flip', 'virtual coin', 'online coin flip'],
  },
  spin: {
    title: 'Spin the Wheel - Custom Random Wheel Spinner | Tulzo',
    description: 'Free customizable wheel spinner. Add your own options and spin to decide! Perfect for games, giveaways, classroom activities, and random selections.',
    keywords: ['spin the wheel', 'wheel spinner', 'random wheel', 'prize wheel', 'decision wheel', 'name picker wheel', 'random picker'],
  },
  decide: {
    title: 'Decision Maker - Random Choice Picker | Tulzo',
    description: 'Free decision maker tool. Enter your options and let us pick randomly. Perfect for choosing restaurants, movies, activities, or any tough decision.',
    keywords: ['decision maker', 'random choice picker', 'random decision', 'what should I do', 'random picker', 'choice generator'],
  },
  age: {
    title: 'Age Calculator - Calculate Exact Age in Years, Months, Days | Tulzo',
    description: 'Free age calculator. Calculate your exact age in years, months, days, hours & minutes. Find days until next birthday, zodiac sign & life statistics.',
    keywords: ['age calculator', 'how old am I', 'birthday calculator', 'exact age', 'age in days', 'days until birthday', 'zodiac sign calculator'],
  },
  zone: {
    title: 'Time Zone Converter - World Clock & Time Difference | Tulzo',
    description: 'Free timezone converter. Convert time between any cities worldwide. See current time in multiple zones, calculate time differences for meetings & calls.',
    keywords: ['timezone converter', 'time zone calculator', 'world clock', 'time difference', 'convert time zones', 'international time', 'meeting time planner'],
  },
  days: {
    title: 'Day of Week Calculator - Find What Day Any Date Falls On | Tulzo',
    description: 'Free day of week calculator. Find what day of the week any date falls on - past, present, or future. Calculate days between dates & leap years.',
    keywords: ['day of week calculator', 'what day was', 'date calculator', 'days between dates', 'leap year calculator', 'calendar calculator'],
  },
  tap: {
    title: 'Click Counter & Tally Counter - Count Anything | Tulzo',
    description: 'Free online click counter and tally counter. Count anything with a tap or click. Features multiple counters, lap timer, and history tracking.',
    keywords: ['click counter', 'tally counter', 'tap counter', 'counter app', 'lap counter', 'count clicks', 'online counter'],
  },
  percent: {
    title: 'Percentage Calculator - Calculate Percentages Easily | Tulzo',
    description: 'Free percentage calculator. Calculate percentages, percentage change, percentage of a number, and more. Simple and fast percentage calculations.',
    keywords: ['percentage calculator', 'percent calculator', 'calculate percentage', 'percentage change', 'percent of number', 'discount calculator'],
  },
  luck: {
    title: 'Luck Tester - Test Your Luck Today | Tulzo',
    description: 'Free luck tester. Test your luck with fun random games. See your luck score and compare with others. Just for fun!',
    keywords: ['luck tester', 'test my luck', 'lucky number', 'fortune tester', 'luck meter', 'how lucky am I'],
  },
  match: {
    title: 'Love Calculator - Compatibility Test | Tulzo',
    description: 'Free love calculator. Enter two names and see your compatibility percentage. Fun relationship compatibility test for entertainment.',
    keywords: ['love calculator', 'compatibility test', 'love match', 'relationship calculator', 'name compatibility', 'love percentage'],
  },
  when: {
    title: 'Date Calculator - Day of Week, Zodiac Sign & Calendar Info | Tulzo',
    description: 'Free date calculator. Find the day of week for any date, get zodiac sign, week number, day of year, quarter, and leap year info. Calculate days between dates.',
    keywords: ['date calculator', 'day of week calculator', 'zodiac sign by date', 'what day was', 'week of year', 'day of year', 'leap year calculator', 'calendar calculator', 'date info'],
  },
  convert: {
    title: 'Unit Converter - Length, Weight, Temperature & More | Tulzo',
    description: 'Free unit converter. Convert between metric and imperial units. Length, weight, temperature, volume, and more. Fast and accurate conversions.',
    keywords: ['unit converter', 'metric converter', 'length converter', 'weight converter', 'temperature converter', 'cm to inches', 'kg to lbs'],
  },
  stack: {
    title: 'Budget Calculator - Track Income & Expenses | Tulzo',
    description: 'Free budget calculator. Track income, expenses, and savings. Plan your monthly budget and reach financial goals. Simple money management.',
    keywords: ['budget calculator', 'expense tracker', 'money calculator', 'savings calculator', 'budget planner', 'financial calculator'],
  },
  cut: {
    title: 'Weight Loss Calculator - Calorie Deficit & Goal Planner | Tulzo',
    description: 'Free weight loss calculator. Calculate daily calories, calorie deficit, and time to reach your goal weight. Includes fasting plans and BMI.',
    keywords: ['weight loss calculator', 'calorie calculator', 'calorie deficit', 'BMI calculator', 'diet calculator', 'how many calories'],
  },
  brain: {
    title: 'Free IQ Test - Quick Intelligence Quiz with Score & Percentile | Tulzo',
    description: 'Take a free quick IQ test online! 15 questions covering pattern recognition, logic, math, and verbal reasoning. Get your estimated IQ score and percentile instantly. For entertainment only.',
    keywords: ['IQ test', 'free IQ test', 'intelligence test', 'IQ quiz', 'brain test', 'logic test', 'pattern recognition', 'IQ score', 'IQ percentile', 'cognitive test'],
  },
  vibe: {
    title: 'Cat or Dog Person Quiz - Personality Test | Tulzo',
    description: 'Are you a cat person or dog person? Take this fun 10-question personality quiz to find out! Discover your pet personality type with instant results.',
    keywords: ['cat or dog person', 'cat person quiz', 'dog person quiz', 'pet personality test', 'cat vs dog', 'personality quiz', 'which pet am I', 'animal personality'],
  },
  cycle: {
    title: 'Period Calculator - Menstrual Cycle & Fertility Tracker | Tulzo',
    description: 'Free period calculator. Track your menstrual cycle, predict next period, and estimate fertile window. Simple cycle tracking for women.',
    keywords: ['period calculator', 'menstrual cycle calculator', 'fertility calculator', 'ovulation calculator', 'period tracker', 'cycle tracker', 'next period'],
  },
  risk: {
    title: 'Position Size Calculator - Trading Risk Management | Tulzo',
    description: 'Free position size calculator for traders. Calculate optimal position size based on risk percentage, stop loss, and account size. Manage trading risk effectively.',
    keywords: ['position size calculator', 'trading calculator', 'risk management', 'stop loss calculator', 'forex calculator', 'stock position size', 'risk reward'],
  },
  blood: {
    title: 'Blood Type Calculator - Volume, Donation, Compatibility & Baby Blood | Tulzo',
    description: 'Free blood calculator: Calculate your blood volume using Nadler\'s formula, check donation eligibility, blood type compatibility for transfusions, and predict your baby\'s blood type. Includes Rh incompatibility warnings.',
    keywords: ['blood type calculator', 'blood volume calculator', 'blood donation eligibility', 'blood compatibility chart', 'baby blood type calculator', 'Rh incompatibility', 'blood type genetics', 'who can I donate blood to', 'universal donor', 'blood transfusion compatibility', 'Nadler formula'],
  },
  eclipse: {
    title: 'Eclipse Finder - Next Solar & Lunar Eclipse Dates & Times | Tulzo',
    description: 'Find upcoming solar and lunar eclipses visible from your location. Get dates, times, visibility info, countdown timers, and best viewing locations for total, partial, and annular eclipses through 2030.',
    keywords: ['eclipse finder', 'next solar eclipse', 'next lunar eclipse', 'eclipse dates', 'eclipse visibility', 'total solar eclipse', 'blood moon', 'eclipse countdown', 'when is the next eclipse', 'eclipse 2025', 'eclipse 2026', 'annular eclipse', 'partial eclipse'],
  },
  dashboard: {
    title: 'Dashboard - Manage Your MCP Server & API Keys | Tulzo',
    description: 'Manage your Tulzo MCP server, API keys, and tool configurations. Connect AI assistants like Claude, Cursor, and Windsurf to access 20+ tools.',
    keywords: ['tulzo dashboard', 'mcp server', 'api keys', 'ai tools', 'claude mcp', 'cursor mcp', 'windsurf mcp', 'tool management'],
  },
  mcpComposer: {
    title: 'MCP Creator - Create Custom MCP Servers | Tulzo',
    description: 'Create custom MCP servers with only the tools you need. Build focused tool sets for better AI performance and fewer collisions.',
    keywords: ['mcp creator', 'custom mcp server', 'mcp tools', 'ai tool selection', 'mcp configuration', 'tool builder'],
  },
  swaggerImport: {
    title: 'Import Swagger/OpenAPI - Create REST API Tools | Tulzo MCP',
    description: 'Transform any REST API into AI-ready MCP tools. Import OpenAPI 3.0 or Swagger 2.0 specifications to automatically generate tools that AI assistants like Claude, Cursor, and Windsurf can use. Supports paste or URL import with authentication.',
    keywords: ['swagger import', 'openapi', 'rest api tools', 'mcp server', 'api integration', 'swagger to mcp', 'openapi to mcp', 'ai api tools', 'claude api', 'cursor api'],
  },
  graphqlImport: {
    title: 'Import GraphQL Schema - Create GraphQL Tools | Tulzo MCP',
    description: 'Turn your GraphQL API into AI-powered MCP tools. Import schemas via introspection to automatically create query and mutation tools for AI assistants. Connect to any GraphQL endpoint with custom headers and authentication.',
    keywords: ['graphql import', 'graphql schema', 'graphql tools', 'mcp server', 'graphql integration', 'graphql to mcp', 'introspection', 'ai graphql', 'claude graphql'],
  },
  graphqlEdit: {
    title: 'Manage GraphQL API - Edit Operations & Environments | Tulzo MCP',
    description: 'Manage your imported GraphQL API. Edit operation descriptions, configure environments, and customize tools for your MCP server.',
    keywords: ['graphql management', 'graphql operations', 'graphql environments', 'mcp tools', 'graphql configuration'],
  },
  mcpImport: {
    title: 'Import MCP Server - Connect External MCP Tools | Tulzo',
    description: 'Connect to external MCP servers and import their tools. Your AI assistant will proxy requests to the external server. Supports authentication and custom headers.',
    keywords: ['mcp import', 'mcp server', 'mcp proxy', 'external mcp', 'mcp tools', 'model context protocol', 'ai tools', 'mcp integration'],
  },
  agentImport: {
    title: 'Import A2A Agent - Connect Agent-to-Agent Protocol Agents | Tulzo',
    description: 'Connect to A2A (Agent-to-Agent) protocol agents and import them as tools. Automatically discover agent cards from well-known paths. Your AI assistant can communicate with other AI agents.',
    keywords: ['a2a import', 'agent to agent', 'a2a protocol', 'ai agent', 'agent card', 'mcp agent', 'ai communication', 'agent integration'],
  },
  pricing: {
    title: 'Pricing - Free & Pro Plans | Tulzo',
    description: 'Tulzo pricing plans. Free tier with all tools, Pro plan with unlimited API calls, priority support, and advanced features.',
    keywords: ['tulzo pricing', 'mcp pricing', 'ai tools pricing', 'free plan', 'pro plan', 'subscription'],
  },
  docs: {
    title: 'Documentation - MCP Server Setup & API Reference | Tulzo',
    description: 'Complete documentation for Tulzo MCP server. Setup guides for Claude, Cursor, Windsurf, and other AI assistants. API reference and tool documentation.',
    keywords: ['tulzo docs', 'mcp documentation', 'api reference', 'setup guide', 'claude setup', 'cursor setup', 'mcp integration'],
  },
  chat: {
    title: 'AI Chat - Multi-Model Chat Assistant | Tulzo',
    description: 'Chat with multiple AI models including GPT-5, Claude 4, Gemini 3, Llama 3.1, and more. Access all your Tulzo tools through natural conversation. Save chat history and connect external MCP servers.',
    keywords: ['AI chat', 'multi-model chat', 'GPT-5', 'Claude 4', 'Gemini 3', 'Llama 3.1', 'AI assistant', 'chatbot', 'MCP chat', 'tool chat', 'AI conversation'],
    ogTitle: 'Tulzo AI Chat - Talk to Multiple AI Models',
    ogDescription: 'Chat with GPT-5, Claude 4, Gemini 3, and more. Access 20+ tools through natural conversation.',
  },
  automation: {
    title: 'AI Automation - No-Code Workflow Builder | Tulzo',
    description: 'Build powerful automations using natural language. Describe what you want to automate and AI suggests the right tools. Schedule recurring workflows, connect MCP servers, and save automation templates.',
    keywords: ['AI automation', 'workflow automation', 'no-code automation', 'natural language automation', 'scheduled tasks', 'MCP automation', 'tool automation', 'workflow builder', 'automation templates'],
    ogTitle: 'Tulzo AI Automation - Build Workflows with Natural Language',
    ogDescription: 'Describe your automation in plain English. AI suggests tools and builds your workflow automatically.',
  },
  ragExplorer: {
    title: 'RAG Explorer – AI Knowledge Base Search | Tulzo',
    description: 'Explore your knowledge bases using AI-powered semantic search. Navigate through documents and find relevant content instantly with embedding-based similarity matching.',
    keywords: ['RAG explorer', 'knowledge base search', 'semantic search', 'document search', 'AI search', 'embedding search', 'vector search', 'content similarity', 'document explorer'],
    ogTitle: 'Tulzo RAG Explorer - AI-Powered Knowledge Base Search',
    ogDescription: 'Explore your knowledge bases with AI-powered semantic search. Navigate and find relevant content instantly.',
  },
};

/**
 * Apply SEO meta tags to the current page
 */
export const applySEO = (pageKey: string): void => {
  const seo = SEO_DATA[pageKey];
  if (!seo) return;

  // Title
  document.title = seo.title;

  // Meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', seo.description);

  // Meta keywords
  let metaKeywords = document.querySelector('meta[name="keywords"]');
  if (!metaKeywords) {
    metaKeywords = document.createElement('meta');
    metaKeywords.setAttribute('name', 'keywords');
    document.head.appendChild(metaKeywords);
  }
  metaKeywords.setAttribute('content', seo.keywords.join(', '));

  // Open Graph
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', seo.ogTitle || seo.title);

  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', seo.ogDescription || seo.description);

  // Twitter
  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute('content', seo.ogTitle || seo.title);

  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute('content', seo.ogDescription || seo.description);
};

