'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ADS_CONFIG, getAdClient, shouldShowAds } from '../config/ads.config';

interface SideAdProps {
  slot: string;
  format: 'horizontal' | 'vertical';
}

const SideAd: React.FC<SideAdProps> = ({ slot, format }) => {
  const adRef = useRef<HTMLModElement>(null);
  const isAdLoaded = useRef(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Note: Google won't serve real ads on localhost, but we can test the containers
    if (!shouldShowAds() || ADS_CONFIG.testMode || !isReady) return;
    if (isAdLoaded.current) return;
    try {
      const adsbygoogle = (window as any).adsbygoogle;
      if (adsbygoogle && adRef.current) {
        adsbygoogle.push({});
        isAdLoaded.current = true;
      }
    } catch (err) {
      console.error('AdSense error:', err);
    }
  }, [slot, isReady]);

  if (!shouldShowAds()) return null;

  const isHorizontal = format === 'horizontal';
  // Sizes: 22rem wide, 6rem tall for horizontal, 38rem tall for vertical
  const width = '22rem';
  const height = isHorizontal ? '6rem' : '38rem';

  // Test mode placeholder
  if (ADS_CONFIG.testMode) {
    if (!isReady) return null;
    return (
      <div style={{
        width,
        height,
        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
        border: '2px dashed rgba(255, 255, 255, 0.2)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.6rem' }}>
          <span style={{ display: 'block', marginBottom: '0.1rem' }}>📢</span>
          <span style={{ display: 'block' }}>{slot}</span>
          <span>{format} ({width}x{height})</span>
        </div>
      </div>
    );
  }

  if (!isReady) return null;

  return (
    <div style={{ width, height, overflow: 'hidden', flexShrink: 0 }}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: '100%' }}
        data-ad-client={getAdClient()}
        data-ad-slot={slot}
        data-ad-format={format}
      />
    </div>
  );
};

interface SideAdsProps {
  leftTopSlot: string;
  leftMiddleSlot: string;
  leftBottomSlot: string;
  rightTopSlot: string;
  rightMiddleSlot: string;
  rightBottomSlot: string;
}

export const SideAds: React.FC<SideAdsProps> = ({
  leftTopSlot,
  leftMiddleSlot,
  leftBottomSlot,
  rightTopSlot,
  rightMiddleSlot,
  rightBottomSlot,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const checkVisibility = () => {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      // Show ads on screens >= 1700px wide and >= 850px tall
      setIsVisible(screenWidth >= 1700 && screenHeight >= 850);
    };

    checkVisibility();
    window.addEventListener('resize', checkVisibility);
    return () => window.removeEventListener('resize', checkVisibility);
  }, []);

  if (!isVisible) return null;

  const columnStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    zIndex: 100,
    padding: '0.25rem',
  };

  return (
    <>
      {/* Left Side */}
      <div style={{ ...columnStyle, left: '0.5rem' }}>
        <SideAd slot={leftTopSlot} format="horizontal" />
        <SideAd slot={leftMiddleSlot} format="vertical" />
        <SideAd slot={leftBottomSlot} format="horizontal" />
      </div>

      {/* Right Side */}
      <div style={{ ...columnStyle, right: '0.5rem' }}>
        <SideAd slot={rightTopSlot} format="horizontal" />
        <SideAd slot={rightMiddleSlot} format="vertical" />
        <SideAd slot={rightBottomSlot} format="horizontal" />
      </div>
    </>
  );
};

