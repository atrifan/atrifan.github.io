'use client';

import { useState, useEffect } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BudgetForm } from '../components/BudgetForm';
import { BudgetResultsDisplay } from '../components/BudgetResultsDisplay';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { StackIcon } from '../components/StackIcon';
import { BudgetCalculator } from '../utils/BudgetCalculator';
import { FullBudgetInput, SavingsPlan, Currency } from '../types/budget';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import { usePreferences } from '../contexts/PreferencesContext';

/**
 * STACK - Budget & Savings Planner
 * Stack your bread 💰
 */
export const StackPage: React.FC = () => {
  const { preferences } = usePreferences();
  const [plan, setPlan] = useState<SavingsPlan | null>(null);
  const [currency, setCurrency] = useState<Currency>('EUR');

  useEffect(() => {
    applySEO('stack');
  }, []);

  const handleFormSubmit = (input: FullBudgetInput) => {
    const newPlan = BudgetCalculator.calculatePlan(input);
    setPlan(newPlan);
    setCurrency(input.currency);

    // Scroll to results
    setTimeout(() => {
      document.getElementById('stack-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleReset = () => {
    setPlan(null);
  };

    return (
      <View
        UNSAFE_style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)',
          padding: 'clamp(1rem, 3vw, 2rem)',
        }}
      >
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <Flex direction="column" alignItems="center" gap="size-400">
          {/* Back to Home */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '50rem' }}>
            <BackToTools />
          </View>

          {/* Top Ad */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '50rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.stackTop} format="horizontal" />
          </View>

          {/* Main Content */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '50rem' }}>
            {/* Hero Header */}
            <View UNSAFE_style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 2rem)' }}>
              <div className="animate-float" style={{ marginBottom: '0.5rem' }}>
                <StackIcon size={90} />
              </div>

              <h1 style={{
                fontSize: 'clamp(1.75rem, 6vw, 3.5rem)',
                fontWeight: 900,
                background: 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                margin: 0,
                letterSpacing: '-0.02em',
              }}>
                STACK
              </h1>
              <p style={{
                fontSize: 'clamp(0.85rem, 2.5vw, 1.2rem)',
                color: 'rgba(255, 255, 255, 0.8)',
                marginTop: '0.25rem',
                fontWeight: 500,
              }}>
                Budget & Savings Planner 💰
              </p>
            </View>

            {/* Disclaimer */}
            <DisclaimerBanner
              title="Financial Disclaimer"
              message="This is not financial advice. Results are estimates based on your inputs. Consult a financial advisor for personalized guidance."
              color="#10b981"
            />

            {/* Form - always visible */}
            <View UNSAFE_style={{ marginTop: '1.5rem' }}>
              <BudgetForm onSubmit={handleFormSubmit} initialCurrency={preferences.currency} />
            </View>

            {/* Results Ad - between form and results */}
            {plan && (
              <View UNSAFE_style={{ marginTop: '1.5rem' }}>
                <AdBanner slot={ADS_CONFIG.slots.stackResults} format="horizontal" />
              </View>
            )}

            {/* Results */}
            {plan && (
              <View id="stack-results" UNSAFE_style={{ marginTop: '1.5rem' }}>
                <BudgetResultsDisplay
                  plan={plan}
                  currency={currency}
                  onReset={handleReset}
                />
              </View>
            )}
          </View>

          {/* Bottom Ad */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '50rem', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.stackFooter} format="horizontal" />
          </View>

          {/* Footer */}
          <Footer />
        </Flex>
      </View>
    );
};

