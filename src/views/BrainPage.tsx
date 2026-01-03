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
import {
  IQQuestion, TestMode, TEST_MODE_CONFIG,
  getQuestionsForMode, calculateIQScore, getIQLabel
} from '../data/iqQuestions';

interface BrainPageState {
  testMode: TestMode | null;
  questions: IQQuestion[];
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
      testMode: null,
      questions: [],
      currentQuestion: 0,
      answers: [],
      showResults: false,
      startTime: null,
    };
  }

  componentDidMount() {
    applySEO('brain');
  }

  private selectMode = (mode: TestMode) => {
    const questions = getQuestionsForMode(mode);
    this.setState({
      testMode: mode,
      questions,
      answers: new Array(questions.length).fill(null),
    });
  };

  private startTest = () => {
    this.setState({ startTime: Date.now(), currentQuestion: 0, showResults: false });
  };

  private selectAnswer = (answerIndex: number) => {
    const newAnswers = [...this.state.answers];
    newAnswers[this.state.currentQuestion] = answerIndex;
    this.setState({ answers: newAnswers });
  };

  private nextQuestion = () => {
    if (this.state.currentQuestion < this.state.questions.length - 1) {
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

  private restartTest = () => {
    this.setState({ testMode: null, questions: [], currentQuestion: 0, answers: [], showResults: false, startTime: null });
  };

  render() {
    const { testMode, questions, currentQuestion, answers, showResults, startTime } = this.state;
    const question = questions[currentQuestion];
    const progress = questions.length > 0 ? ((currentQuestion + 1) / questions.length) * 100 : 0;
    const modeConfig = testMode ? TEST_MODE_CONFIG[testMode] : null;

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

          {/* Mode Selection Screen */}
          {!testMode && !showResults && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '700px', textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '24px', padding: '2rem', border: '1px solid rgba(255,255,255,0.2)' }}>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '0.5rem' }}>Choose Your Test Level</h2>
                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>Select the test that fits your time and goals</p>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {(Object.entries(TEST_MODE_CONFIG) as [TestMode, typeof TEST_MODE_CONFIG[TestMode]][]).map(([mode, config]) => (
                    <button key={mode} onClick={() => this.selectMode(mode)} style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '2rem' }}>{config.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{config.name}</div>
                          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>{config.description}</div>
                          <div style={{ color: '#a78bfa', fontSize: '0.85rem', marginTop: '0.5rem', fontWeight: 600 }}>
                            {config.questionCount} questions • ~{config.estimatedMinutes} minutes
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </View>
          )}

          {/* Start Screen (after mode selection) */}
          {testMode && !startTime && !showResults && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '700px', textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '24px', padding: '2rem', border: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{modeConfig?.emoji}</div>
                <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '0.5rem' }}>{modeConfig?.name}</h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>{modeConfig?.description}</p>
                <p style={{ color: '#a78bfa', fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>
                  {modeConfig?.questionCount} questions • ~{modeConfig?.estimatedMinutes} minutes
                </p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Categories: Pattern Recognition, Logic, Math, Spatial, Verbal
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => this.setState({ testMode: null })} style={{ padding: '1rem 2rem', fontSize: '1rem', fontWeight: 600, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', cursor: 'pointer' }}>← Change Level</button>
                  <button onClick={this.startTest} style={{ padding: '1rem 3rem', fontSize: '1.2rem', fontWeight: 700, background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Start Test 🚀</button>
                </div>
              </div>
            </View>
          )}

          {/* Question Screen */}
          {startTime && !showResults && question && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '700px' }}>
              {/* Progress Bar */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>Question {currentQuestion + 1} of {questions.length}</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>{Math.round(progress)}%</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', transition: 'width 0.3s ease' }} />
                </div>
              </div>

              {/* Question Card */}
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '24px', padding: '2rem', border: '1px solid rgba(255,255,255,0.2)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textTransform: 'uppercase' }}>{question.category}</span>
                  <span style={{ color: question.difficulty === 'easy' ? '#22c55e' : question.difficulty === 'medium' ? '#eab308' : '#ef4444', fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>{question.difficulty}</span>
                </div>
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
                  {currentQuestion === questions.length - 1 ? 'See Results 🎯' : 'Next →'}
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
            const { iq, percentile, correctCount, categoryScores } = calculateIQScore(answers, questions);
            const { label, emoji, color } = getIQLabel(iq);
            const categoryEmojis: Record<string, string> = { pattern: '🔢', logic: '🧩', math: '➗', spatial: '📐', verbal: '📝' };
            return (
              <View id="brain-results" UNSAFE_style={{ width: '100%', maxWidth: '700px' }}>
                <div ref={this.resultsRef} style={{ background: 'linear-gradient(135deg, rgba(96, 165, 250, 0.2) 0%, rgba(167, 139, 250, 0.2) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>{modeConfig?.name}</p>
                  <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }}>Your Estimated IQ</p>
                  <p style={{ fontSize: 'clamp(4rem, 15vw, 6rem)', fontWeight: 900, color, margin: '0', textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>{iq}</p>
                  <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{emoji}</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color, marginBottom: '1rem' }}>{label}</p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1rem' }}>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: 0 }}>Correct Answers</p>
                      <p style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>{correctCount}/{questions.length}</p>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1rem' }}>
                      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: 0 }}>Percentile</p>
                      <p style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0 0' }}>Top {100 - percentile}%</p>
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Category Breakdown</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                      {Object.entries(categoryScores).map(([cat, scores]) => (
                        <div key={cat} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.25rem' }}>{categoryEmojis[cat]}</div>
                          <div style={{ color: scores.correct === scores.total ? '#22c55e' : scores.correct >= scores.total / 2 ? '#eab308' : '#ef4444', fontSize: '0.9rem', fontWeight: 600 }}>{scores.correct}/{scores.total}</div>
                          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textTransform: 'capitalize' }}>{cat}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    You scored higher than approximately <strong style={{ color: '#fff' }}>{percentile}%</strong> of the population based on this {modeConfig?.name.toLowerCase()}.
                  </p>

                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={this.restartTest} style={{ padding: '1rem 2rem', fontSize: '1.1rem', fontWeight: 700, background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Try Again 🔄</button>
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <ShareResults
                    targetRef={this.resultsRef}
                    title="My IQ Score - Tulzo"
                    text={`I scored ${iq} on the Tulzo ${modeConfig?.name}! ${emoji} That's in the top ${100 - percentile}% 🧠`}
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

