import Link from 'next/link';
import { TulzoMark } from '../components/brand/TulzoMark';

/** 404 page. No ads here (AdSense policy: no ads on pages without content). */
export const NotFoundPage = () => {
  return (
    <div className="page">
      <section className="hero">
        <TulzoMark size={64} className="hero-mark" />
        <p className="eyebrow">404</p>
        <h1 className="hero-title">Page not found</h1>
        <p className="hero-lede">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <div className="actions">
          <Link href="/" className="btn btn-primary">
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
};
