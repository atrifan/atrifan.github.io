import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { BrainIcon } from '../components/BrainIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { ShareResults } from '../components/ShareResults';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';

interface IQQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  category: 'pattern' | 'logic' | 'math' | 'spatial' | 'verbal';
}

// 15 reliable IQ-style questions based on common patterns
const IQ_QUESTIONS: IQQuestion[] = [
  { id: 1, question: 'What comes next: 2, 4, 8, 16, ?', options: ['24', '32', '30', '20'], correctIndex: 1, category: 'pattern' },
  { id: 2, question: 'If all Bloops are Razzies and all Razzies are Lazzies, then all Bloops are definitely Lazzies?', options: ['True', 'False', 'Cannot determine', 'Sometimes'], correctIndex: 0, category: 'logic' },
  { id: 3, question: 'Which number should replace the question mark: 3, 6, 11, 18, ?', options: ['25', '27', '26', '24'], correctIndex: 1, category: 'pattern' },
  { id: 4, question: 'HAND is to GLOVE as FOOT is to:', options: ['Leg', 'Sock', 'Shoe', 'Toe'], correctIndex: 1, category: 'verbal' },
  { id: 5, question: 'If you rearrange "CIFAIPC", you get the name of a(n):', options: ['City', 'Animal', 'Ocean', 'Country'], correctIndex: 2, category: 'verbal' },
  { id: 6, question: 'What comes next: 1, 1, 2, 3, 5, 8, ?', options: ['11', '12', '13', '15'], correctIndex: 2, category: 'pattern' },
  { id: 7, question: 'If 5 machines take 5 minutes to make 5 widgets, how long would 100 machines take to make 100 widgets?', options: ['100 minutes', '5 minutes', '20 minutes', '1 minute'], correctIndex: 1, category: 'logic' },
  { id: 8, question: 'Which shape completes the pattern: ○ □ △ ○ □ ?', options: ['○', '□', '△', '◇'], correctIndex: 2, category: 'spatial' },
  { id: 9, question: 'What is 15% of 200?', options: ['25', '30', '35', '40'], correctIndex: 1, category: 'math' },
  { id: 10, question: 'BOOK is to READING as FORK is to:', options: ['Drawing', 'Eating', 'Writing', 'Cooking'], correctIndex: 1, category: 'verbal' },
  { id: 11, question: 'What comes next: 81, 27, 9, 3, ?', options: ['0', '1', '2', '6'], correctIndex: 1, category: 'pattern' },
  { id: 12, question: 'A bat and ball cost $1.10. The bat costs $1 more than the ball. How much does the ball cost?', options: ['$0.10', '$0.05', '$0.15', '$0.20'], correctIndex: 1, category: 'logic' },
  { id: 13, question: 'Which word does NOT belong: Apple, Banana, Carrot, Orange', options: ['Apple', 'Banana', 'Carrot', 'Orange'], correctIndex: 2, category: 'verbal' },
  { id: 14, question: 'If 2 = 6, 3 = 12, 4 = 20, then 5 = ?', options: ['25', '30', '35', '40'], correctIndex: 1, category: 'pattern' },
  { id: 15, question: 'Mary\'s father has 5 daughters: Nana, Nene, Nini, Nono. What is the 5th daughter\'s name?', options: ['Nunu', 'Mary', 'Nana', 'None'], correctIndex: 1, category: 'logic' },
];

interface BrainPageState {
  currentQuestion: number;
  answers: (number | null)[];
  showResults: boolean;
  startTime: number | null;
}

export class BrainPage extends Component<{}, BrainPageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();

  constructor(props: {}) {
    super(props);
    this.state = {
      currentQuestion: 0,
      answers: new Array(IQ_QUESTIONS.length).fill(null),
      showResults: false,
      startTime: null,
    };
  }

  componentDidMount() {
    applySEO('brain');
  }

  private startTest = () => {
    this.setState({ startTime: Date.now(), currentQuestion: 0, answers: new Array(IQ_QUESTIONS.length).fill(null), showResults: false });
  };

  private selectAnswer = (answerIndex: number) => {
    const newAnswers = [...this.state.answers];
    newAnswers[this.state.currentQuestion] = answerIndex;
    this.setState({ answers: newAnswers });
  };

  private nextQuestion = () => {
    if (this.state.currentQuestion < IQ_QUESTIONS.length - 1) {
      this.setState({ currentQuestion: this.state.currentQuestion + 1 });
    } else {
      this.setState({ showResults: true }, () => {
        setTimeout(() => document.getElementById('brain-results')?.scrollIntoView({ behavior: 'smooth' }), 100);
      });
    }
  };

  private prevQuestion = () => {
    if (this.state.currentQuestion > 0) {
      this.setState({ currentQuestion: this.state.currentQuestion - 1 });
    }
  };

  private calculateIQ = (): { iq: number; percentile: number; correctCount: number } => {
    const correctCount = this.state.answers.reduce<number>((count, answer, idx) => {
      return count + (answer === IQ_QUESTIONS[idx].correctIndex ? 1 : 0);
    }, 0);
    const percentage = correctCount / IQ_QUESTIONS.length;
    // Map to IQ scale: 0% = 70, 100% = 145 (rough approximation)
    const iq = Math.round(70 + percentage * 75);
    // IQ percentile calculation (normal distribution approximation)
    const percentile = this.getPercentile(iq);
    return { iq, percentile, correctCount };
  };

  private getPercentile = (iq: number): number => {
    // Standard IQ distribution: mean=100, SD=15
    const z = (iq - 100) / 15;
    // Approximate CDF using error function approximation
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return Math.round((z > 0 ? 1 - p : p) * 100);
  };

  private getIQLabel = (iq: number): { label: string; emoji: string; color: string } => {
    if (iq >= 130) return { label: 'Very Superior', emoji: '🧠✨', color: '#10b981' };
    if (iq >= 120) return { label: 'Superior', emoji: '🌟', color: '#22c55e' };
    if (iq >= 110) return { label: 'High Average', emoji: '👍', color: '#84cc16' };
    if (iq >= 90) return { label: 'Average', emoji: '😊', color: '#eab308' };
    if (iq >= 80) return { label: 'Low Average', emoji: '🤔', color: '#f97316' };
    return { label: 'Below Average', emoji: '💪', color: '#ef4444' };
  };

  private restartTest = () => {
    this.setState({ currentQuestion: 0, answers: new Array(IQ_QUESTIONS.length).fill(null), showResults: false, startTime: null });
  };

  render() {
    const { currentQuestion, answers, showResults, startTime } = this.state;
    const question = IQ_QUESTIONS[currentQuestion];
    const progress = ((currentQuestion + 1) / IQ_QUESTIONS.length) * 100;

    return (
      <View UNSAFE_style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 50%, #1e1b4b 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
        <SideAds
          leftTopSlot={ADS_CONFIG.slots.sideLeftHorizontalTop}
          leftMiddleSlot={ADS_CONFIG.slots.sideLeftVerticalMiddle}
          leftBottomSlot={ADS_CONFIG.slots.sideLeftHorizontalBottom}
          rightTopSlot={ADS_CONFIG.slots.sideRightHorizontalTop}
          rightMiddleSlot={ADS_CONFIG.slots.sideRightVerticalMiddle}
          rightBottomSlot={ADS_CONFIG.slots.sideRightHorizontalBottom}
        />
        <Flex direction="column" alignItems="center" gap="size-400">
          <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}><BackToTools /></View>
          <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}><AdBanner slot={ADS_CONFIG.slots.brainTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '700px', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><BrainIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>BRAIN</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Quick IQ Assessment 🧠</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}>
            <DisclaimerBanner title="Entertainment Only!" message="This is NOT a clinical IQ test. Real IQ tests are administered by licensed psychologists. This quiz is for fun and based on common cognitive patterns. Results are approximate and for entertainment purposes only." color="#60a5fa" />
          </View>

          {/* Start Screen */}
          {!startTime && !showResults && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '700px', textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '24px', padding: '2rem', border: '1px solid rgba(255,255,255,0.2)' }}>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '1rem' }}>Ready to test your brain?</h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>15 questions • ~5 minutes • Pattern recognition, logic & verbal reasoning</p>
                <button onClick={this.startTest} style={{ padding: '1rem 3rem', fontSize: '1.2rem', fontWeight: 700, background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Start Test 🚀</button>
              </div>
            </View>
          )}

          {/* Question Screen */}
          {startTime && !showResults && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}>
              {/* Progress Bar */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>Question {currentQuestion + 1} of {IQ_QUESTIONS.length}</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>{Math.round(progress)}%</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', transition: 'width 0.3s ease' }} />
                </div>
              </div>

              {/* Question Card */}
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '24px', padding: '2rem', border: '1px solid rgba(255,255,255,0.2)', marginBottom: '1.5rem' }}>
                <p style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 600, marginBottom: '1.5rem', lineHeight: 1.5 }}>{question.question}</p>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {question.options.map((option, idx) => (
                    <button key={idx} onClick={() => this.selectAnswer(idx)} style={{ padding: '1rem', fontSize: '1.1rem', fontWeight: 600, background: answers[currentQuestion] === idx ? 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)' : 'rgba(255,255,255,0.1)', color: '#fff', border: answers[currentQuestion] === idx ? 'none' : '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease' }}>
                      <span style={{ marginRight: '0.75rem', opacity: 0.7 }}>{String.fromCharCode(65 + idx)}.</span>{option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
                <button onClick={this.prevQuestion} disabled={currentQuestion === 0} style={{ flex: 1, padding: '1rem', fontSize: '1rem', fontWeight: 600, background: currentQuestion === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: '12px', cursor: currentQuestion === 0 ? 'not-allowed' : 'pointer', opacity: currentQuestion === 0 ? 0.5 : 1 }}>← Previous</button>
                <button onClick={this.nextQuestion} disabled={answers[currentQuestion] === null} style={{ flex: 1, padding: '1rem', fontSize: '1rem', fontWeight: 600, background: answers[currentQuestion] === null ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', color: '#fff', border: 'none', borderRadius: '12px', cursor: answers[currentQuestion] === null ? 'not-allowed' : 'pointer', opacity: answers[currentQuestion] === null ? 0.5 : 1 }}>
                  {currentQuestion === IQ_QUESTIONS.length - 1 ? 'See Results 🎯' : 'Next →'}
                </button>
              </div>
            </View>
          )}

          {/* Results Ad */}
          {showResults && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}>
              <AdBanner slot={ADS_CONFIG.slots.brainResults} format="horizontal" />
            </View>
          )}

          {/* Results Screen */}
          {showResults && (() => {
            const { iq, percentile, correctCount } = this.calculateIQ();
            const { label, emoji, color } = this.getIQLabel(iq);
            return (
              <View id="brain-results" UNSAFE_style={{ width: '100%', maxWidth: '700px' }}>
                <div ref={this.resultsRef} style={{ background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.2) 0%, rgba(167, 139, 250, 0.2) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
                  <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }}>Your Estimated IQ</p>
                  <p style={{ fontSize: 'clamp(4rem, 15vw, 6rem)', fontWeight: 900, color, margin: '0', textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>{iq}</p>
                  <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{emoji}</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color, marginBottom: '1rem' }}>{label}</p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1rem' }}>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: 0 }}>Correct Answers</p>
                      <p style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>{correctCount}/{IQ_QUESTIONS.length}</p>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1rem' }}>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: 0 }}>Percentile</p>
                      <p style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>Top {100 - percentile}%</p>
                    </div>
                  </div>

                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    You scored higher than approximately <strong style={{ color: '#fff' }}>{percentile}%</strong> of the population based on this quick assessment.
                  </p>

                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={this.restartTest} style={{ padding: '1rem 2rem', fontSize: '1.1rem', fontWeight: 700, background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Try Again 🔄</button>
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <ShareResults
                    targetRef={this.resultsRef}
                    title="My IQ Score - Tulzo"
                    text={`I scored ${iq} on the Tulzo IQ test! ${emoji} That's in the top ${100 - percentile}% 🧠`}
                  />
                </div>
              </View>
            );
          })()}

          <View UNSAFE_style={{ width: '100%', maxWidth: '700px', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.brainFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
      </View>
    );
  }
}

