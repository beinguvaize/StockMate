import { describe, it, expect } from 'vitest';
import { DEFAULT_PERMISSIONS } from './constants';
import {
  blankForm, formFromUser, pickTemplate, togglePermission, templatePermissions, visibleUsers, canOpenWords,
  userRowActions, initialsOf, avatarTone, seatNote, roleLabel, strengthWords, primaryRole,
} from './usersView';

const me = { id: 'u1', roles: ['OWNER'] };

describe('templates and switches (rules moved unchanged)', () => {
  it('fills a template and clears it back to STAFF when picked again', () => {
    const f = pickTemplate(blankForm(), 'SALES');
    expect(f.roles).toEqual(['SALES']);
    expect(f.permissions.sales).toEqual({ view: true, edit: true });
    expect(f.permissions.dashboard).toEqual({ view: false, edit: false });
    const back = pickTemplate(f, 'SALES');
    expect(back.roles).toEqual(['STAFF']);
    expect(back.permissions).toEqual(DEFAULT_PERMISSIONS);
  });

  it('owner switches every module on, custom switches all off', () => {
    expect(Object.values(templatePermissions('OWNER')).every((p) => p.view && p.edit)).toBe(true);
    expect(templatePermissions('CUSTOM')).toEqual(DEFAULT_PERMISSIONS);
    expect(templatePermissions('NOPE')).toBeNull();
  });

  it('edit on turns view on; view off turns edit off', () => {
    let f = togglePermission(blankForm(), 'reports', 'edit');
    expect(f.permissions.reports).toEqual({ view: true, edit: true });
    f = togglePermission(f, 'reports', 'view');
    expect(f.permissions.reports).toEqual({ view: false, edit: false });
  });

  it('opens an edit with the stored roles, or the single legacy role', () => {
    expect(formFromUser({ name: 'A', email: 'a@x', role: 'DRIVER' }).roles).toEqual(['DRIVER']);
    expect(formFromUser({ name: 'A', email: 'a@x' }).permissions).toEqual(DEFAULT_PERMISSIONS);
    expect('password' in formFromUser({ name: 'A', email: 'a@x', password: 'secret' })).toBe(false);
  });
});

describe('list', () => {
  const all = [{ id: 'u1', roles: ['OWNER'] }, { id: 'g', roles: ['GLOBAL_ADMIN'] }];
  it('hides platform admins from a shop login', () => {
    expect(visibleUsers(all, me).map((u) => u.id)).toEqual(['u1']);
    expect(visibleUsers(all, { roles: ['GLOBAL_ADMIN'] })).toHaveLength(2);
    expect(visibleUsers(undefined, me)).toEqual([]);
  });

  it('says what a login can open, by the same rules sign-in uses', () => {
    expect(canOpenWords({ roles: ['OWNER'] })).toBe('Every module, view and edit');
    expect(canOpenWords({ roles: ['SALES'] })).toBe('Sales, Clients, Day Book');
    expect(canOpenWords({ roles: ['DRIVER'] })).toBe('Vehicles, Sales');
    expect(canOpenWords({ roles: ['STAFF'] })).toMatch(/^View every module/);
    expect(canOpenWords({ roles: ['CUSTOM'], permissions: { expenses: { view: true, edit: true }, reports: { view: true }, daybook: { view: true } } }))
      .toBe('Expenses; view Reports and Day Book');
    expect(canOpenWords({ roles: ['CUSTOM'], permissions: {} })).toBe('Nothing yet');
  });

  it('never offers deactivate or remove on your own row, nor any action on a platform admin', () => {
    expect(userRowActions({ id: 'u1', status: 'ACTIVE' }, me)).toMatchObject({ canEdit: true, canToggle: false, canRemove: false, isSelf: true });
    expect(userRowActions({ id: 'u2', status: 'INACTIVE' }, me)).toMatchObject({ canToggle: true, canRemove: true, active: false });
    expect(userRowActions({ id: 'g', roles: ['GLOBAL_ADMIN'] }, me)).toMatchObject({ canManage: false, canEdit: false, canRemove: false });
    expect(userRowActions({ id: 'g', roles: ['GLOBAL_ADMIN'] }, { id: 'x', roles: ['GLOBAL_ADMIN'] }).canManage).toBe(true);
  });

  it('initials, tints and labels', () => {
    expect(initialsOf('Person One Two')).toBe('PT');
    expect(initialsOf('solo')).toBe('S');
    expect(initialsOf('')).toBe('?');
    expect(avatarTone('SALES')).toBe('b');
    expect(avatarTone('DRIVER')).toBe('');
    expect(roleLabel('INVENTORY')).toBe('Inventory');
    expect(primaryRole({})).toBe('SALES');
    expect(strengthWords(3)).toBe('Good');
  });

  it('counts active logins against the plan seat cap', () => {
    const us = [{ status: 'ACTIVE' }, { status: 'ACTIVE' }, { status: 'INACTIVE' }];
    expect(seatNote(us, 'PRO').words).toBe('2 active logins of 5 on Pro');
    expect(seatNote(us, 'ENTERPRISE').words).toMatch(/no limit$/);
    expect(seatNote([{ status: 'ACTIVE' }], null).words).toBe('1 active login');
  });
});
