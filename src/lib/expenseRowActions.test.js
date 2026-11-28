import { describe, it, expect } from 'vitest';
import { expenseRowActions } from './expenseRowActions';

describe('expenseRowActions', () => {
  const perms = (...p) => (k) => p.includes(k);
  it('follows the edit and delete permissions', () => {
    expect(expenseRowActions({ id: 'a' }, perms('EDIT_EXPENSE', 'DELETE_EXPENSE'))).toMatchObject({ canEdit: true, canDelete: true, readOnlyReason: null });
    expect(expenseRowActions({ id: 'a' }, perms('EDIT_EXPENSE'))).toMatchObject({ canEdit: true, canDelete: false });
    expect(expenseRowActions({ id: 'a' }, perms())).toMatchObject({ canEdit: false, canDelete: false });
  });
  it('nothing for no expense or no permission check', () => {
    expect(expenseRowActions(null, perms('EDIT_EXPENSE'))).toMatchObject({ canEdit: false, canDelete: false });
    expect(expenseRowActions({ id: 'a' }, undefined)).toMatchObject({ canEdit: false, canDelete: false });
  });
});
