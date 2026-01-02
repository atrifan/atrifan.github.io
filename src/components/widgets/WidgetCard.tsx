'use client';

import React from 'react';

interface WidgetCardProps {
  children: React.ReactNode;
  gradient: string;
  borderColor?: string;
}

export const WidgetCard: React.FC<WidgetCardProps> = ({ children, gradient, borderColor }) => (
  <div style={{
    background: gradient,
    borderRadius: '24px',
    padding: '1.5rem',
    border: `2px solid ${borderColor || 'rgba(255,255,255,0.3)'}`,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#fff',
    minWidth: '300px',
    maxWidth: '400px',
  }}>
    {children}
  </div>
);

interface StatBoxProps {
  label: string;
  value: string | number;
  highlight?: boolean;
  color?: string;
}

export const StatBox: React.FC<StatBoxProps> = ({ label, value, highlight, color }) => (
  <div style={{
    background: highlight ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)',
    padding: '1rem',
    borderRadius: '12px',
    textAlign: 'center',
  }}>
    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>{label}</div>
    <div style={{ color: color || '#fff', fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
  </div>
);

interface BigNumberProps {
  value: string | number;
  label?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BigNumber: React.FC<BigNumberProps> = ({ value, label, color = '#fff', size = 'lg' }) => {
  const fontSize = size === 'lg' ? '3rem' : size === 'md' ? '2rem' : '1.5rem';
  return (
    <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
      <div style={{ fontSize, fontWeight: 800, color }}>{value}</div>
      {label && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem' }}>{label}</div>}
    </div>
  );
};

export const WidgetHeader: React.FC<{ icon: string; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
    <span style={{ fontSize: '2rem' }}>{icon}</span>
    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>{title}</div>
    {subtitle && <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>{subtitle}</div>}
  </div>
);

export const WidgetFooter: React.FC = () => (
  <div style={{ 
    marginTop: '1rem', 
    paddingTop: '0.75rem', 
    borderTop: '1px solid rgba(255,255,255,0.1)',
    textAlign: 'center',
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.4)',
  }}>
    Powered by <a href="https://tulzo.vercel.app" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>tulzo.vercel.app</a>
  </div>
);

