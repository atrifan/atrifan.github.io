import { describe, expect, it } from 'vitest';
import { isAdminPath } from '@/src/lib/surface-routing';

describe('isAdminPath (the primary nav "Admin" item is current)', () => {
  it('path mode: hub /admin[/*] and /marketplace/admin[/*]', () => {
    for (const pathname of ['/admin', '/admin/', '/admin/qa', '/admin/disputes/42', '/marketplace/admin', '/marketplace/admin/x']) {
      expect(isAdminPath({ surface: null, pathname }), pathname).toBe(true);
    }
  });

  it('path mode: everything else', () => {
    for (const pathname of [
      '/',
      '/administrator',
      '/pricing',
      '/ai',
      '/ai/admin',
      '/marketplace',
      '/marketplace/administrator',
      '/marketplace/packages/admin',
      '/gigs/admin',
      '/chat/admin',
      '/dashboard/admin/packages',
      '/x/admin',
    ]) {
      expect(isAdminPath({ surface: null, pathname }), pathname).toBe(false);
    }
  });

  it('surface mode: /admin on the hub and on marketplace (its /marketplace/admin), never elsewhere', () => {
    expect(isAdminPath({ surface: 'hub', pathname: '/admin' })).toBe(true);
    expect(isAdminPath({ surface: 'hub', pathname: '/admin/qa' })).toBe(true);
    expect(isAdminPath({ surface: 'marketplace', pathname: '/admin' })).toBe(true);
    expect(isAdminPath({ surface: 'marketplace', pathname: '/marketplace/admin' })).toBe(true);
    expect(isAdminPath({ surface: 'hub', pathname: '/' })).toBe(false);
    expect(isAdminPath({ surface: 'hub', pathname: '/administrator' })).toBe(false);
    expect(isAdminPath({ surface: 'marketplace', pathname: '/' })).toBe(false);
    for (const surface of ['ai', 'gigs', 'chat'] as const) {
      expect(isAdminPath({ surface, pathname: '/admin' }), surface).toBe(false);
      expect(isAdminPath({ surface, pathname: `/${surface}/admin` }), surface).toBe(false);
    }
  });
});
