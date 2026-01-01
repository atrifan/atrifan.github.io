import { Component } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BudgetForm } from '../components/BudgetForm';
import { BudgetResultsDisplay } from '../components/BudgetResultsDisplay';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { StackIcon } from '../components/StackIcon';
import { BudgetCalculator } from '../utils/BudgetCalculator';
import { FullBudgetInput, SavingsPlan, Currency } from '../types/budget';
import { ADS_CONFIG } from '../config/ads.config';

interface StackPageState {
  plan: SavingsPlan | null;
  currency: Currency;
}

/**
 * STACK - Budget & Savings Planner
 * Stack your bread 💰
 */
export class StackPage extends Component<{}, StackPageState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      plan: null,
      currency: 'EUR',
    };
  }

  componentDidMount() {
    // Update page title and meta for SEO
    document.title = 'STACK - Free Budget Calculator & Savings Planner | Money Goal Tracker | Tulzo';

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Free budget calculator and savings planner: Calculate monthly savings, track expenses, plan for financial goals. See how long to save for a car, house, vacation. Works in any currency. No signup required.');
    }

    // Update Open Graph tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'STACK - Free Budget & Savings Calculator | Tulzo');

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', 'Free budget calculator: Plan savings, track expenses, reach financial goals. Calculate how long to save for anything.');
  }

  private handleFormSubmit = (input: FullBudgetInput) => {
    const plan = BudgetCalculator.calculatePlan(input);
    this.setState({ plan, currency: input.currency });

    // Scroll to results
    setTimeout(() => {
      document.getElementById('stack-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  private handleReset = () => {
    this.setState({ plan: null });
  };

  render() {
    const { plan, currency } = this.state;

    return (
      <View
        UNSAFE_style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)',
          padding: 'clamp(1rem, 3vw, 2rem)',
        }}
      >
        <Flex direction="column" alignItems="center" gap="size-400">
          {/* Back to Home */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '800px' }}>
            <BackToTools />
          </View>

          {/* Top Ad */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '800px' }}>
            <AdBanner slot={ADS_CONFIG.slots.stackTop} format="horizontal" />
          </View>

          {/* Main Content */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '800px' }}>
            {/* Hero Header */}
            <View UNSAFE_style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div className="animate-float" style={{ marginBottom: '1.5rem' }}>
                <StackIcon size={140} />
              </div>

              <h1 style={{
                fontSize: 'clamp(2.5rem, 8vw, 5rem)',
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
                fontSize: 'clamp(1.1rem, 3vw, 1.4rem)',
                color: 'rgba(255, 255, 255, 0.8)',
                marginTop: '0.5rem',
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
              <BudgetForm onSubmit={this.handleFormSubmit} />
            </View>

            {/* Results */}
            {plan && (
              <View id="stack-results" UNSAFE_style={{ marginTop: '1.5rem' }}>
                <BudgetResultsDisplay
                  plan={plan}
                  currency={currency}
                  onReset={this.handleReset}
                />
                <AdBanner slot={ADS_CONFIG.slots.stackResults} format="horizontal" />
              </View>
            )}
          </View>

          {/* Bottom Ad */}
          <View UNSAFE_style={{ width: '100%', maxWidth: '800px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.stackFooter} format="horizontal" />
          </View>

          {/* Footer */}
          <Footer />
        </Flex>
      </View>
    );
  }
}

