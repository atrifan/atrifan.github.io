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
    if (process.env.NODE_ENV !== 'production' || !shouldShowAds() || ADS_CONFIG.testMode || !isReady) return;
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
  // Fixed size: 384px wide, 72px tall for horizontal, 480px tall for vertical
  const width = '384px';
  const height = isHorizontal ? '72px' : '480px';

  // Dev/test placeholder
  if (ADS_CONFIG.testMode || process.env.NODE_ENV !== 'production') {
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
          <span>{format}</span>
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
        data-ad-format="auto"
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
      // Only show ads on screens >= 2230px wide and >= 780px tall
      setIsVisible(screenWidth >= 2230 && screenHeight >= 780);
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
    gap: '12px',
    zIndex: 100,
    padding: '8px',
  };

  return (
    <>
      {/* Left Side */}
      <div style={{ ...columnStyle, left: '8px' }}>
        <SideAd slot={leftTopSlot} format="horizontal" />
        <SideAd slot={leftMiddleSlot} format="vertical" />
        <SideAd slot={leftBottomSlot} format="horizontal" />
      </div>

      {/* Right Side */}
      <div style={{ ...columnStyle, right: '8px' }}>
        <SideAd slot={rightTopSlot} format="horizontal" />
        <SideAd slot={rightMiddleSlot} format="vertical" />
        <SideAd slot={rightBottomSlot} format="horizontal" />
      </div>
    </>
  );
};

