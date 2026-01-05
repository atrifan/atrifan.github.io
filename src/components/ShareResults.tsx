'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import html2canvas from 'html2canvas';

interface ShareResultsProps {
  /** Ref to the element to capture */
  targetRef: React.RefObject<HTMLElement>;
  /** Title for sharing */
  title: string;
  /** Description/text for sharing */
  text?: string;
  /** URL to share (defaults to current page) */
  url?: string;
}

/**
 * Share button that captures a screenshot and allows sharing to various platforms
 * Works without server storage by using:
 * - Web Share API (native sharing with image file)
 * - Clipboard API (copy image)
 * - Social links (share URL)
 */
export const ShareResults: React.FC<ShareResultsProps> = ({
  targetRef,
  title,
  text,
  url,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Capture screenshot
  const captureScreenshot = useCallback(async (): Promise<Blob | null> => {
    if (!targetRef.current) return null;

    setIsCapturing(true);
    setError(null);

    try {
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: '#1e293b',
        scale: 2, // Higher quality
        logging: false,
        useCORS: true,
      });

      canvasRef.current = canvas;

      // Store data URL for preview and social sharing
      const dataUrl = canvas.toDataURL('image/png');
      setImageDataUrl(dataUrl);

      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/png');
      });
    } catch (err) {
      console.error('Screenshot failed:', err);
      setError('Failed to capture screenshot');
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [targetRef]);

  // Pre-capture when modal opens
  const handleOpenModal = async () => {
    setIsOpen(true);
    if (!imageDataUrl) {
      await captureScreenshot();
    }
  };

  // Native share (mobile/supported browsers)
  const handleNativeShare = async () => {
    const blob = await captureScreenshot();
    if (!blob) return;

    const file = new File([blob], `${title.toLowerCase().replace(/\s+/g, '-')}-results.png`, {
      type: 'image/png',
    });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title,
          text: text || title,
          files: [file],
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      // Fallback: download the image
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-results.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setIsOpen(false);
  };

  // Copy image to clipboard
  const handleCopyImage = async () => {
    const blob = await captureScreenshot();
    if (!blob) return;

    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      setError('Failed to copy image');
    }
  };

  // Download image
  const handleDownload = async () => {
    const blob = await captureScreenshot();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-results.png`;
    a.click();
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  // Social share (URL only - platforms don't support direct image upload via URL)
  const handleSocialShare = (platform: 'facebook' | 'twitter' | 'linkedin' | 'instagram') => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text || title);

    if (platform === 'instagram') {
      // Instagram doesn't have a web share API - copy image and show instructions
      handleCopyImage().then(() => {
        alert('Image copied to clipboard! Open Instagram and paste it in a new post or story.');
      });
      return;
    }

    const urls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    };

    window.open(urls[platform as keyof typeof urls], '_blank', 'width=600,height=400');
    setIsOpen(false);
  };

  const buttonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    background: 'rgba(255,255,255,0.05)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '0.9rem',
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.2s',
  };

  return (
    <>
      {/* Share Button - Centered */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <button
          onClick={handleOpenModal}
          disabled={isCapturing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.25rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            borderRadius: '10px',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: isCapturing ? 'wait' : 'pointer',
            opacity: isCapturing ? 0.7 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          {isCapturing ? 'Capturing...' : 'Share'}
        </button>
      </div>

      {/* Modal */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 9998,
            }}
          />

          {/* Modal Content */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            borderRadius: '20px',
            padding: '1.5rem',
            width: 'calc(100% - 2rem)',
            maxWidth: '25rem',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
            zIndex: 9999,
          }}>
            {/* Header with Close Button */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}>
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                Share Results
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#fff',
                  fontSize: '1.25rem',
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Image Preview */}
            {imageDataUrl && (
              <div style={{
                marginBottom: '1rem',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <img
                  src={imageDataUrl}
                  alt="Preview"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </div>
            )}

            {error && (
              <p style={{ color: '#ef4444', fontSize: '0.85rem', padding: '0.5rem', margin: '0 0 1rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>
                {error}
              </p>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Native Share / Download */}
              <button onClick={handleNativeShare} style={buttonStyle}>
                <span style={{ fontSize: '1.1rem' }}>📤</span> Share / Save Image
              </button>

              {/* Copy Image */}
              <button onClick={handleCopyImage} style={buttonStyle}>
                <span style={{ fontSize: '1.1rem' }}>{copied ? '✓' : '📋'}</span> {copied ? 'Copied!' : 'Copy Image'}
              </button>

              {/* Download */}
              <button onClick={handleDownload} style={buttonStyle}>
                <span style={{ fontSize: '1.1rem' }}>⬇️</span> Download Image
              </button>
            </div>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '1rem 0' }} />

            {/* Social Share */}
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 0.75rem', fontWeight: 500 }}>
              Share to social media:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              <button onClick={() => handleSocialShare('twitter')} style={{...buttonStyle, justifyContent: 'center'}}>
                <span style={{ fontSize: '1.1rem' }}>𝕏</span> X / Twitter
              </button>

              <button onClick={() => handleSocialShare('facebook')} style={{...buttonStyle, justifyContent: 'center'}}>
                <span style={{ fontSize: '1.1rem' }}>📘</span> Facebook
              </button>

              <button onClick={() => handleSocialShare('instagram')} style={{...buttonStyle, justifyContent: 'center', background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'}}>
                <span style={{ fontSize: '1.1rem' }}>📷</span> Instagram
              </button>

              <button onClick={() => handleSocialShare('linkedin')} style={{...buttonStyle, justifyContent: 'center'}}>
                <span style={{ fontSize: '1.1rem' }}>💼</span> LinkedIn
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

