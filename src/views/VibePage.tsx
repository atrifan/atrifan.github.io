import { Component } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { VibeIcon } from '../components/VibeIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import { calculateVibe, getVibeQuestions, VibeAnswer, VibeQuestion, VIBE_QUESTIONS } from '../utils/VibeCalculator';

interface VibePageState {
  currentQuestion: number;
  answers: ('A' | 'B' | null)[];
  showResults: boolean;
  started: boolean;
}

export class VibePage extends Component<{}, VibePageState> {
  constructor(props: {}) {
    super(props);
    this.state = { currentQuestion: 0, answers: new Array(VIBE_QUESTIONS.length).fill(null), showResults: false, started: false };
  }

  componentDidMount() { applySEO('vibe'); }

  private startQuiz = () => { this.setState({ started: true, currentQuestion: 0, answers: new Array(VIBE_QUESTIONS.length).fill(null), showResults: false }); };

  private selectAnswer = (answer: 'A' | 'B') => {
    const newAnswers = [...this.state.answers];
    newAnswers[this.state.currentQuestion] = answer;
    this.setState({ answers: newAnswers }, () => {
      setTimeout(() => {
        if (this.state.currentQuestion < VIBE_QUESTIONS.length - 1) {
          this.setState({ currentQuestion: this.state.currentQuestion + 1 });
        } else {
          this.setState({ showResults: true }, () => {
            setTimeout(() => document.getElementById('vibe-results')?.scrollIntoView({ behavior: 'smooth' }), 100);
          });
        }
      }, 300);
    });
  };

  private calculateResult = () => {
    return calculateVibe(this.state.answers);
  };

  private getResultDetails = (type: 'cat' | 'dog', percentage: number) => {
    const result = calculateVibe(this.state.answers);
    return { title: `${result.title} ${result.emoji}`, desc: result.description, color: result.color };
  };

  private restartQuiz = () => { this.setState({ currentQuestion: 0, answers: new Array(VIBE_QUESTIONS.length).fill(null), showResults: false, started: false }); };

  render() {
    const { currentQuestion, answers, showResults, started } = this.state;
    const question = VIBE_QUESTIONS[currentQuestion];
    const progress = ((currentQuestion + 1) / VIBE_QUESTIONS.length) * 100;

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 50%, #f59e0b 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><AdBanner slot={ADS_CONFIG.slots.vibeTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><VibeIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: 'linear-gradient(135deg, #a78bfa 0%, #f472b6 50%, #fbbf24 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>VIBE</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.9)', marginTop: '0.25rem' }}>Are You a Cat or Dog Person? 🐱🐕</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <DisclaimerBanner title="Just for Fun!" message="This is a personality quiz for entertainment only. Your pet preference doesn't define you - love all animals! 🐾" color="#fbbf24" />
          </View>

          {/* Start Screen */}
          {!started && !showResults && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '24px', padding: '2rem', border: '1px solid rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🐱 vs 🐕</div>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '1rem' }}>Discover Your Pet Personality!</h2>
                <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '1.5rem' }}>10 quick questions • ~2 minutes • Find out if you're more cat or dog!</p>
                <button onClick={this.startQuiz} style={{ padding: '1rem 3rem', fontSize: '1.2rem', fontWeight: 700, background: 'linear-gradient(135deg, #a78bfa 0%, #f472b6 100%)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Start Quiz 🐾</button>
              </div>
            </View>
          )}

          {/* Question Screen */}
          {started && !showResults && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>Question {currentQuestion + 1} of {VIBE_QUESTIONS.length}</span>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>{Math.round(progress)}%</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.3)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #a78bfa, #fbbf24)', transition: 'width 0.3s ease' }} />
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '24px', padding: '2rem', border: '1px solid rgba(255,255,255,0.3)' }}>
                <p style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 600, marginBottom: '1.5rem', textAlign: 'center' }}>{question.question}</p>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <button onClick={() => this.selectAnswer('A')} style={{ padding: '1.25rem', fontSize: '1.1rem', fontWeight: 600, background: answers[currentQuestion] === 'A' ? 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)' : 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease' }}>
                    <span style={{ fontSize: '1.5rem', marginRight: '0.75rem' }}>{question.optionA.emoji}</span>{question.optionA.text}
                  </button>
                  <button onClick={() => this.selectAnswer('B')} style={{ padding: '1.25rem', fontSize: '1.1rem', fontWeight: 600, background: answers[currentQuestion] === 'B' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'rgba(255,255,255,0.1)', color: '#fff', border: '2px solid rgba(255,255,255,0.3)', borderRadius: '16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease' }}>
                    <span style={{ fontSize: '1.5rem', marginRight: '0.75rem' }}>{question.optionB.emoji}</span>{question.optionB.text}
                  </button>
                </div>
              </div>
            </View>
          )}

          {/* Results Ad */}
          {showResults && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
              <AdBanner slot={ADS_CONFIG.slots.vibeResults} format="horizontal" />
            </View>
          )}

          {/* Results Screen */}
          {showResults && (() => {
            const { type, percentage, catScore, dogScore } = this.calculateResult();
            const { title, desc, color } = this.getResultDetails(type, percentage);
            return (
              <View id="vibe-results" UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  <div style={{ fontSize: '5rem', marginBottom: '0.5rem' }}>{type === 'cat' ? '🐱' : '🐕'}</div>
                  <p style={{ fontSize: 'clamp(1.8rem, 6vw, 2.5rem)', fontWeight: 900, color, margin: '0 0 0.5rem', textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>{title}</p>
                  <p style={{ fontSize: '2rem', fontWeight: 700, color: '#fff', margin: '0 0 1rem' }}>{percentage}% {type === 'cat' ? 'Cat' : 'Dog'}</p>

                  {/* Score Bar */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#a78bfa', fontWeight: 600 }}>🐱 Cat: {catScore}</span>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>Dog: {dogScore} 🐕</span>
                    </div>
                    <div style={{ height: '12px', background: 'rgba(255,255,255,0.2)', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${(catScore / VIBE_QUESTIONS.length) * 100}%`, background: 'linear-gradient(90deg, #a78bfa, #8b5cf6)', transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${(dogScore / VIBE_QUESTIONS.length) * 100}%`, background: 'linear-gradient(90deg, #f59e0b, #d97706)', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>

                  <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.1rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>{desc}</p>

                  <button onClick={this.restartQuiz} style={{ padding: '1rem 2rem', fontSize: '1.1rem', fontWeight: 700, background: 'linear-gradient(135deg, #a78bfa 0%, #f472b6 100%)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Take Again 🔄</button>
                </div>
              </View>
            );
          })()}

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.vibeFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
      </View>
    );
  }
}

