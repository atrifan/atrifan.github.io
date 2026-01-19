import React, { useEffect, useRef, useState } from 'react';
import { View } from '@adobe/react-spectrum';
import { ADS_CONFIG, getAdClient, shouldShowAds } from '../config/ads.config';

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'horizontal' | 'vertical';
  style?: React.CSSProperties;
  /** Delay in ms before showing ad - ensures content loads first */
  delay?: number;
  /** Only show ad when this condition is true (e.g., when results are available) */
  showWhen?: boolean;
}

/**
 * Google AdSense Banner Component
 * Matches AdSense's expected code structure:
 * - <ins> element with required data attributes
 * - Push call to initialize the ad
 *
 * AdSense Policy Compliance:
 * - Delays ad loading to ensure content is present (2s default)
 * - Can conditionally show ads only when meaningful content exists
 */
export const AdBanner: React.FC<AdBannerProps> = ({
  slot,
  format = 'auto',
  style = {},
  delay = 2000,
  showWhen = true
}) => {
  const adRef = useRef<HTMLModElement>(null);
  const isAdLoaded = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // Delay ad rendering to ensure page content loads first
  useEffect(() => {
    if (!showWhen) {
      setIsReady(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsReady(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, showWhen]);

  useEffect(() => {
    // Only load ads when enabled, ready, and only once per component
    // Note: Google won't serve real ads on localhost, but we can test the containers
    if (!shouldShowAds() || ADS_CONFIG.testMode || !isReady) {
      return;
    }

    // Prevent double-loading
    if (isAdLoaded.current) {
      return;
    }

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

  // Don't render if ads are disabled or showWhen condition is false
  if (!shouldShowAds() || !showWhen) {
    return null;
  }

  // Show placeholder in test mode only
  if (ADS_CONFIG.testMode) {
    if (!isReady) return null;

    // Match production dimensions in dev mode
    const isVertical = format === 'vertical';
    const height = isVertical ? '16rem' : '6rem';

    return (
      <View
        borderRadius="medium"
        marginY="size-200"
        UNSAFE_style={{
          width: '100%',
          maxWidth: '38rem',
          height,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
          border: '2px dashed rgba(255, 255, 255, 0.2)',
          borderRadius: '12px',
          ...style
        }}
      >
        <div style={{
          textAlign: 'center',
          color: 'rgba(255, 255, 255, 0.4)',
          padding: '0.5rem'
        }}>
          <span style={{ fontSize: '1rem', display: 'block', marginBottom: '0.15rem' }}>📢</span>
          <span style={{ fontSize: '0.7rem' }}>Ad: {slot} ({isVertical ? 'vertical' : 'horizontal'} - {height})</span>
        </div>
      </View>
    );
  }

  // Don't render production ad until ready (content has loaded)
  if (!isReady) {
    return null;
  }

  // Production ad - matches AdSense code structure exactly
  // Constrain height for horizontal and auto formats to prevent oversized mobile ads
  const isVertical = format === 'vertical';

  return (
    <View
      marginY="size-200"
      UNSAFE_style={{
        width: '100%',
        maxWidth: '38rem',
        margin: '0 auto',
        minHeight: isVertical ? '16rem' : '3rem',
        maxHeight: isVertical ? undefined : '6rem',
        overflow: 'hidden',
        ...style
      }}
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{
          display: 'block',
          maxHeight: isVertical ? undefined : '6rem',
        }}
        data-ad-client={getAdClient()}
        data-ad-slot={slot}
        data-ad-format={isVertical ? format : 'horizontal'}
        data-full-width-responsive="false"
      />
    </View>
  );
};

