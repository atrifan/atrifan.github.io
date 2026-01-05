import React, { useRef } from 'react';
import { View } from '@adobe/react-spectrum';
import { WeightLossPlan } from '../types';
import { ShareResults } from './ShareResults';

interface ResultsDisplayProps {
  plan: WeightLossPlan;
}

interface ResultCardProps {
  icon: string;
  title: string;
  children: React.ReactNode;
  gradient?: string;
  delay?: number;
}

const ResultCard: React.FC<ResultCardProps> = ({ icon, title, children, gradient, delay = 0 }) => (
  <div
    className="fade-in-up hover-lift"
    style={{
      background: gradient || 'rgba(255, 255, 255, 0.95)',
      borderRadius: '24px',
      padding: 'clamp(1.5rem, 4vw, 2.5rem)',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
      animationDelay: `${delay}s`,
      height: '100%',
    }}
  >
    <div style={{ textAlign: 'center' }}>
      <span style={{
        fontSize: 'clamp(3rem, 8vw, 4rem)',
        display: 'block',
        marginBottom: '1rem',
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))'
      }}>
        {icon}
      </span>
      <h3 style={{
        color: gradient ? '#fff' : '#1a1a2e',
        fontSize: 'clamp(1.1rem, 3vw, 1.3rem)',
        fontWeight: 700,
        marginBottom: '1rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {title}
      </h3>
      {children}
    </div>
  </div>
);

const getBMIColor = (category: string): string => {
  switch (category) {
    case 'Underweight': return '#3b82f6';
    case 'Normal weight': return '#10b981';
    case 'Overweight': return '#f59e0b';
    case 'Obese': return '#ef4444';
    default: return '#6b7280';
  }
};

/**
 * Results Display Component - Beautiful Redesign
 */
export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ plan }) => {
  const resultsRef = useRef<HTMLDivElement>(null);

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <View marginTop="size-600">
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>📈</span>
        <h2 style={{
          color: '#fff',
          fontSize: 'clamp(2rem, 6vw, 3rem)',
          fontWeight: 800,
          margin: 0,
        }}>
          Your Personalized Plan
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '0.75rem', fontSize: '1.2rem' }}>
          Here's everything you need to reach your goal
        </p>
        {/* Share Button */}
        <div style={{ marginTop: '1.5rem' }}>
          <ShareResults
            targetRef={resultsRef}
            title="My Weight Loss Plan - Tulzo CUT"
            text={`Check out my weight loss plan! Target: ${plan.idealWeight.toFixed(1)}kg in ${plan.weeksToGoal} weeks`}
          />
        </div>
      </div>

      {/* Results content wrapper for screenshot */}
      <div ref={resultsRef}>

      {/* BMI Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <ResultCard icon="📏" title="Current BMI" delay={0.1}>
          <div className="big-number" style={{ marginBottom: '0.75rem' }}>
            {plan.currentBMI.value.toFixed(1)}
          </div>
          <span style={{
            display: 'inline-block',
            padding: '0.5rem 1.25rem',
            borderRadius: '50px',
            background: getBMIColor(plan.currentBMI.category),
            color: '#fff',
            fontWeight: 700,
            fontSize: '1rem',
          }}>
            {plan.currentBMI.category}
          </span>
        </ResultCard>

        <ResultCard icon="🎯" title="Target BMI" delay={0.2}>
          <div className="big-number" style={{ marginBottom: '0.75rem' }}>
            {plan.targetBMI.value.toFixed(1)}
          </div>
          <span style={{
            display: 'inline-block',
            padding: '0.5rem 1.25rem',
            borderRadius: '50px',
            background: getBMIColor(plan.targetBMI.category),
            color: '#fff',
            fontWeight: 700,
            fontSize: '1rem',
          }}>
            {plan.targetBMI.category}
          </span>
        </ResultCard>

        <ResultCard icon="⚖️" title="Ideal Weight" delay={0.3}>
          <div className="big-number" style={{ marginBottom: '0.5rem' }}>
            {plan.idealWeight.toFixed(1)}
          </div>
          <span style={{ color: '#6b7280', fontSize: '1.2rem', fontWeight: 600 }}>
            kilograms
          </span>
        </ResultCard>
      </div>

      {/* Timeline Card */}
      <div
        className="fade-in-up hover-lift"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '24px',
          padding: 'clamp(2rem, 5vw, 3rem)',
          marginBottom: '1.5rem',
          boxShadow: '0 20px 60px rgba(102, 126, 234, 0.4)',
          animationDelay: '0.4s',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '2rem' }}>
          <span style={{ fontSize: 'clamp(4rem, 10vw, 6rem)' }}>📅</span>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.2rem', marginBottom: '0.5rem', fontWeight: 600 }}>
              YOUR GOAL DATE
            </h3>
            <div style={{
              fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
              fontWeight: 800,
              color: '#fff',
              marginBottom: '0.5rem'
            }}>
              {formatDate(plan.targetDate)}
            </div>
            <div style={{
              display: 'inline-block',
              background: 'rgba(255,255,255,0.2)',
              padding: '0.75rem 1.5rem',
              borderRadius: '50px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1.1rem',
            }}>
              {plan.weeksToGoal} weeks • {Math.ceil(plan.weeksToGoal / 4)} months
            </div>
          </div>
        </div>
      </div>

      {/* Calorie Plan Card */}
      <div
        className="fade-in-up hover-lift"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '24px',
          padding: 'clamp(2rem, 5vw, 3rem)',
          marginBottom: '1.5rem',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          animationDelay: '0.5s',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🔥</span>
          <h3 style={{ color: '#1a1a2e', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            DAILY CALORIE PLAN
          </h3>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div style={{ textAlign: 'center', padding: '1.5rem', background: '#f8fafc', borderRadius: '16px' }}>
            <div style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              BMR (Basal Rate)
            </div>
            <div style={{ color: '#1a1a2e', fontSize: '2rem', fontWeight: 800 }}>
              {plan.bmr}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>cal/day</div>
          </div>

          <div style={{ textAlign: 'center', padding: '1.5rem', background: '#f8fafc', borderRadius: '16px' }}>
            <div style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              TDEE (Total Energy)
            </div>
            <div style={{ color: '#1a1a2e', fontSize: '2rem', fontWeight: 800 }}>
              {plan.tdee}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>cal/day</div>
          </div>

          <div style={{ textAlign: 'center', padding: '1.5rem', background: '#fef2f2', borderRadius: '16px' }}>
            <div style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Daily Deficit
            </div>
            <div style={{ color: '#ef4444', fontSize: '2rem', fontWeight: 800 }}>
              -{plan.dailyDeficit}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>cal/day</div>
          </div>
        </div>

        {/* Target Calories - Big Display */}
        <div style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          borderRadius: '20px',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            🎯 YOUR DAILY TARGET
          </div>
          <div style={{ color: '#fff', fontSize: 'clamp(3rem, 10vw, 5rem)', fontWeight: 900, lineHeight: 1 }}>
            {plan.dailyCalories}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.3rem', fontWeight: 600 }}>
            calories per day
          </div>
        </div>
      </div>

      {/* Fasting Plan Card */}
      <div
        className="fade-in-up hover-lift"
        style={{
          background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
          borderRadius: '24px',
          padding: 'clamp(2rem, 5vw, 3rem)',
          boxShadow: '0 20px 60px rgba(168, 85, 247, 0.4)',
          animationDelay: '0.6s',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <span style={{
            fontSize: 'clamp(5rem, 15vw, 8rem)',
            display: 'block',
            marginBottom: '1.5rem',
            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.3))'
          }}>
            {plan.fastingPlan.icon}
          </span>

          <h3 style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: '1.1rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em'
          }}>
            Recommended Fasting Plan
          </h3>

          <div style={{
            fontSize: 'clamp(2rem, 6vw, 3rem)',
            fontWeight: 900,
            color: '#fff',
            marginBottom: '1rem'
          }}>
            {plan.fastingPlan.name}
          </div>

          <p style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: '1.2rem',
            marginBottom: '1.5rem',
            maxWidth: '31rem',
            margin: '0 auto 1.5rem'
          }}>
            {plan.fastingPlan.description}
          </p>

          <div style={{
            display: 'inline-block',
            background: 'rgba(255,255,255,0.2)',
            padding: '1rem 2rem',
            borderRadius: '50px',
            color: '#fff',
            fontWeight: 700,
            fontSize: '1.2rem',
          }}>
            ⏰ {plan.fastingPlan.schedule}
          </div>
        </div>
      </div>
      </div>{/* End of results wrapper */}
    </View>
  );
};
