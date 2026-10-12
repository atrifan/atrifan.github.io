import { surfaceUrl } from '@/src/lib/surface-url';

/** "← Admin": the way back to the admin home (hub /admin) from every admin page. */
export function AdminSubNav() {
  return (
    <nav aria-label="Admin" className="admin-subnav">
      <a href={surfaceUrl('hub', '/admin')} className="admin-subnav-link">
        <span aria-hidden="true">←</span> Admin
      </a>
    </nav>
  );
}
