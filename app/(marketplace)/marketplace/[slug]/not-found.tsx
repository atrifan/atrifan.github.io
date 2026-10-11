import { surfaceUrl } from '@/src/lib/surface-url';

export default function PackageNotFound() {
  return (
    <div className="page mp-page">
      <div className="mp-empty">
        <h1 className="mp-empty-title">Package not found</h1>
        <p className="muted">It may have been removed, or it is still waiting for review.</p>
        <a className="btn btn-secondary" href={surfaceUrl('marketplace', '/')}>
          Browse the marketplace
        </a>
      </div>
    </div>
  );
}
