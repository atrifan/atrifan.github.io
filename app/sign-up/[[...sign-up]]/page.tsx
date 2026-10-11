import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up - Tulzo',
  description: 'Create your Tulzo account to access premium features and API keys.',
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <div className="auth-page">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/"
      />
    </div>
  );
}

