-- Auto-generated tool definitions from tools-definitions.ts
-- Generated at: 2026-01-24T05:56:21.357Z

INSERT INTO tools (name, description, category, tool_type, has_widget, invoking_message, invoked_message, input_schema, output_schema, user_id) VALUES
  (
    'calculate_ideal_weight',
    'Calculate ideal weight using the Devine formula',
    'Health & Fitness',
    'NATIVE',
    true,
    'Calculating ideal weight...',
    'Ideal weight calculated',
    '{"type":"object","properties":{"height":{"type":"number","description":"Height in centimeters"},"sex":{"type":"string","enum":["male","female","other"],"description":"Biological sex"}},"required":["height","sex"]}'::jsonb,
    '{"type":"object","properties":{"idealWeight":{"type":"number","description":"Ideal weight in kg"},"formula":{"type":"string","description":"Formula used (Devine)"},"height":{"type":"number"},"gender":{"type":"string"}}}'::jsonb,
    NULL
  ),
  (
    'generate_weight_loss_plan',
    'Generate a complete weight loss plan with calorie targets and fasting recommendations',
    'Health & Fitness',
    'NATIVE',
    true,
    'Generating weight loss plan...',
    'Plan generated',
    '{"type":"object","properties":{"age":{"type":"number","description":"Age in years"},"sex":{"type":"string","enum":["male","female","other"]},"height":{"type":"number","description":"Height in centimeters"},"currentWeight":{"type":"number","description":"Current weight in kg"},"desiredWeight":{"type":"number","description":"Target weight in kg"},"timeToWeight":{"type":"number","description":"Weeks to reach goal (optional)"},"activityLevel":{"type":"string","enum":["sedentary","light","moderate","active","veryActive"]}},"required":["age","sex","height","currentWeight","desiredWeight"]}'::jsonb,
    '{"type":"object","properties":{"currentWeight":{"type":"number"},"targetWeight":{"type":"number"},"weeksToGoal":{"type":"number"},"dailyCalories":{"type":"number"},"weeklyWeightLoss":{"type":"number"},"bmr":{"type":"number"},"tdee":{"type":"number"}}}'::jsonb,
    NULL
  ),
  (
    'calculate_cycle',
    'Calculate menstrual cycle predictions including next period date, fertile window, ovulation date, and current cycle phase. Supports both simplified mode (average 28-day cycle) and advanced mode with custom cycle/period lengths.',
    'Health & Fitness',
    'NATIVE',
    true,
    'Calculating cycle predictions...',
    'Cycle predictions ready!',
    '{"type":"object","properties":{"date":{"type":"string","description":"Date of period in YYYY-MM-DD format. Example: \"2026-01-01\""},"isFirstDay":{"type":"boolean","description":"If true (default), date is first day of period. If false, date is last day of bleeding."},"simplified":{"type":"boolean","description":"If true, use simplified mode with average 28-day cycle and 5-day period. Ignores cycleLength and periodLength."},"cycleLength":{"type":"number","description":"Average cycle length in days (default: 28). Only used when simplified is false."},"periodLength":{"type":"number","description":"Average period length in days (default: 5). Only used when simplified is false."}},"required":["date"]}'::jsonb,
    '{"type":"object","properties":{"nextPeriodStart":{"type":"string","description":"Next period start date (YYYY-MM-DD)"},"nextPeriodEnd":{"type":"string","description":"Next period end date (YYYY-MM-DD)"},"ovulationDate":{"type":"string","description":"Predicted ovulation date (YYYY-MM-DD)"},"fertileWindowStart":{"type":"string","description":"Fertile window start date (YYYY-MM-DD)"},"fertileWindowEnd":{"type":"string","description":"Fertile window end date (YYYY-MM-DD)"},"currentDay":{"type":"number","description":"Current day in the cycle (1-based)"},"phase":{"type":"string","description":"Current phase: menstrual, follicular, ovulation, or luteal"},"daysUntilNextPeriod":{"type":"number","description":"Days until next period starts"},"cycleLength":{"type":"number","description":"Cycle length used for calculation"},"periodLength":{"type":"number","description":"Period length used for calculation"},"mode":{"type":"string","description":"\"simplified\" or \"advanced\""},"phaseInfo":{"type":"object","description":"Phase details with name, emoji, color, and description"}}}'::jsonb,
    NULL
  ),
  (
    'blood_calculator',
    'Blood calculator with three modes: "donation" (check donation eligibility), "compatibility" (blood type transfusion compatibility), "baby" (predict baby blood type from parents). Mode determines required fields - tool will error with missing fields for each mode.',
    'Health & Fitness',
    'NATIVE',
    true,
    'Calculating blood info...',
    'Blood calculation complete',
    '{"type":"object","properties":{"calculatorMode":{"type":"string","enum":["donation","compatibility","baby"],"description":"Calculator mode: \"donation\" for eligibility, \"compatibility\" for transfusion matching, \"baby\" for predicting baby blood type"},"age":{"type":"number","description":"Age in years (donation mode)"},"weight":{"type":"number","description":"Weight in kg (metric) or lbs (imperial) (donation mode)"},"height":{"type":"number","description":"Height in cm (metric only) (donation mode)"},"gender":{"type":"string","enum":["male","female"],"description":"Gender for blood volume calculation (donation mode)"},"unitSystem":{"type":"string","enum":["metric","imperial"],"description":"Unit system. Default: metric (donation mode)"},"heightFeet":{"type":"number","description":"Height feet component (imperial only) (donation mode)"},"heightInches":{"type":"number","description":"Height inches component (imperial only) (donation mode)"},"bloodType":{"type":"string","enum":["A","B","AB","O"],"description":"ABO blood type (compatibility mode)"},"rhFactor":{"type":"string","enum":["+","-"],"description":"Rh factor positive or negative (compatibility mode)"},"fatherBloodType":{"type":"string","enum":["A","B","AB","O"],"description":"Father''s ABO blood type (baby mode)"},"fatherRh":{"type":"string","enum":["+","-"],"description":"Father''s Rh factor (baby mode)"},"motherBloodType":{"type":"string","enum":["A","B","AB","O"],"description":"Mother''s ABO blood type (baby mode)"},"motherRh":{"type":"string","enum":["+","-"],"description":"Mother''s Rh factor (baby mode)"}},"required":["calculatorMode"]}'::jsonb,
    '{"type":"object","properties":{"calculatorMode":{"type":"string"},"eligible":{"type":"boolean"},"amount":{"type":"number"},"maxSafeAmount":{"type":"number"},"bloodVolume":{"type":"number"},"warnings":{"type":"array","items":{"type":"string"}},"tips":{"type":"array","items":{"type":"string"}},"fullBloodType":{"type":"string"},"canDonateTo":{"type":"array","items":{"type":"string"}},"canReceiveFrom":{"type":"array","items":{"type":"string"}},"isUniversalDonor":{"type":"boolean"},"isUniversalRecipient":{"type":"boolean"},"possibleTypes":{"type":"array","items":{"type":"object","properties":{"type":{"type":"string"},"percentage":{"type":"number"}}}},"rhIncompatibilityRisk":{"type":"boolean"},"rhWarning":{"type":"string"}}}'::jsonb,
    NULL
  ),
  (
    'calculate_tip',
    'Calculate tip amount and total bill. Supports two modes: "static" (provide tipPercentage directly) or "mood" (compute tip from serviceQuality, mood, and budgetSituation). If tipPercentage is not provided, mood mode is used automatically.',
    'Finance',
    'NATIVE',
    true,
    'Calculating tip...',
    'Tip calculated',
    '{"type":"object","properties":{"billAmount":{"type":"number","description":"Bill amount before tip (required)"},"tipPercentage":{"type":"number","description":"Tip percentage (e.g., 15, 18, 20). Required for static mode, ignored in mood mode."},"splitBetween":{"type":"number","description":"Number of people to split between (default: 1)"},"calculatorMode":{"type":"string","enum":["static","mood"],"description":"Calculator mode: \"static\" uses tipPercentage directly, \"mood\" computes from feelings. Default: \"static\" if tipPercentage provided, else \"mood\"."},"serviceQuality":{"type":"string","enum":["terrible","poor","okay","good","amazing"],"description":"How was the service? Used in mood mode. Default: \"okay\"."},"mood":{"type":"string","enum":["awful","meh","neutral","happy","great"],"description":"How are you feeling? Used in mood mode. Default: \"neutral\"."},"budgetSituation":{"type":"string","enum":["very_tight","tight","normal","comfortable","generous"],"description":"Budget situation. Used in mood mode. Default: \"normal\"."}},"required":["billAmount"]}'::jsonb,
    '{"type":"object","properties":{"billAmount":{"type":"number"},"tipPercentage":{"type":"number"},"tipAmount":{"type":"number"},"total":{"type":"number"},"perPerson":{"type":"number"},"splitBetween":{"type":"number"},"calculatorMode":{"type":"string"},"suggested":{"type":"boolean"}}}'::jsonb,
    NULL
  ),
  (
    'calculate_compound_interest',
    'Calculate compound interest growth over time',
    'Finance',
    'NATIVE',
    true,
    'Calculating compound interest...',
    'Interest calculated',
    '{"type":"object","properties":{"principal":{"type":"number","description":"Initial investment amount"},"rate":{"type":"number","description":"Annual interest rate (percentage)"},"time":{"type":"number","description":"Time period in years"},"compoundingFrequency":{"type":"string","enum":["annually","semi-annually","quarterly","monthly","daily"]},"monthlyContribution":{"type":"number","description":"Monthly contribution (optional)"}},"required":["principal","rate","time"]}'::jsonb,
    '{"type":"object","properties":{"finalAmount":{"type":"number"},"totalInterest":{"type":"number"},"totalContributions":{"type":"number"},"effectiveRate":{"type":"number"}}}'::jsonb,
    NULL
  ),
  (
    'calculate_position_size',
    'Calculate trading position size based on risk management. Supports 4 modes: riskOnly (get suggestions), riskAndSL (calculate quantity), riskAndQty (calculate stop loss), slAndQty (calculate risk %). Direction can be long (buy) or short (sell).',
    'Finance',
    'NATIVE',
    true,
    'Calculating position size...',
    'Position size ready',
    '{"type":"object","properties":{"mode":{"type":"string","enum":["riskOnly","riskAndSL","riskAndQty","slAndQty"],"description":"Calculation mode: riskOnly (suggest SL/Qty combos from risk%), riskAndSL (calc quantity from risk% + SL), riskAndQty (calc SL from risk% + quantity), slAndQty (calc risk% from SL + quantity)"},"capital":{"type":"number","description":"Total trading capital in currency"},"entryPrice":{"type":"number","description":"Entry price of the asset"},"direction":{"type":"string","enum":["long","short"],"description":"Trade direction: long (buy, expecting price to rise) or short (sell, expecting price to fall)"},"riskPercent":{"type":"number","description":"Risk percentage of capital (0-100). Required for riskOnly, riskAndSL, riskAndQty modes. Recommended: 1-2%"},"stopLossPrice":{"type":"number","description":"Stop loss price. Required for riskAndSL, slAndQty modes. Must be below entry for long, above entry for short"},"quantity":{"type":"number","description":"Number of units/shares. Required for riskAndQty, slAndQty modes"}},"required":["mode","capital","entryPrice","direction"]}'::jsonb,
    '{"type":"object","properties":{"mode":{"type":"string","description":"Calculation mode used"},"direction":{"type":"string","description":"Trade direction"},"calculatedField":{"type":"string","description":"Which field was calculated: suggestions, quantity, stopLoss, or riskPercent"},"riskPercent":{"type":"number","description":"Risk percentage of capital"},"riskAmount":{"type":"number","description":"Risk amount in currency"},"riskLabel":{"type":"string","description":"Risk assessment: Low Risk, Moderate Risk, or High Risk"},"stopLoss":{"type":"number","description":"Stop loss price"},"slDistance":{"type":"number","description":"Stop loss distance from entry in price"},"slDistancePercent":{"type":"number","description":"Stop loss distance as percentage"},"quantity":{"type":"number","description":"Position quantity/units"},"positionValue":{"type":"number","description":"Total position value (quantity * entryPrice)"},"takeProfits":{"type":"array","description":"Take profit levels at 1.5:1, 2:1, 3:1 risk:reward ratios"},"suggestions":{"type":"array","description":"Suggested positions (only in riskOnly mode)"}}}'::jsonb,
    NULL
  ),
  (
    'calculate_savings_plan',
    'Calculate a budget and savings plan. Supports two modes: (1) Goal mode - save until you reach a target amount, (2) Duration mode - save for a specific number of months. Optionally include compound interest from a savings account.',
    'Finance',
    'NATIVE',
    true,
    'Calculating savings plan...',
    'Savings plan ready',
    '{"type":"object","properties":{"monthlyIncome":{"type":"number","description":"Monthly net income (after taxes)"},"monthlyTaxes":{"type":"number","description":"Monthly taxes (set to 0 if using net income)"},"monthlyFixedExpenses":{"type":"number","description":"Fixed monthly expenses (rent, utilities, subscriptions)"},"currentSavings":{"type":"number","description":"Current savings amount"},"savingsMode":{"type":"string","enum":["goal","duration"],"description":"Mode: \"goal\" to reach a target amount, \"duration\" to save for X months"},"savingsGoal":{"type":"number","description":"Target savings amount (required if savingsMode is \"goal\")"},"savingsDurationMonths":{"type":"number","description":"Number of months to save (required if savingsMode is \"duration\")"},"intensity":{"type":"string","enum":["light","medium","aggressive"],"description":"Savings intensity: light (10%), medium (25%), aggressive (40%) of disposable income"},"currency":{"type":"string","enum":["USD","EUR","GBP","JPY","RON"]},"interestEnabled":{"type":"boolean","description":"Enable compound interest from savings account (optional)"},"interestRate":{"type":"number","description":"Annual interest rate as percentage, e.g., 5 for 5% (optional, requires interestEnabled)"},"compoundingFrequency":{"type":"string","enum":["yearly","monthly","daily"],"description":"How often interest compounds (optional, default: yearly)"}},"required":["monthlyIncome","monthlyFixedExpenses","currentSavings","intensity","currency"]}'::jsonb,
    '{"type":"object","properties":{"monthlySavings":{"type":"number","description":"Amount to save each month"},"monthsToGoal":{"type":"number","description":"Number of months in the plan"},"finalBalance":{"type":"number","description":"Final savings balance at end of plan"},"totalInterestEarned":{"type":"number","description":"Total interest earned (if interest enabled)"},"disposableIncome":{"type":"number","description":"Monthly disposable income after fixed expenses"},"savingsRate":{"type":"number","description":"Percentage of disposable income being saved"},"savingsMode":{"type":"string","description":"The savings mode used (goal or duration)"}}}'::jsonb,
    NULL
  ),
  (
    'calculate_age',
    'Calculate age from birthdate with detailed breakdown',
    'Date & Time',
    'NATIVE',
    true,
    'Calculating age...',
    'Age calculated',
    '{"type":"object","properties":{"birthDate":{"type":"string","description":"Birth date in YYYY-MM-DD format"}},"required":["birthDate"]}'::jsonb,
    '{"type":"object","properties":{"years":{"type":"number"},"months":{"type":"number"},"days":{"type":"number"},"totalDays":{"type":"number"},"nextBirthday":{"type":"string"},"daysUntilBirthday":{"type":"number"}}}'::jsonb,
    NULL
  ),
  (
    'zone_calculator',
    'Convert time between timezones. Supports UTC offsets (e.g., UTC+5, UTC-8) and major city timezones (e.g., America/New_York, Europe/London, Asia/Tokyo). Returns converted times with day change indicators.',
    'Date & Time',
    'NATIVE',
    true,
    'Converting timezone...',
    'Timezone converted',
    '{"type":"object","properties":{"time":{"type":"string","description":"Time in HH:MM format (24-hour), e.g., \"14:30\""},"fromTimezone":{"type":"string","enum":["UTC","UTC-12","UTC-11","UTC-10","UTC-9","UTC-8","UTC-7","UTC-6","UTC-5","UTC-4","UTC-3","UTC-2","UTC-1","UTC+1","UTC+2","UTC+3","UTC+4","UTC+5","UTC+5:30","UTC+5.5","UTC+6","UTC+7","UTC+8","UTC+9","UTC+10","UTC+11","UTC+12","America/New_York","America/Los_Angeles","America/Chicago","America/Denver","America/Toronto","America/Vancouver","America/Mexico_City","America/Sao_Paulo","Europe/London","Europe/Paris","Europe/Berlin","Europe/Rome","Europe/Madrid","Europe/Amsterdam","Europe/Bucharest","Europe/Moscow","Europe/Istanbul","Asia/Dubai","Asia/Kolkata","Asia/Bangkok","Asia/Singapore","Asia/Hong_Kong","Asia/Shanghai","Asia/Tokyo","Asia/Seoul","Australia/Sydney","Australia/Melbourne","Pacific/Auckland"],"description":"Source timezone. Use UTC offsets (UTC-5, UTC+8) or IANA timezone IDs (America/New_York, Europe/London, Asia/Tokyo)"},"toTimezones":{"type":"array","items":{"type":"string","enum":["UTC","UTC-12","UTC-11","UTC-10","UTC-9","UTC-8","UTC-7","UTC-6","UTC-5","UTC-4","UTC-3","UTC-2","UTC-1","UTC+1","UTC+2","UTC+3","UTC+4","UTC+5","UTC+5:30","UTC+5.5","UTC+6","UTC+7","UTC+8","UTC+9","UTC+10","UTC+11","UTC+12","America/New_York","America/Los_Angeles","America/Chicago","America/Denver","America/Toronto","America/Vancouver","America/Mexico_City","America/Sao_Paulo","Europe/London","Europe/Paris","Europe/Berlin","Europe/Rome","Europe/Madrid","Europe/Amsterdam","Europe/Bucharest","Europe/Moscow","Europe/Istanbul","Asia/Dubai","Asia/Kolkata","Asia/Bangkok","Asia/Singapore","Asia/Hong_Kong","Asia/Shanghai","Asia/Tokyo","Asia/Seoul","Australia/Sydney","Australia/Melbourne","Pacific/Auckland"]},"description":"Target timezones to convert to. Use UTC offsets or IANA timezone IDs"}},"required":["time","fromTimezone","toTimezones"]}'::jsonb,
    '{"type":"object","properties":{"sourceTime":{"type":"string","description":"Original time in HH:MM format"},"sourceTimezone":{"type":"string","description":"Source timezone ID"},"sourceCity":{"type":"string","description":"Source city name"},"conversions":{"type":"array","items":{"type":"object","properties":{"timezone":{"type":"string","description":"Target timezone ID"},"city":{"type":"string","description":"Target city name"},"time":{"type":"string","description":"Converted time in HH:MM format"},"offset":{"type":"number","description":"UTC offset of target timezone"},"offsetDiff":{"type":"number","description":"Offset difference from source"},"dayChange":{"type":"string","description":"Day change indicator (+1 day, -1 day, or empty)"}}}}}}'::jsonb,
    NULL
  ),
  (
    'calculate_countdown',
    'Calculate the number of days, weeks, and months until or since a specific date. Perfect for tracking upcoming events, anniversaries, deadlines, or calculating how long ago something happened.',
    'Date & Time',
    'NATIVE',
    true,
    'Counting the days...',
    'Countdown calculated!',
    '{"type":"object","properties":{"eventDate":{"type":"string","description":"Target date in YYYY-MM-DD format. Example: \"2026-12-25\" for Christmas 2026"},"eventName":{"type":"string","description":"Name of the event for display. Example: \"Christmas\", \"My Birthday\", \"Project Deadline\""}},"required":["eventDate"]}'::jsonb,
    '{"type":"object","properties":{"eventName":{"type":"string","description":"Name of the event"},"eventDate":{"type":"string","description":"Target date in YYYY-MM-DD format"},"days":{"type":"number","description":"Days until/since event (negative if past)"},"absoluteDays":{"type":"number","description":"Absolute number of days (always positive)"},"weeks":{"type":"number","description":"Number of complete weeks"},"months":{"type":"number","description":"Approximate number of months"},"isPast":{"type":"boolean","description":"Whether the event is in the past"},"isToday":{"type":"boolean","description":"Whether the event is today"},"direction":{"type":"string","description":"\"until\", \"since\", or \"today\""},"summary":{"type":"string","description":"Human-readable summary text"}}}'::jsonb,
    NULL
  ),
  (
    'when_date_info',
    'Get comprehensive information about a date including day of week, zodiac sign, time calculations from today (days, hours, minutes, weeks), and calendar info (day of year, week number, quarter, leap year).',
    'Date & Time',
    'NATIVE',
    true,
    'Analyzing date...',
    'Date info ready',
    '{"type":"object","properties":{"date":{"type":"string","description":"Date in YYYY-MM-DD format (required)"}},"required":["date"]}'::jsonb,
    '{"type":"object","properties":{"date":{"type":"string","description":"Input date in YYYY-MM-DD format"},"dayOfWeek":{"type":"string","description":"Full day name (e.g., Monday)"},"dayOfWeekShort":{"type":"string","description":"Short day name (e.g., Mon)"},"formattedDate":{"type":"string","description":"Human-readable date (e.g., January 15th, 2026)"},"message":{"type":"string","description":"Contextual message about the date"},"daysFromToday":{"type":"number","description":"Days from today (negative = past, positive = future)"},"isPast":{"type":"boolean"},"isFuture":{"type":"boolean"},"isToday":{"type":"boolean"},"totalHours":{"type":"number","description":"Total hours from today"},"totalMinutes":{"type":"number","description":"Total minutes from today"},"weeks":{"type":"number","description":"Weeks from today (rounded to 1 decimal)"},"dayOfYear":{"type":"number","description":"Day of year (1-366)"},"weekOfYear":{"type":"number","description":"Week of year (1-53)"},"quarter":{"type":"number","description":"Quarter of year (1-4)"},"isLeapYear":{"type":"boolean"},"zodiacSign":{"type":"string","description":"Zodiac sign for the date"}}}'::jsonb,
    NULL
  ),
  (
    'flip_tool',
    'Flip coins or roll dice. Use flipMode to select: "coin" for coin flips (heads/tails), "dice" for dice rolls.',
    'Fun & Games',
    'NATIVE',
    true,
    'Flipping...',
    'Result ready',
    '{"type":"object","properties":{"flipMode":{"type":"string","enum":["coin","dice"],"description":"Mode: \"coin\" for coin flip, \"dice\" for dice roll (default: coin)"},"count":{"type":"number","description":"Number of coins to flip or dice to roll (default: 1, max: 6 for dice, 100 for coins)"},"sides":{"type":"number","description":"Number of sides on dice (default: 6, only used in dice mode)"}},"required":[]}'::jsonb,
    '{"type":"object","properties":{"flipMode":{"type":"string","description":"Mode used: coin or dice"},"result":{"type":"string","description":"Single coin result (heads/tails)"},"results":{"type":"array","items":{"type":"string"},"description":"All coin flip results"},"headsCount":{"type":"number","description":"Number of heads (coin mode)"},"tailsCount":{"type":"number","description":"Number of tails (coin mode)"},"rolls":{"type":"array","items":{"type":"number"},"description":"All dice roll results"},"total":{"type":"number","description":"Sum of all dice rolls"},"sides":{"type":"number","description":"Number of sides on dice"},"count":{"type":"number","description":"Number of coins/dice used"}}}'::jsonb,
    NULL
  ),
  (
    'spin_wheel',
    'Spin a wheel to randomly select from custom options. Great for making decisions, picking winners, or choosing randomly between choices. Requires at least 2 options.',
    'Fun & Games',
    'NATIVE',
    true,
    'Spinning the wheel...',
    'The wheel has stopped!',
    '{"type":"object","properties":{"options":{"type":"array","items":{"type":"string"},"description":"List of options to spin between (minimum 2 required). Examples: [\"Pizza\", \"Burger\", \"Sushi\"] or [\"Yes\", \"No\", \"Maybe\"]"}},"required":["options"]}'::jsonb,
    '{"type":"object","properties":{"result":{"type":"string","description":"The winning option selected by the wheel"},"index":{"type":"number","description":"Index of the winning option (0-based)"},"totalOptions":{"type":"number","description":"Total number of options in the wheel"},"options":{"type":"array","items":{"type":"string"},"description":"All options that were in the wheel"},"finalRotation":{"type":"number","description":"Final rotation angle in degrees (for animation)"},"segmentAngle":{"type":"number","description":"Angle of each segment in degrees"}}}'::jsonb,
    NULL
  ),
  (
    'make_decision',
    'Help make a decision. Supports three modes: "yesNo" for yes/no questions (no options needed), "pickOne" for random selection from options, and "weighted" for weighted random selection. Great for making choices, answering questions, or picking randomly.',
    'Fun & Games',
    'NATIVE',
    true,
    'Consulting the oracle...',
    'The oracle has spoken!',
    '{"type":"object","properties":{"mode":{"type":"string","enum":["yesNo","pickOne","weighted"],"description":"Decision mode: \"yesNo\" for yes/no questions, \"pickOne\" for random selection, \"weighted\" for weighted selection"},"options":{"type":"array","items":{"type":"string"},"description":"Options to choose from (required for pickOne and weighted modes). Example: [\"Pizza\", \"Burger\", \"Sushi\"]"},"weights":{"type":"array","items":{"type":"number"},"description":"Optional weights for each option (only used in weighted mode). Higher weight = higher chance. Example: [3, 2, 1]"}},"required":["mode"]}'::jsonb,
    '{"type":"object","properties":{"decision":{"type":"string","description":"The decision result"},"mode":{"type":"string","description":"The mode used for the decision"},"index":{"type":"number","description":"Index of selected option (for pickOne/weighted modes)"},"totalOptions":{"type":"number","description":"Total number of options considered"},"options":{"type":"array","items":{"type":"string"},"description":"All options that were considered"},"confidence":{"type":"number","description":"Confidence level (0-100)"},"icon":{"type":"string","description":"Emoji icon for the result"}}}'::jsonb,
    NULL
  ),
  (
    'calculate_percentage',
    'Calculate percentages with 5 operations: whatIsXPercentOfY (X% of Y), xIsWhatPercentOfY (X is what % of Y), increaseByPercent (Y + X%), decreaseByPercent (Y - X%), percentChange (change from X to Y as %).',
    'Utilities',
    'NATIVE',
    true,
    'Calculating percentage...',
    'Percentage calculated',
    '{"type":"object","properties":{"operation":{"type":"string","enum":["whatIsXPercentOfY","xIsWhatPercentOfY","increaseByPercent","decreaseByPercent","percentChange"],"description":"Operation: whatIsXPercentOfY (X% of Y), xIsWhatPercentOfY (X is what % of Y), increaseByPercent (Y increased by X%), decreaseByPercent (Y decreased by X%), percentChange (% change from X to Y)"},"value1":{"type":"number","description":"First value: percentage for whatIs/increase/decrease, or base value for percentOf/percentChange"},"value2":{"type":"number","description":"Second value: base value for whatIs/increase/decrease, or total for percentOf, or new value for percentChange"}},"required":["operation","value1","value2"]}'::jsonb,
    '{"type":"object","properties":{"result":{"type":"number","description":"The calculated result"},"operation":{"type":"string","description":"The operation performed"},"value1":{"type":"number","description":"First input value"},"value2":{"type":"number","description":"Second input value"},"explanation":{"type":"string","description":"Human-readable explanation of the calculation"},"resultIsPercent":{"type":"boolean","description":"Whether the result is a percentage"}}}'::jsonb,
    NULL
  ),
  (
    'convert_units',
    'Convert between different units of measurement. Supports weight (kg, lbs, oz, g), length (cm, in, m, ft, km, mi, mm), and temperature (c, f, k).',
    'Utilities',
    'NATIVE',
    true,
    'Converting units...',
    'Conversion complete',
    '{"type":"object","properties":{"value":{"type":"number","description":"Value to convert"},"from":{"type":"string","enum":["kg","lbs","oz","g","cm","in","m","ft","km","mi","mm","c","f","k"],"description":"Source unit (kg, lbs, oz, g, cm, in, m, ft, km, mi, mm, c, f, k)"},"to":{"type":"string","enum":["kg","lbs","oz","g","cm","in","m","ft","km","mi","mm","c","f","k"],"description":"Target unit (kg, lbs, oz, g, cm, in, m, ft, km, mi, mm, c, f, k)"},"category":{"type":"string","enum":["weight","length","temperature"],"description":"Optional: category hint for the conversion"}},"required":["value","from","to"]}'::jsonb,
    '{"type":"object","properties":{"result":{"type":"number","description":"Converted value"},"value":{"type":"number","description":"Original value"},"from":{"type":"string","description":"Source unit"},"to":{"type":"string","description":"Target unit"}}}'::jsonb,
    NULL
  ),
  (
    'calculate_uniqueness',
    'Calculate how unique/rare a person is based on physical characteristics',
    'Fun & Games',
    'NATIVE',
    true,
    'Calculating uniqueness...',
    'Uniqueness calculated',
    '{"type":"object","properties":{"age":{"type":"number","description":"Age in years"},"ageMonths":{"type":"number","description":"Age in months for babies (0-24)"},"gender":{"type":"string","enum":["male","female"]},"heightCm":{"type":"number","description":"Height in centimeters"},"weightKg":{"type":"number","description":"Weight in kilograms"},"eyeColor":{"type":"string","enum":["brown","blue","hazel","green","gray","amber"]},"hairColor":{"type":"string","enum":["black","brown","blonde","red","gray","auburn"]},"bloodType":{"type":"string","enum":["O+","O-","A+","A-","B+","B-","AB+","AB-"]},"handedness":{"type":"string","enum":["right","left","ambidextrous"]}},"required":[]}'::jsonb,
    '{"type":"object","properties":{"worldPopulation":{"type":"number"},"matchingPeople":{"type":"number"},"rarity":{"type":"string"},"isBabyMode":{"type":"boolean"}}}'::jsonb,
    NULL
  ),
  (
    'find_next_eclipse',
    'Find the next upcoming solar or lunar eclipse with visibility info, countdown, and best viewing locations. Supports filtering by eclipse type and checking visibility from a specific location.',
    'Astronomy',
    'NATIVE',
    true,
    'Finding next eclipse...',
    'Eclipse found',
    '{"type":"object","properties":{"type":{"type":"string","enum":["solar","lunar","any"],"description":"Type of eclipse to find: solar (sun blocked by moon), lunar (moon in Earth shadow), or any"},"latitude":{"type":"number","description":"User latitude for visibility check (-90 to 90). Provide with longitude for personalized visibility info."},"longitude":{"type":"number","description":"User longitude for visibility check (-180 to 180). Provide with latitude for personalized visibility info."}},"required":[]}'::jsonb,
    '{"type":"object","properties":{"date":{"type":"string","description":"Eclipse date in YYYY-MM-DD format"},"type":{"type":"string","enum":["solar","lunar"],"description":"Eclipse type"},"subtype":{"type":"string","enum":["total","partial","annular","penumbral","hybrid"],"description":"Eclipse subtype"},"peakTimeUTC":{"type":"string","description":"Peak time in UTC (HH:MM)"},"duration":{"type":"string","description":"Duration of totality/maximum phase"},"magnitude":{"type":"number","description":"Eclipse magnitude (0-1+)"},"bestVisibleFrom":{"type":"string","description":"Best viewing location description"},"visibleRegions":{"type":"array","items":{"type":"string"},"description":"List of regions where eclipse is visible"},"daysUntil":{"type":"number","description":"Days until the eclipse"},"visibleFromLocation":{"type":"boolean","description":"Whether visible from provided coordinates"},"visibilityScore":{"type":"string","description":"Visibility quality from provided location"},"coordinates":{"type":"object","description":"Greatest eclipse point coordinates {lat, lon}"}}}'::jsonb,
    NULL
  ),
  (
    'list_upcoming_eclipses',
    'List upcoming solar and lunar eclipses with dates, visibility info, and countdown. Returns multiple eclipses with filtering options.',
    'Astronomy',
    'NATIVE',
    true,
    'Listing upcoming eclipses...',
    'Eclipses listed',
    '{"type":"object","properties":{"count":{"type":"number","description":"Number of eclipses to return (1-10, default 5)"},"type":{"type":"string","enum":["solar","lunar","any"],"description":"Filter by eclipse type: solar, lunar, or any (default)"},"latitude":{"type":"number","description":"User latitude for visibility check (-90 to 90)"},"longitude":{"type":"number","description":"User longitude for visibility check (-180 to 180)"}},"required":[]}'::jsonb,
    '{"type":"object","properties":{"eclipses":{"type":"array","items":{"type":"object"},"description":"List of upcoming eclipses with details (date, type, subtype, peakTimeUTC, duration, magnitude, bestVisibleFrom, visibleRegions, daysUntil, visibleFromLocation, visibilityScore)"},"totalCount":{"type":"number","description":"Total number of eclipses returned"}}}'::jsonb,
    NULL
  ),
  (
    'vibe_quiz',
    'Cat vs Dog personality quiz. Present these 10 questions to the user one by one, collect all answers, then call this tool with the answers array.

QUESTIONS (A=cat-leaning, B=dog-leaning):
1. How do you prefer to spend a Saturday? A: Cozy at home with a book or movie 📚 | B: Out and about, exploring or socializing 🎉
2. When meeting new people, you are: A: Reserved at first, warm up slowly 🤔 | B: Friendly and open right away 😄
3. Your ideal living space is: A: Clean, organized, minimal ✨ | B: Lived-in, cozy, a bit messy is fine 🏠
4. How do you handle stress? A: Need alone time to recharge 🧘 | B: Talk it out with friends/family 💬
5. Your approach to exercise: A: Solo activities (yoga, gym, walks) 🚶 | B: Team sports or group activities ⚽
6. When it comes to routines: A: I like flexibility and doing things my way 🎨 | B: I thrive on consistent schedules 📅
7. Your communication style: A: Subtle hints and body language 👀 | B: Direct and expressive 🗣️
8. How do you show affection? A: Quality time, being present 💝 | B: Physical touch, hugs, enthusiasm 🤗
9. Your sleep preference: A: Night owl, love late nights 🌙 | B: Early bird, up with the sun 🌅
10. When someone annoys you: A: Give them the cold shoulder ❄️ | B: Confront them directly 🔥',
    'Fun & Games',
    'NATIVE',
    true,
    'Analyzing your vibe...',
    'Vibe calculated!',
    '{"type":"object","properties":{"answers":{"type":"array","items":{"type":"string","enum":["A","B"]},"description":"Array of exactly 10 answers (A or B) corresponding to each question above"}},"required":["answers"]}'::jsonb,
    '{"type":"object","properties":{"type":{"type":"string","enum":["cat","dog"],"description":"Personality type result"},"percentage":{"type":"number","description":"Match percentage (0-100)"},"catScore":{"type":"number","description":"Number of cat-leaning answers"},"dogScore":{"type":"number","description":"Number of dog-leaning answers"},"title":{"type":"string","description":"Result title (e.g., \"Total Cat Person!\")"},"description":{"type":"string","description":"Detailed personality description"},"emoji":{"type":"string","description":"Result emoji"}}}'::jsonb,
    NULL
  ),
  (
    'sleep_calculator',
    'Calculate optimal sleep and wake times based on sleep cycles. Supports three modes: sleepNow (when to wake if sleeping now), wakeAt (when to sleep for target wake time), sleepAt (when to wake for target sleep time). Adjusts for different age groups.',
    'Health & Fitness',
    'NATIVE',
    true,
    'Calculating sleep cycles...',
    'Sleep times ready!',
    '{"type":"object","properties":{"calculatorMode":{"type":"string","enum":["sleepNow","wakeAt","sleepAt"],"description":"sleepNow: calculate wake times from now. wakeAt: calculate sleep times for target wake. sleepAt: calculate wake times for target sleep."},"targetTime":{"type":"string","description":"Target time in HH:MM format (required for wakeAt and sleepAt modes)"},"ageGroup":{"type":"string","enum":["adult","teen","child","toddler","infant"],"description":"Age group for sleep recommendations (default: adult)"}},"required":["calculatorMode"]}'::jsonb,
    '{"type":"object","properties":{"mode":{"type":"string","description":"Calculator mode used"},"ageGroup":{"type":"string","description":"Age group used"},"recommendation":{"type":"object","description":"Sleep recommendation for age group (min, max, optimal hours)"},"results":{"type":"array","items":{"type":"object"},"description":"Array of sleep/wake time options with cycles and quality"},"inputTime":{"type":"string","description":"Input time if provided"}}}'::jsonb,
    NULL
  ),
  (
    'calculate_iq_score',
    'IQ assessment quiz. Present questions to user one by one, collect all answers (0-3 index), then call with answers array.

TEST MODES:
- quick: 15 questions (~5 min) - Questions 1-15 below
- standard: 30 questions (~12 min) - Questions 1-30 below
- comprehensive: 50 questions (~20 min) - All 50 questions

QUESTIONS (answer index 0-3 for options A-D):

PATTERN: 1. 2,4,8,16,? [24|32|30|20] 2. 3,6,11,18,? [25|27|26|24] 3. 1,1,2,3,5,8,? [11|12|13|15] 4. 81,27,9,3,? [0|1|2|6] 5. If 2=6,3=12,4=20, 5=? [25|30|35|40] 6. 1,4,9,16,25,? [30|36|49|35] 7. 2,6,12,20,30,? [40|42|44|38] 8. 1,2,4,7,11,16,? [20|21|22|23] 9. 3,5,9,17,33,? [49|57|65|66] 10. 1,3,6,10,15,21,? [25|27|28|30]

LOGIC: 11. All Bloops are Razzies, all Razzies are Lazzies. All Bloops are Lazzies? [True|False|Cannot determine|Sometimes] 12. 5 machines make 5 widgets in 5 min. 100 machines for 100 widgets? [100min|5min|20min|1min] 13. Bat+ball=$1.10, bat costs $1 more. Ball cost? [$0.10|$0.05|$0.15|$0.20] 14. Mary''s father has 5 daughters: Nana,Nene,Nini,Nono. 5th name? [Nunu|Mary|Nana|None] 15. Some cats are dogs, some dogs are birds. Can cats be birds? [Yes|No|Possibly|Sometimes] 16. Farmer has 17 sheep, all but 9 die. Left? [8|9|17|0] 17. 3 people dig 3 holes in 3 hours. 1 person dig half hole? [1hr|1.5hr|3hr|Impossible] 18. Take pill every 30min, 3 pills. How long? [1.5hr|1hr|2hr|30min] 19. Subtract 5 from 25 how many times? [5|1|4|Infinite] 20. 6 apples, take 4. How many do you have? [2|4|6|0]

MATH: 21. 15% of 200? [25|30|35|40] 22. x+5=12, x=? [5|6|7|8] 23. 144÷12? [10|11|12|14] 24. √169? [11|12|13|14] 25. 3x-7=14, x=? [5|6|7|8] 26. 25% of 80? [15|20|25|30] 27. 7×8+6÷2? [56|59|31|62] 28. 120km in 2hr, speed? [50|55|60|65] 29. 2³+3²? [13|15|17|19] 30. Boys:girls=3:5, 24 boys. Girls? [30|35|40|45]

SPATIAL: 31. ○□△○□? [○|□|△|◇] 32. Fold square twice, cut corner. Holes? [1|2|4|8] 33. Cube faces? [4|6|8|12] 34. Rotate N 180°? [Z|N|M|W] 35. Cube edges? [6|8|10|12] 36. Most sides: hexagon/pentagon/octagon? [Hexagon|Pentagon|Octagon|Equal] 37. 3:15 clock angle? [0°|7.5°|15°|22.5°] 38. Triangles in Star of David? [2|6|8|12] 39. AMBULANCE mirror image? [AMBULANCE|ECNALUBMA|Reversed|Upside down] 40. Tetrahedron vertices? [3|4|5|6]

VERBAL: 41. HAND:GLOVE as FOOT:? [Leg|Sock|Shoe|Toe] 42. CIFAIPC rearranged=? [City|Animal|Ocean|Country] 43. BOOK:READING as FORK:? [Drawing|Eating|Writing|Cooking] 44. Doesn''t belong: Apple,Banana,Carrot,Orange? [Apple|Banana|Carrot|Orange] 45. DOCTOR:HOSPITAL as TEACHER:? [Student|School|Book|Classroom] 46. Opposite of BENEVOLENT? [Kind|Malevolent|Generous|Helpful] 47. BIRD:NEST as BEE:? [Honey|Flower|Hive|Sting] 48. EALGER rearranged=? [Bird|Color|Country|Fruit] 49. EPHEMERAL means? [Eternal|Temporary|Solid|Ancient] 50. WATER:THIRST as FOOD:? [Eat|Hunger|Cook|Taste]',
    'Fun & Games',
    'NATIVE',
    true,
    'Calculating IQ...',
    'IQ estimated!',
    '{"type":"object","properties":{"testMode":{"type":"string","enum":["quick","standard","comprehensive"],"description":"Test mode determining which questions to use. quick=Q1-15, standard=Q1-30, comprehensive=Q1-50"},"answers":{"type":"array","items":{"type":"number"},"description":"Array of answer indices (0-3) for each question. Length must match testMode: 15 for quick, 30 for standard, 50 for comprehensive."}},"required":["testMode","answers"]}'::jsonb,
    '{"type":"object","properties":{"testMode":{"type":"string","description":"Test mode used"},"testInfo":{"type":"object","description":"Test configuration (name, questionCount, estimatedMinutes)"},"iqScore":{"type":"number","description":"Estimated IQ score"},"category":{"type":"string","description":"IQ category (e.g., \"Superior\", \"Average\")"},"percentile":{"type":"number","description":"Percentile ranking (0-100)"},"correctAnswers":{"type":"number","description":"Number of correct answers"},"totalQuestions":{"type":"number","description":"Total questions in test"},"accuracy":{"type":"number","description":"Accuracy percentage"},"categoryScores":{"type":"object","description":"Breakdown by category (pattern, logic, math, spatial, verbal)"},"emoji":{"type":"string","description":"Result emoji"}}}'::jsonb,
    NULL
  ),
  (
    'generate_names',
    'Generate random names or numbers. Supports two modes: "names" for generating human names (first, full, or fantasy) and pet names (dog, cat, or other), or "numbers" for generating random numbers within a range.',
    'Fun & Games',
    'NATIVE',
    true,
    'Generating...',
    'Generated successfully',
    '{"type":"object","properties":{"mode":{"type":"string","enum":["names","numbers"],"description":"Generation mode: \"names\" for name generation, \"numbers\" for random number generation"},"nameCategory":{"type":"string","enum":["human","pet"],"description":"Category of names to generate (only for names mode). \"human\" for people names, \"pet\" for animal names"},"humanNameType":{"type":"string","enum":["first","full","fantasy"],"description":"Type of human name (only when nameCategory is \"human\"). \"first\" = first name only, \"full\" = first + last name, \"fantasy\" = fantasy/fictional names"},"petType":{"type":"string","enum":["dog","cat","other"],"description":"Type of pet (only when nameCategory is \"pet\"). \"dog\" = dog names, \"cat\" = cat names, \"other\" = hamster/rabbit/etc names"},"gender":{"type":"string","enum":["any","male","female"],"description":"Gender preference for names. \"any\" = random mix, \"male\" = masculine names, \"female\" = feminine names. For pets: male=boy, female=girl"},"min":{"type":"number","description":"Minimum value for random numbers (only for numbers mode, default: 1)"},"max":{"type":"number","description":"Maximum value for random numbers (only for numbers mode, default: 100)"},"count":{"type":"number","description":"Number of names or numbers to generate (1-100, default: 5)"}},"required":["mode"]}'::jsonb,
    '{"type":"object","properties":{"mode":{"type":"string","enum":["names","numbers"],"description":"The generation mode used"},"results":{"type":"array","items":{"type":"string"},"description":"Array of generated names or numbers"},"count":{"type":"number","description":"Number of results generated"},"nameCategory":{"type":"string","enum":["human","pet"],"description":"Category of names (names mode only)"},"humanNameType":{"type":"string","enum":["first","full","fantasy"],"description":"Type of human name (names mode, human category only)"},"petType":{"type":"string","enum":["dog","cat","other"],"description":"Type of pet (names mode, pet category only)"},"gender":{"type":"string","enum":["any","male","female"],"description":"Gender used for generation"},"min":{"type":"number","description":"Minimum value (numbers mode only)"},"max":{"type":"number","description":"Maximum value (numbers mode only)"},"range":{"type":"string","description":"Range string like \"1 - 100\" (numbers mode only)"}}}'::jsonb,
    NULL
  ),
  (
    'lucky_number',
    'Generate random lucky number(s) within a range. Default range is 1 to 2,147,483,647. Can generate multiple numbers at once (up to 10).',
    'Fun & Games',
    'NATIVE',
    true,
    'Finding lucky number...',
    'Lucky number found',
    '{"type":"object","properties":{"min":{"type":"number","description":"Minimum value (default: 1)"},"max":{"type":"number","description":"Maximum value (default: 2147483647)"},"count":{"type":"number","description":"Number of lucky numbers to generate (1-10, default: 1)"}},"required":[]}'::jsonb,
    '{"type":"object","properties":{"luckyNumber":{"type":"number","description":"The primary lucky number"},"numbers":{"type":"array","items":{"type":"number"},"description":"All generated lucky numbers"},"min":{"type":"number","description":"Minimum value used"},"max":{"type":"number","description":"Maximum value used"},"count":{"type":"number","description":"Number of numbers generated"},"range":{"type":"string","description":"Human-readable range description"}}}'::jsonb,
    NULL
  ),
  (
    'zodiac_compatibility',
    'Check zodiac compatibility between two people. Provide either sign names or birth dates for each person.',
    'Fun & Games',
    'NATIVE',
    true,
    'Checking compatibility...',
    'Compatibility calculated',
    '{"type":"object","properties":{"sign1":{"type":"string","description":"First zodiac sign name","enum":["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"]},"sign2":{"type":"string","description":"Second zodiac sign name","enum":["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"]},"date1":{"type":"string","description":"First person birth date (YYYY-MM-DD) - alternative to sign1"},"date2":{"type":"string","description":"Second person birth date (YYYY-MM-DD) - alternative to sign2"}},"required":[]}'::jsonb,
    '{"type":"object","properties":{"compatibility":{"type":"number"},"level":{"type":"string"},"person1":{"type":"object"},"person2":{"type":"object"}}}'::jsonb,
    NULL
  ),
  (
    'send_push_notification',
    'Send a push notification to the user''s registered devices (browser/mobile). Use this to alert users about automation status, required inputs, errors, or any important updates. The notification will appear in the browser or on mobile devices that have enabled push notifications.',
    'Notifications',
    'NATIVE',
    false,
    'Sending push notification...',
    'Push notification sent',
    '{"type":"object","properties":{"title":{"type":"string","description":"Notification title (required, max 50 chars)"},"body":{"type":"string","description":"Notification body message (required, max 200 chars)"},"url":{"type":"string","description":"URL to open when notification is clicked (optional)"},"tag":{"type":"string","description":"Tag for grouping notifications - same tag replaces previous (optional)"},"type":{"type":"string","enum":["automation","input_required","error","success","info"],"description":"Notification type - determines icon and behavior (default: info)"},"requireInteraction":{"type":"boolean","description":"Keep notification visible until user interacts (default: false)"},"automationId":{"type":"string","description":"Associated automation ID for deep linking (optional)"},"executionId":{"type":"string","description":"Associated execution ID for deep linking (optional)"}},"required":["title","body"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean","description":"Whether notification was sent successfully"},"sent":{"type":"number","description":"Number of devices notification was sent to"},"failed":{"type":"number","description":"Number of failed deliveries"},"message":{"type":"string","description":"Status message"}}}'::jsonb,
    NULL
  ),
  (
    'send_gmail',
    'Send an email using the user''s Gmail account. Requires the user to have logged in with Google and granted Gmail permissions. The email is sent FROM the user''s own Gmail address. Perfect for self-notifications, reminders, or sending reports to yourself.',
    'Notifications',
    'NATIVE',
    false,
    'Sending email via Gmail...',
    'Email sent',
    '{"type":"object","properties":{"to":{"type":"string","description":"Recipient email address. Use \"me\" or leave empty to send to yourself."},"subject":{"type":"string","description":"Email subject line (required)"},"body":{"type":"string","description":"Email body - plain text or HTML (required)"},"isHtml":{"type":"boolean","description":"Whether body is HTML (default: false, plain text)"},"cc":{"type":"string","description":"CC recipients (comma-separated emails, optional)"},"bcc":{"type":"string","description":"BCC recipients (comma-separated emails, optional)"}},"required":["subject","body"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean","description":"Whether email was sent successfully"},"messageId":{"type":"string","description":"Gmail message ID of sent email"},"threadId":{"type":"string","description":"Gmail thread ID"},"to":{"type":"string","description":"Recipient email address"},"error":{"type":"string","description":"Error message if failed"}}}'::jsonb,
    NULL
  )
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tool_type = EXCLUDED.tool_type,
  has_widget = EXCLUDED.has_widget,
  invoking_message = EXCLUDED.invoking_message,
  invoked_message = EXCLUDED.invoked_message,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  updated_at = NOW();

-- Link all NATIVE tools to the default server
DO $$
DECLARE
  v_user_id TEXT := 'user_37inOsUBpoqj1Nv5ZyeZ7rBOUKo';
  v_server_name TEXT := 'default';
  v_tool_id UUID;
  v_tool_name TEXT;
BEGIN
  -- Link each NATIVE tool to the user's default server
  FOR v_tool_id, v_tool_name IN SELECT id, name FROM tools WHERE tool_type = 'NATIVE'
  LOOP
    INSERT INTO server_tools (user_id, server_name, tool_id, is_enabled)
    VALUES (v_user_id, v_server_name, v_tool_id, true)
    ON CONFLICT (user_id, server_name, tool_id) DO NOTHING;
  END LOOP;
END $$;
