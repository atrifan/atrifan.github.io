import React from 'react';

interface AlertModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  icon?: string;
  buttonText?: string;
  color?: string;
  onClose: () => void;
}

/**
 * Reusable Alert Modal Component
 * Replaces browser alert() with a styled modal
 */
export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  title,
  message,
  icon = '⚠️',
  buttonText = 'Got it',
  color = '#f59e0b',
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`,
          border: `2px solid ${color}66`,
          borderRadius: '24px',
          padding: '2rem',
          maxWidth: '25rem',
          width: '100%',
          textAlign: 'center',
          boxShadow: `0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px ${color}33`,
          animation: 'modalPop 0.3s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>
          {icon}
        </span>
        <h3
          style={{
            color: color,
            fontSize: '1.5rem',
            fontWeight: 700,
            marginBottom: '0.75rem',
            margin: 0,
          }}
        >
          {title}
        </h3>
        <p
          style={{
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '1.1rem',
            lineHeight: 1.6,
            marginTop: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          {message}
        </p>
        <button
          onClick={onClose}
          style={{
            padding: '1rem 2.5rem',
            fontSize: '1.1rem',
            fontWeight: 700,
            background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`,
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            boxShadow: `0 4px 20px ${color}66`,
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {buttonText}
        </button>
      </div>
      <style>{`
        @keyframes modalPop {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

