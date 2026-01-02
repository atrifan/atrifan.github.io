'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
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

function EmbedContent() {
  const searchParams = useSearchParams();
  const tool = searchParams.get('tool');
  const data = searchParams.get('data');
  
  if (!tool || !data) {
    return (
      <div style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>
        Missing tool or data parameter
      </div>
    );
  }

  let parsedData: Record<string, unknown>;
  try {
    parsedData = JSON.parse(decodeURIComponent(data));
  } catch {
    return (
      <div style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>
        Invalid data format
      </div>
    );
  }

  const renderWidget = () => {
    switch (tool) {
      case 'bmi':
        return <BmiWidget 
          bmi={parsedData.bmi as number} 
          category={parsedData.category as string}
          weight={parsedData.weight as number}
          height={parsedData.height as number}
        />;
      case 'tip':
        return <TipWidget 
          billAmount={parsedData.billAmount as number}
          tipPercent={parsedData.tipPercent as number}
          tipAmount={parsedData.tipAmount as number}
          total={parsedData.total as number}
          perPerson={parsedData.perPerson as number}
          splitWays={parsedData.splitWays as number}
        />;
      case 'coin_flip':
        return <CoinFlipWidget result={parsedData.result as 'heads' | 'tails'} />;
      case 'dice':
        return <DiceWidget 
          rolls={parsedData.rolls as number[]} 
          total={parsedData.total as number}
          sides={parsedData.sides as number}
        />;
      case 'age':
        return <AgeWidget 
          years={parsedData.years as number}
          months={parsedData.months as number}
          days={parsedData.days as number}
          totalDays={parsedData.totalDays as number}
          daysUntilNextBirthday={parsedData.daysUntilNextBirthday as number}
        />;
      case 'zodiac':
        return <ZodiacWidget 
          person1={parsedData.person1 as { sign: string; name: string; symbol: string }}
          person2={parsedData.person2 as { sign: string; name: string; symbol: string }}
          compatibility={parsedData.compatibility as number}
        />;
      case 'countdown':
        return <CountdownWidget 
          eventName={parsedData.eventName as string}
          days={parsedData.days as number}
          weeks={parsedData.weeks as number}
          months={parsedData.months as number}
          isPast={parsedData.isPast as boolean}
          isToday={parsedData.isToday as boolean}
        />;
      case 'decision':
        return <DecisionWidget 
          decision={parsedData.decision as string}
          mode={parsedData.mode as 'yesNo' | 'custom'}
          options={parsedData.options as string[]}
        />;
      case 'random_number':
        return <RandomNumberWidget 
          result={parsedData.result as number}
          min={parsedData.min as number}
          max={parsedData.max as number}
        />;
      case 'lucky_number':
        return <LuckyNumberWidget 
          luckyNumber={parsedData.luckyNumber as number}
          max={parsedData.max as number}
        />;
      case 'pick_random':
        return <PickRandomWidget 
          selected={parsedData.selected as string}
          totalItems={parsedData.totalItems as number}
        />;
      default:
        return (
          <div style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>
            Unknown widget: {tool}
          </div>
        );
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '1rem',
      background: 'transparent',
    }}>
      {renderWidget()}
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: '#fff' }}>Loading...</div>}>
      <EmbedContent />
    </Suspense>
  );
}

