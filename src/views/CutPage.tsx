import { Component } from 'react';
import { View } from '@adobe/react-spectrum';
import { WeightForm } from '../components/WeightForm';
import { ResultsDisplay } from '../components/ResultsDisplay';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { CutIcon } from '../components/CutIcon';
import { WeightCalculator } from '../utils/WeightCalculator';
import { UserInput, WeightLossPlan } from '../types';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

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

  componentDidMount() {
    applySEO('cut');
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
        {/* Side Ads - Desktop Only */}
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />

        <View maxWidth="56rem" marginX="auto">
          {/* Back Button */}
          <div style={{ marginBottom: '2rem' }}>
            <BackToTools />
          </div>

          {/* Top Ad */}
          <AdBanner slot={ADS_CONFIG.slots.cutTop} format="horizontal" />

          {/* Hero Header */}
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 3rem)' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}>
              <CutIcon size={100} />
            </div>

            <h1 style={{
              fontSize: 'clamp(1.75rem, 6vw, 4rem)',
              fontWeight: 900,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.5rem',
              letterSpacing: '-0.02em',
            }}>
              CUT
            </h1>

            <p style={{
              fontSize: 'clamp(0.9rem, 2.5vw, 1.4rem)',
              color: 'rgba(255, 255, 255, 0.9)',
              maxWidth: '44rem',
              margin: '0 auto',
              lineHeight: 1.4,
              fontWeight: 300,
            }}>
              Your Personal Weight Loss Calculator & Fasting Plan Generator
            </p>
          </View>

          {/* Disclaimer */}
          <DisclaimerBanner />

          {/* Main Content */}
          <View marginBottom="size-400">
            {/* Form Section */}
            <WeightForm onSubmit={this.handleFormSubmit} />
          </View>

          {/* Results Ad - between form and results */}
          {plan && (
            <AdBanner slot={ADS_CONFIG.slots.cutResults} format="horizontal" />
          )}

          {/* Results Section */}
          {plan && (
            <View id="results">
              <ResultsDisplay plan={plan} />
            </View>
          )}

          {/* Bottom Ad */}
          <AdBanner slot={ADS_CONFIG.slots.cutFooter} format="horizontal" />

          {/* Footer */}
          <Footer />
        </View>
      </View>
    );
  }
}

