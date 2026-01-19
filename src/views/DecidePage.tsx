import { Component, createRef, RefObject } from 'react';
import { View, Flex } from '@adobe/react-spectrum';
import { BackToTools } from '../components/BackToTools';
import { DecideIcon } from '../components/DecideIcon';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { AdBanner } from '../components/AdBanner';
import { SideAds } from '../components/SideAds';
import { Footer } from '../components/Footer';
import { ShareResults } from '../components/ShareResults';
import { ADS_CONFIG } from '../config/ads.config';
import { applySEO } from '../utils/seo';
import { makeDecision, parseDecisionOptions, DecisionMode, AudioSeed } from '../utils/DecisionCalculator';

interface DecidePageState {
  mode: DecisionMode;
  options: string;
  result: string | null;
  isAnimating: boolean;
  // Microphone oracle state
  useVoiceOracle: boolean;
  isRecording: boolean;
  audioMetrics: AudioSeed | null;
  microphoneSupported: boolean;
}

export class DecidePage extends Component<{}, DecidePageState> {
  private resultsRef: RefObject<HTMLDivElement> = createRef();
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioChunks: Blob[] = [];
  private maxDecibel: number = -Infinity;
  private minDecibel: number = Infinity;
  private recordingStartTime: number = 0;
  // Silence detection
  private silenceStartTime: number = 0;
  private hasSoundStarted: boolean = false;
  private readonly SILENCE_THRESHOLD: number = -50; // dB threshold for silence
  private readonly SILENCE_DURATION: number = 800; // ms of silence before auto-stop

  constructor(props: {}) {
    super(props);
    this.state = {
      mode: 'yesNo',
      options: '',
      result: null,
      isAnimating: false,
      useVoiceOracle: false,
      isRecording: false,
      audioMetrics: null,
      microphoneSupported: true,
    };
  }

  componentDidMount() {
    applySEO('decide');
    document.addEventListener('keydown', this.handleKeyDown);
    // Check if microphone is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.setState({ microphoneSupported: false });
    }
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.stopRecording();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !this.state.isAnimating && !this.state.isRecording) {
      e.preventDefault();
      this.decide();
    }
  };

  private startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up audio context for decibel analysis
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      // Reset metrics
      this.maxDecibel = -Infinity;
      this.minDecibel = Infinity;
      this.audioChunks = [];
      this.recordingStartTime = Date.now();
      this.silenceStartTime = 0;
      this.hasSoundStarted = false;

      // Start analyzing audio levels
      this.analyzeAudio();

      // Set up media recorder
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const duration = Date.now() - this.recordingStartTime;
        const totalSize = this.audioChunks.reduce((sum, chunk) => sum + chunk.size, 0);

        const audioMetrics: AudioSeed = {
          size: totalSize,
          maxDecibel: this.maxDecibel === -Infinity ? -60 : this.maxDecibel,
          minDecibel: this.minDecibel === Infinity ? -90 : this.minDecibel,
          duration,
        };

        this.setState({ audioMetrics, isRecording: false });

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Make decision with audio seed
        this.decideWithAudio(audioMetrics);
      };

      this.mediaRecorder.start();
      this.setState({ isRecording: true, result: null, audioMetrics: null });

      // Auto-stop after 3 seconds
      setTimeout(() => {
        if (this.state.isRecording) {
          this.stopRecording();
        }
      }, 3000);

    } catch (err) {
      console.error('Microphone access denied:', err);
      this.setState({ microphoneSupported: false });
    }
  };

  private analyzeAudio = () => {
    if (!this.analyser || !this.state.isRecording) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate RMS (root mean square) for decibel level
    const sum = dataArray.reduce((acc, val) => acc + val * val, 0);
    const rms = Math.sqrt(sum / dataArray.length);
    const decibel = 20 * Math.log10(rms / 255) || -90;

    if (decibel > this.maxDecibel) this.maxDecibel = decibel;
    if (decibel < this.minDecibel && decibel > -90) this.minDecibel = decibel;

    // Silence detection - auto-stop when user stops speaking
    const now = Date.now();
    const isSilent = decibel < this.SILENCE_THRESHOLD;

    if (!isSilent) {
      // Sound detected
      this.hasSoundStarted = true;
      this.silenceStartTime = 0;
    } else if (this.hasSoundStarted) {
      // Silence after sound was detected
      if (this.silenceStartTime === 0) {
        this.silenceStartTime = now;
      } else if (now - this.silenceStartTime >= this.SILENCE_DURATION) {
        // Silence duration exceeded - auto-stop
        this.stopRecording();
        return;
      }
    }

    // Continue analyzing
    if (this.state.isRecording) {
      requestAnimationFrame(this.analyzeAudio);
    }
  };

  private stopRecording = () => {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  };

  private decideWithAudio = (audioSeed: AudioSeed) => {
    this.setState({ isAnimating: true });

    setTimeout(() => {
      const { mode, options } = this.state;
      let result: string;

      if (mode === 'yesNo') {
        const decision = makeDecision({ mode: 'yesNo', audioSeed });
        result = decision.decision;
      } else {
        const optionList = parseDecisionOptions(options);
        if (optionList.length < 2) {
          result = 'Add at least 2 options!';
        } else {
          const decision = makeDecision({ mode: 'pickOne', options: optionList, audioSeed });
          result = decision.decision;
        }
      }

      this.setState({ result, isAnimating: false });
    }, 1000);
  };

  private decide = () => {
    this.setState({ isAnimating: true, result: null });

    setTimeout(() => {
      const { mode, options } = this.state;
      let result: string;

      if (mode === 'yesNo') {
        const decision = makeDecision({ mode: 'yesNo' });
        result = decision.decision;
      } else {
        const optionList = parseDecisionOptions(options);
        if (optionList.length < 2) {
          result = 'Add at least 2 options!';
        } else {
          const decision = makeDecision({ mode: 'pickOne', options: optionList });
          result = decision.decision;
        }
      }

      this.setState({ result, isAnimating: false });
    }, 1000);
  };

  render() {
    const { mode, options, result, isAnimating, useVoiceOracle, isRecording, audioMetrics, microphoneSupported } = this.state;
    const gradient = 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)';
    const micGradient = 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 50%, #c084fc 100%)';

    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)', padding: 'clamp(1rem, 3vw, 2rem)' }}>
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
          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}><AdBanner slot={ADS_CONFIG.slots.decideTop} format="horizontal" /></View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', textAlign: 'center' }}>
            <div className="animate-float" style={{ marginBottom: '0.5rem' }}><DecideIcon size={80} /></div>
            <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 3rem)', fontWeight: 900, background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', margin: 0 }}>DECIDE</h1>
            <p style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)', color: 'rgba(255,255,255,0.8)', marginTop: '0.25rem' }}>Decision Maker 🎯</p>
            <p style={{ fontSize: 'clamp(0.75rem, 2vw, 0.9rem)', color: 'rgba(255,255,255,0.5)', marginTop: '0.15rem' }}>Press SPACE or tap the button to decide</p>
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <DisclaimerBanner title="Just for Fun!" message="This is a fun utility tool. For important life decisions, please use your own judgment or consult appropriate professionals." color="#22c55e" />
          </View>

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
              {[{ id: 'yesNo', label: 'Yes or No?' }, { id: 'pickOne', label: 'Pick One' }].map((m) => (
                <button key={m.id} onClick={(e) => { e.stopPropagation(); this.setState({ mode: m.id as any, result: null }); }}
                  style={{ padding: '0.75rem 1.5rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: mode === m.id ? gradient : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600 }}>
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
              {mode === 'pickOne' && (
                <textarea placeholder="Enter options (one per line)&#10;Option 1&#10;Option 2&#10;Option 3" value={options} onChange={(e) => this.setState({ options: e.target.value })} onClick={(e) => e.stopPropagation()}
                  style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '1rem', minHeight: '120px', resize: 'vertical', boxSizing: 'border-box' }} />
              )}

              {/* Voice Oracle Toggle */}
              {microphoneSupported && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>🎲 Random</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); this.setState({ useVoiceOracle: !useVoiceOracle, result: null, audioMetrics: null }); }}
                    style={{
                      width: '60px',
                      height: '32px',
                      borderRadius: '16px',
                      border: 'none',
                      background: useVoiceOracle ? micGradient : 'rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: '#fff',
                      position: 'absolute',
                      top: '3px',
                      left: useVoiceOracle ? '31px' : '3px',
                      transition: 'left 0.3s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                  <span style={{ color: useVoiceOracle ? '#a855f7' : 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: useVoiceOracle ? 600 : 400 }}>🎤 Voice Oracle</span>
                </div>
              )}

              {/* Standard Button or Voice Oracle Button */}
              {!useVoiceOracle ? (
                <button onClick={(e) => { e.stopPropagation(); this.decide(); }} disabled={isAnimating}
                  style={{ width: '100%', padding: '1.5rem', fontSize: '1.3rem', fontWeight: 700, background: isAnimating ? 'rgba(255,255,255,0.3)' : gradient, color: '#fff', border: 'none', borderRadius: '12px', cursor: isAnimating ? 'wait' : 'pointer' }}>
                  {isAnimating ? '🤔 Thinking...' : mode === 'yesNo' ? 'Ask the Oracle 🔮' : 'Pick for Me! 🎯'}
                </button>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  {/* Microphone Button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); isRecording ? this.stopRecording() : this.startRecording(); }}
                    disabled={isAnimating}
                    style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      border: 'none',
                      background: isRecording
                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                        : isAnimating
                          ? 'rgba(255,255,255,0.3)'
                          : micGradient,
                      color: '#fff',
                      cursor: isAnimating ? 'wait' : 'pointer',
                      fontSize: '3rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      boxShadow: isRecording ? '0 0 30px rgba(239, 68, 68, 0.5)' : '0 4px 20px rgba(139, 92, 246, 0.4)',
                      animation: isRecording ? 'pulse 1s infinite' : 'none',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {isAnimating ? '🤔' : isRecording ? '⏹️' : '🎤'}
                  </button>

                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginTop: '1rem' }}>
                    {isAnimating ? 'The oracle is thinking...' : isRecording ? 'Speak your question... (3 sec max)' : 'Tap to speak your question'}
                  </p>

                  {/* Audio Metrics Display */}
                  {audioMetrics && !isAnimating && (
                    <div style={{
                      marginTop: '1rem',
                      padding: '0.75rem',
                      background: 'rgba(139, 92, 246, 0.2)',
                      borderRadius: '12px',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                    }}>
                      <div style={{ color: '#a855f7', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem' }}>🔮 Voice Seed Captured</div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>
                        <span>📊 {(audioMetrics.size / 1024).toFixed(1)}KB</span>
                        <span>📈 {audioMetrics.maxDecibel.toFixed(1)}dB</span>
                        <span>📉 {audioMetrics.minDecibel.toFixed(1)}dB</span>
                        <span>⏱️ {(audioMetrics.duration / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </View>

          {result && (
            <View UNSAFE_style={{ width: '100%', maxWidth: '38rem' }}>
              <AdBanner slot={ADS_CONFIG.slots.decideResults} format="horizontal" />
            </View>
          )}

          {result && (
            <>
              <div id="decide-results" ref={this.resultsRef} style={{ width: '100%', maxWidth: '38rem', background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3) 0%, rgba(22, 163, 74, 0.3) 100%)', borderRadius: '24px', padding: '2rem', border: '2px solid rgba(255,255,255,0.3)', textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', marginBottom: '0.5rem' }}>The answer is...</div>
                <div style={{ fontSize: 'clamp(2rem, 8vw, 3rem)', fontWeight: 800, color: '#22c55e' }}>{result}</div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <ShareResults
                  targetRef={this.resultsRef}
                  title="Decision Maker - Tulzo"
                  text={`The oracle says: ${result}! 🔮`}
                />
              </div>
            </>
          )}

          <View UNSAFE_style={{ width: '100%', maxWidth: '38rem', marginTop: '2rem' }}>
            <AdBanner slot={ADS_CONFIG.slots.decideFooter} format="horizontal" />
          </View>

          <Footer />
        </Flex>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
          @keyframes pulse {
            0%, 100% { transform: scale(1); box-shadow: 0 0 30px rgba(239, 68, 68, 0.5); }
            50% { transform: scale(1.05); box-shadow: 0 0 50px rgba(239, 68, 68, 0.7); }
          }
          textarea::placeholder { color: rgba(255,255,255,0.5); }
        `}</style>
      </div>
    );
  }
}

