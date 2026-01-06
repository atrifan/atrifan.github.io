'use client';

import React from 'react';
import { WidgetCard, BigNumber, StatBox, WidgetHeader, WidgetFooter } from './WidgetCard';

type BloodCalculatorMode = 'donation' | 'compatibility' | 'baby';

interface BloodWidgetProps {
  calculatorMode: BloodCalculatorMode;
  // Donation mode
  eligible?: boolean;
  amount?: number;
  maxSafeAmount?: number;
  bloodVolume?: number;
  warnings?: string[];
  // Compatibility mode
  fullBloodType?: string;
  canDonateTo?: string[];
  canReceiveFrom?: string[];
  isUniversalDonor?: boolean;
  isUniversalRecipient?: boolean;
  // Baby mode
  possibleTypes?: { type: string; percentage: number }[];
  rhIncompatibilityRisk?: boolean;
}

const DonationWidget: React.FC<BloodWidgetProps> = ({ eligible, amount, maxSafeAmount, bloodVolume, warnings }) => {
  const color = eligible ? '#22c55e' : '#ef4444';
  const icon = eligible ? '✅' : '❌';
  const status = eligible ? 'Eligible to Donate' : 'Not Eligible';
  
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(239, 68, 68, 0.4) 0%, rgba(220, 38, 38, 0.4) 100%)">
      <WidgetHeader icon="🩸" title="Blood Donation" />
      <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '3rem' }}>{icon}</span>
      </div>
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '1rem',
        padding: '0.5rem 1rem',
        background: `${color}33`,
        borderRadius: '20px',
      }}>
        <span style={{ color, fontWeight: 700 }}>{status}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {eligible ? (
          <>
            <StatBox label="Recommended" value={`${amount} ml`} color="#22c55e" />
            <StatBox label="Blood Volume" value={`${bloodVolume} L`} />
          </>
        ) : (
          <>
            <StatBox label="Blood Volume" value={`${bloodVolume} L`} />
            <StatBox label="Max Safe Loss" value={`${maxSafeAmount} ml`} color="#fbbf24" />
          </>
        )}
      </div>
      {warnings && warnings.length > 0 && (
        <div style={{ 
          marginTop: '0.75rem', 
          padding: '0.5rem', 
          background: 'rgba(251, 191, 36, 0.1)', 
          borderRadius: '8px',
          fontSize: '0.75rem',
          color: '#fbbf24',
        }}>
          ⚠️ {warnings[0]}
        </div>
      )}
      <WidgetFooter />
    </WidgetCard>
  );
};

const CompatibilityWidget: React.FC<BloodWidgetProps> = ({ 
  fullBloodType, canDonateTo, canReceiveFrom, isUniversalDonor, isUniversalRecipient 
}) => {
  const isSpecial = isUniversalDonor || isUniversalRecipient;
  const specialLabel = isUniversalDonor ? '🌟 Universal Donor' : isUniversalRecipient ? '🌟 Universal Recipient' : '';
  
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(239, 68, 68, 0.4) 0%, rgba(220, 38, 38, 0.4) 100%)">
      <WidgetHeader icon="🩸" title="Blood Compatibility" />
      <BigNumber value={fullBloodType || ''} color="#ef4444" />
      {isSpecial && (
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '1rem',
          padding: '0.5rem 1rem',
          background: 'rgba(251, 191, 36, 0.2)',
          borderRadius: '20px',
        }}>
          <span style={{ color: '#fbbf24', fontWeight: 600 }}>{specialLabel}</span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: '0.75rem', borderRadius: '12px' }}>
          <div style={{ color: '#22c55e', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Can Donate To</div>
          <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}>{canDonateTo?.join(', ') || 'None'}</div>
        </div>
        <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.75rem', borderRadius: '12px' }}>
          <div style={{ color: '#3b82f6', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Can Receive From</div>
          <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}>{canReceiveFrom?.join(', ') || 'None'}</div>
        </div>
      </div>
      <WidgetFooter />
    </WidgetCard>
  );
};

const BabyBloodWidget: React.FC<BloodWidgetProps> = ({ possibleTypes, rhIncompatibilityRisk }) => {
  const topTypes = (possibleTypes || []).slice(0, 4);
  
  return (
    <WidgetCard gradient="linear-gradient(135deg, rgba(167, 139, 250, 0.4) 0%, rgba(139, 92, 246, 0.4) 100%)">
      <WidgetHeader icon="👶" title="Baby Blood Type" />
      {rhIncompatibilityRisk && (
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '1rem',
          padding: '0.5rem 1rem',
          background: 'rgba(239, 68, 68, 0.2)',
          borderRadius: '20px',
        }}>
          <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ Rh Incompatibility Risk</span>
        </div>
      )}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${Math.min(topTypes.length, 2)}, 1fr)`, 
        gap: '0.75rem' 
      }}>
        {topTypes.map((t, i) => (
          <StatBox key={i} label={`${t.percentage}%`} value={t.type} color="#a78bfa" />
        ))}
      </div>
      <WidgetFooter />
    </WidgetCard>
  );
};

export const BloodWidget: React.FC<BloodWidgetProps> = (props) => {
  switch (props.calculatorMode) {
    case 'donation':
      return <DonationWidget {...props} />;
    case 'compatibility':
      return <CompatibilityWidget {...props} />;
    case 'baby':
      return <BabyBloodWidget {...props} />;
    default:
      return <DonationWidget {...props} />;
  }
};

