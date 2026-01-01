import { Component } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { WeightForm } from '../components/WeightForm';
import { ResultsDisplay } from '../components/ResultsDisplay';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { BackToTools } from '../components/BackToTools';
import { Footer } from '../components/Footer';
import { CutIcon } from '../components/CutIcon';
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

  componentDidMount() {
    // Update page title and meta for SEO
    document.title = 'CUT - Weight Loss Calculator & Fasting Plan Generator | Tulzo';

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Free weight loss calculator with personalized fasting plans. Calculate your ideal calorie deficit, get intermittent fasting schedules, and track your progress to your goal weight.');
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', 'CUT - Weight Loss Calculator & Fasting Plan | Tulzo');

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', 'Free weight loss calculator with personalized fasting plans. Calculate your ideal calorie deficit and reach your goal weight.');
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
          <div style={{ marginBottom: '2rem' }}>
            <BackToTools />
          </div>

          {/* Hero Header */}
          <View UNSAFE_style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="animate-float" style={{ marginBottom: '1.5rem' }}>
              <CutIcon size={160} />
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

          {/* Bottom Ad */}
          <AdBanner slot={ADS_CONFIG.slots.footerBanner} format="horizontal" />

          {/* Footer */}
          <Footer />
        </View>
      </View>
    );
  }
}

