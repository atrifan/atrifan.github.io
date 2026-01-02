'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import {
  BmiWidget,
  TipWidget,
  CoinFlipWidget,
  DiceWidget,
  AgeWidget,
  ZodiacWidget,
  CountdownWidget,
  DecisionWidget,
  RandomNumberWidget,
  LuckyNumberWidget,
  PickRandomWidget,
} from '@/src/components/widgets';

// Extend window for OpenAI
declare global {
  interface Window {
    openai?: {
      toolOutput?: {
        result?: Record<string, unknown>;
      };
    };
  }
}

interface WidgetData {
  tool: string;
  data: Record<string, unknown>;
}

function EmbedContent() {
  const searchParams = useSearchParams();
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null);

  useEffect(() => {
    // Try to get data from OpenAI first
    const tryOpenAI = () => {
      if (window.openai?.toolOutput?.result) {
        const result = window.openai.toolOutput.result;
        const tool = searchParams.get('tool') || detectToolFromData(result);
        if (tool) {
          setWidgetData({ tool, data: result });
          return true;
        }
      }
      return false;
    };

    // Listen for OpenAI set_globals event
    const handleOpenAI = () => tryOpenAI();
    window.addEventListener('openai:set_globals', handleOpenAI);

    // Try immediately in case data is already there
    if (tryOpenAI()) {
      return () => window.removeEventListener('openai:set_globals', handleOpenAI);
    }

    // Fall back to query params
    const tool = searchParams.get('tool');
    const dataParam = searchParams.get('data');

    if (tool && dataParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(dataParam));
        setWidgetData({ tool, data: parsed });
      } catch {
        // Invalid data format
      }
    }

    return () => window.removeEventListener('openai:set_globals', handleOpenAI);
  }, [searchParams]);

  if (!widgetData) {
    return (
      <div style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>
        Waiting for data...
      </div>
    );
  }

  const { tool, data } = widgetData;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'transparent',
    }}>
      {renderWidget(tool, data)}
    </div>
  );
}

// Detect tool type from data structure
function detectToolFromData(data: Record<string, unknown>): string | null {
  if ('bmi' in data && 'category' in data) return 'bmi';
  if ('tipAmount' in data && 'billAmount' in data) return 'tip';
  if ('result' in data && (data.result === 'heads' || data.result === 'tails')) return 'coin_flip';
  if ('rolls' in data && Array.isArray(data.rolls)) return 'dice';
  if ('years' in data && 'daysUntilNextBirthday' in data) return 'age';
  if ('person1' in data && 'person2' in data && 'compatibility' in data) return 'zodiac';
  if ('eventName' in data && 'days' in data) return 'countdown';
  if ('decision' in data) return 'decision';
  if ('luckyNumber' in data) return 'lucky_number';
  if ('selected' in data || ('result' in data && 'totalItems' in data)) return 'pick_random';
  if ('result' in data && 'min' in data && 'max' in data) return 'random_number';
  return null;
}

function renderWidget(tool: string, data: Record<string, unknown>) {
  switch (tool) {
    case 'bmi':
      return <BmiWidget
        bmi={data.bmi as number}
        category={data.category as string}
        weight={data.weight as number}
        height={data.height as number}
      />;
    case 'tip':
      return <TipWidget
        billAmount={data.billAmount as number}
        tipPercent={data.tipPercent as number}
        tipAmount={data.tipAmount as number}
        total={data.total as number}
        perPerson={data.perPerson as number}
        splitWays={data.splitWays as number}
      />;
    case 'coin_flip':
      return <CoinFlipWidget result={data.result as 'heads' | 'tails'} />;
    case 'dice':
      return <DiceWidget
        rolls={data.rolls as number[]}
        total={data.total as number}
        sides={data.sides as number}
      />;
    case 'age':
      return <AgeWidget
        years={data.years as number}
        months={data.months as number}
        days={data.days as number}
        totalDays={data.totalDays as number}
        daysUntilNextBirthday={data.daysUntilNextBirthday as number}
      />;
    case 'zodiac':
      return <ZodiacWidget
        person1={data.person1 as { sign: string; name: string; symbol: string }}
        person2={data.person2 as { sign: string; name: string; symbol: string }}
        compatibility={data.compatibility as number}
      />;
    case 'countdown':
      return <CountdownWidget
        eventName={data.eventName as string}
        days={data.days as number}
        weeks={data.weeks as number}
        months={data.months as number}
        isPast={data.isPast as boolean}
        isToday={data.isToday as boolean}
      />;
    case 'decision':
      return <DecisionWidget
        decision={data.decision as string}
        mode={data.mode as 'yesNo' | 'custom'}
        options={data.options as string[]}
      />;
    case 'random_number':
      return <RandomNumberWidget
        result={data.result as number}
        min={data.min as number}
        max={data.max as number}
      />;
    case 'lucky_number':
      return <LuckyNumberWidget
        luckyNumber={data.luckyNumber as number}
        max={data.max as number}
      />;
    case 'pick_random':
      return <PickRandomWidget
        selected={(data.selected || data.result) as string}
        totalItems={data.totalItems as number}
      />;
    default:
      return (
        <div style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>
          Unknown widget: {tool}
        </div>
      );
  }
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: '#fff' }}>Loading...</div>}>
      <EmbedContent />
    </Suspense>
  );
}

