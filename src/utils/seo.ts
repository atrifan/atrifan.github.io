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
    title: 'Tulzo - Free Online Tools & Calculators | Health, Finance, Utilities, Quizzes',
    description: 'Free online tools: IQ test, cat or dog person quiz, sleep calculator, tip calculator, coin flip, wheel spinner, age calculator, timezone converter & more. 100% free, no signup required.',
    keywords: ['free online tools', 'calculators', 'IQ test', 'cat or dog person quiz', 'sleep calculator', 'tip calculator', 'coin flip', 'random wheel', 'age calculator', 'timezone converter', 'body percentile', 'decision maker', 'personality quiz'],
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
    title: 'Countdown Timer - Days Until Any Event | Tulzo',
    description: 'Free countdown timer. Count down days, hours, minutes until any event - holidays, birthdays, vacations, deadlines. Create custom countdowns.',
    keywords: ['countdown timer', 'days until', 'event countdown', 'holiday countdown', 'birthday countdown', 'deadline timer'],
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

