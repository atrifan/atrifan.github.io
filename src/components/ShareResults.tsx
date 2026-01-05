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

// Social Media SVG Icons
const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const InstagramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

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
              <button onClick={() => handleSocialShare('twitter')} style={{...buttonStyle, justifyContent: 'center', background: '#000'}}>
                <XIcon /> X / Twitter
              </button>

              <button onClick={() => handleSocialShare('facebook')} style={{...buttonStyle, justifyContent: 'center', background: '#1877f2'}}>
                <FacebookIcon /> Facebook
              </button>

              <button onClick={() => handleSocialShare('instagram')} style={{...buttonStyle, justifyContent: 'center', background: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'}}>
                <InstagramIcon /> Instagram
              </button>

              <button onClick={() => handleSocialShare('linkedin')} style={{...buttonStyle, justifyContent: 'center', background: '#0a66c2'}}>
                <LinkedInIcon /> LinkedIn
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

