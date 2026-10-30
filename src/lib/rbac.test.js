import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { permits, ROLE_MODULES, RBAC_MODULE_MAP } from './rbac';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(src, rel), 'utf8');

/**
 * The nav and the router must answer the same question the same way.
 * ==========================================================================
 *
 * Two tables decide whether someone reaches a page. AppLayout's navItem()
 * says whether the link is offered; ProtectedRoute says whether the URL
 * opens. Both consult the role matrix, and the matrix is keyed by the JOB
 * someone does -- sales, inventory, daybook -- not by the page.
 *
 * Plans are sold per page, so ProtectedRoute's moduleMap is keyed per page
 * ('labels' is its own Enterprise line item). Feeding a page name to the
 * matrix asks it about a module it has never heard of, which only OWNER and
 * GLOBAL_ADMIN survive: an INVENTORY user saw Labels in the nav and got
 * "Security Restricted" on opening it. RBAC_MODULE_MAP bridges the two.
 *
 * These tests fail if the bridge rots -- a nav key changed without the map,
 * a map value that is not a real module, a page added to the nav under a
 * module the router will not recognise.
 */

const EVERY_MODULE = [...new Set(Object.values(ROLE_MODULES).flat())];

const user = (roles, permissions = null) => ({ roles, permissions });

describe('permits — the role matrix', () => {
  it('lets OWNER and GLOBAL_ADMIN do everything, on any module', () => {
    for (const role of ['OWNER', 'GLOBAL_ADMIN']) {
      for (const mod of [...EVERY_MODULE, 'labels', 'settings', 'nonsense']) {
        expect(permits(user([role]), mod, 'delete'), `${role}/${mod}`).toBe(true);
      }
    }
  });

  it('gives STAFF view on everything and writes on only its three modules', () => {
    const staff = user(['STAFF']);
    expect(permits(staff, 'reports', 'view')).toBe(true);
    expect(permits(staff, 'inventory', 'view')).toBe(true);
    for (const mod of ROLE_MODULES.STAFF) {
      expect(permits(staff, mod, 'edit'), mod).toBe(true);
    }
    for (const action of ['create', 'edit', 'delete']) {
      expect(permits(staff, 'inventory', action), action).toBe(false);
    }
  });

  it('scopes SALES, INVENTORY and DRIVER to their own modules, view included', () => {
    for (const role of ['SALES', 'INVENTORY', 'DRIVER']) {
      const u = user([role]);
      for (const mod of EVERY_MODULE) {
        const expected = ROLE_MODULES[role].includes(mod);
        expect(permits(u, mod, 'view'), `${role} view ${mod}`).toBe(expected);
        expect(permits(u, mod, 'edit'), `${role} edit ${mod}`).toBe(expected);
      }
      // No dashboard for these templates -- that is deliberate (privacy).
      expect(permits(u, 'dashboard', 'view'), role).toBe(false);
    }
  });

  it('reads the granular permissions object for CUSTOM and unknown roles', () => {
    const custom = user(['CUSTOM'], { inventory: { view: true, edit: true } });
    expect(permits(custom, 'inventory', 'view')).toBe(true);
    expect(permits(custom, 'inventory', 'edit')).toBe(true);
    expect(permits(custom, 'inventory', 'delete')).toBe(false);
    expect(permits(custom, 'sales', 'view')).toBe(false);
    expect(permits(user(['CUSTOM'], null), 'inventory', 'view')).toBe(false);
    expect(permits(user([]), 'inventory', 'view')).toBe(false);
  });

  it('refuses a signed-out user', () => {
    expect(permits(null, 'sales', 'view')).toBe(false);
    expect(permits(undefined, 'sales', 'view')).toBe(false);
  });
});

describe('RBAC_MODULE_MAP — the bridge the router uses', () => {
  it('maps every page to a module the matrix actually knows', () => {
    for (const [path, mod] of Object.entries(RBAC_MODULE_MAP)) {
      expect(EVERY_MODULE, `${path} -> ${mod}`).toContain(mod);
    }
  });

  it('never maps a page to its own name, which is what the bug was', () => {
    for (const [path, mod] of Object.entries(RBAC_MODULE_MAP)) {
      expect(mod, path).not.toBe(path);
    }
  });

  it('agrees with the module AppLayout gates each nav link on', () => {
    const nav = read('components/AppLayout.jsx');
    const found = {};
    for (const m of nav.matchAll(/navItem\([^)]*?'\/([a-z-]+)'.*?\/>\s*,\s*'([a-z-]+)'/g)) {
      found[m[1]] = m[2];
    }
    // The regex has to keep finding links, or this test silently passes on nothing.
    expect(Object.keys(found).length).toBeGreaterThan(10);
    for (const [path, mod] of Object.entries(RBAC_MODULE_MAP)) {
      if (!(path in found)) continue;   // not in the nav: reachable by URL only
      expect(found[path], `nav gates /${path} on '${found[path]}', map says '${mod}'`).toBe(mod);
    }
  });

  it('bridges every nav link whose module the matrix would not recognise', () => {
    const nav = read('components/AppLayout.jsx');
    const router = read('components/ProtectedRoute.jsx');
    for (const m of nav.matchAll(/navItem\([^)]*?'\/([a-z-]+)'.*?\/>\s*,\s*'([a-z-]+)'/g)) {
      const [, path, navModule] = m;
      // Only paths the router plan-gates can reach the RBAC guard with a key.
      if (!new RegExp(`'${path}':\\s*'`).test(router)) continue;
      if (navModule === path) continue;             // nav and router already agree
      if (EVERY_MODULE.includes(path)) continue;    // the page name IS a module
      expect(RBAC_MODULE_MAP[path],
        `/${path} is offered under '${navModule}' but the router would ask the matrix about '${path}'`,
      ).toBe(navModule);
    }
  });

  it('is the only copy — no inline matrix left in the two callers', () => {
    expect(read('context/AuthContext.jsx')).toContain("from '../lib/rbac'");
    expect(read('components/ProtectedRoute.jsx')).toContain("from '../lib/rbac'");
    expect(read('components/ProtectedRoute.jsx')).not.toMatch(/const rbacMap\s*=/);
    expect(read('context/AuthContext.jsx')).not.toMatch(/salesModules|invModules|driverModules/);
  });
});

describe('the seven bridged pages, per role', () => {
  const cases = [
    ['labels',        'INVENTORY', true],
    ['manufacturing', 'INVENTORY', true],
    ['labels',        'SALES',     false],
    ['invoices',      'SALES',     true],
    ['estimates',     'SALES',     true],
    ['appointments',  'SALES',     true],
    ['kds',           'SALES',     true],
    ['accounts',      'SALES',     true],
    ['invoices',      'INVENTORY', false],
    ['labels',        'DRIVER',    false],
    ['accounts',      'DRIVER',    false],
  ];
  it.each(cases)('/%s opens for %s: %s', (path, role, expected) => {
    const key = RBAC_MODULE_MAP[path] || path;
    expect(permits(user([role]), key, 'view')).toBe(expected);
  });

  it('still lets a STAFF user view them, as it did before', () => {
    for (const path of Object.keys(RBAC_MODULE_MAP)) {
      const key = RBAC_MODULE_MAP[path] || path;
      expect(permits(user(['STAFF']), key, 'view'), path).toBe(true);
    }
  });
});
