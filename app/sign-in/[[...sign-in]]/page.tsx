import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In - Tulzo',
  description: 'Sign in to your Tulzo account to access your dashboard and API keys.',
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <SignIn
        appearance={{
          elements: {
            rootBox: {
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            },
          },
        }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/"
      />
    </div>
  );
}

