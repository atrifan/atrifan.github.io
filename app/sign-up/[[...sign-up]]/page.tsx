import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up - Tulzo',
  description: 'Create your Tulzo account to access premium features and API keys.',
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <SignUp
        appearance={{
          elements: {
            rootBox: {
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            },
          },
        }}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/"
      />
    </div>
  );
}

