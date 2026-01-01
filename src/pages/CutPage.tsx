import { Component } from 'react';
import { Link } from 'react-router-dom';
import { View, Flex } from '@adobe/react-spectrum';
import { WeightForm } from '../components/WeightForm';
import { ResultsDisplay } from '../components/ResultsDisplay';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { WeightCalculator } from '../utils/WeightCalculator';
import { UserInput, WeightLossPlan } from '../types';
import { ADS_CONFIG } from '../config/ads.config';

interface CutPageState {
  plan: WeightLossPlan | null;
}

/**
 * CUT - Weight Loss Calculator Page
 */
export class CutPage extends Component<{}, CutPageState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      plan: null
    };
  }

  private handleFormSubmit = (input: UserInput): void => {
    const plan = WeightCalculator.generatePlan(input);
    this.setState({ plan });
    
    setTimeout(() => {
      const resultsElement = document.getElementById('results');
      if (resultsElement) {
        resultsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  render() {
    const { plan } = this.state;

    return (
      <View minHeight="100vh" padding={{ base: 'size-200', M: 'size-400', L: 'size-600' }}>
        <View maxWidth="1200px" marginX="auto">
          {/* Back Button */}
          <Link to="/" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '1.1rem',
              marginBottom: '2rem',
              padding: '0.75rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '50px',
              transition: 'all 0.3s ease',
            }}>
              <span style={{ fontSize: '1.5rem' }}>←</span>
              <span>Back to Tools</span>
            </div>
          </Link>

          {/* Hero Header */}
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="animate-float" style={{ marginBottom: '1.5rem' }}>
              <span style={{ 
                fontSize: 'clamp(4rem, 12vw, 8rem)', 
                filter: 'drop-shadow(0 8px 24px rgba(102, 126, 234, 0.5))' 
              }}>
                ✂️
              </span>
            </div>

            <h1 style={{
              fontSize: 'clamp(3rem, 10vw, 6rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1rem',
              letterSpacing: '-0.02em',
            }}>
              CUT
            </h1>

            <p style={{
              fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
              color: 'rgba(255, 255, 255, 0.9)',
              maxWidth: '700px',
              margin: '0 auto',
              lineHeight: 1.5,
              fontWeight: 300,
            }}>
              Your Personal Weight Loss Calculator & Fasting Plan Generator
            </p>
          </View>

          {/* Top Ad */}
          <AdBanner slot={ADS_CONFIG.slots.topBanner} format="horizontal" />

          {/* Disclaimer */}
          <DisclaimerBanner />

          {/* Main Content */}
          <Flex
            direction={{ base: 'column', L: 'row' }}
            gap="size-400"
            marginBottom="size-400"
          >
            {/* Form Section */}
            <View flex={{ L: 1 }}>
              <WeightForm onSubmit={this.handleFormSubmit} />
            </View>

            {/* Side Ad */}
            <View flex={{ L: 0 }} width={{ L: '320px' }} UNSAFE_style={{ display: 'none' }}>
              <div className="hide-mobile">
                <AdBanner slot={ADS_CONFIG.slots.sideBanner} format="vertical" style={{ minHeight: '600px' }} />
              </div>
            </View>
          </Flex>

          {/* Results Section */}
          {plan && (
            <View id="results">
              <AdBanner slot={ADS_CONFIG.slots.inContent1} format="horizontal" />
              <ResultsDisplay plan={plan} />
              <AdBanner slot={ADS_CONFIG.slots.inContent2} format="horizontal" />
            </View>
          )}

          {/* Footer */}
          <View UNSAFE_style={{ textAlign: 'center', padding: '4rem 0 2rem' }}>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>
              © 2025 ZIP Tools | CUT - Weight Loss Calculator
            </p>
            <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              This tool provides estimates based on general medical formulas. 
              Always consult healthcare professionals for personalized advice.
            </p>
          </View>

          {/* Bottom Ad */}
          <AdBanner slot={ADS_CONFIG.slots.footerBanner} format="horizontal" />
        </View>
      </View>
    );
  }
}

