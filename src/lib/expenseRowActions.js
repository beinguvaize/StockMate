/**
 * What can be done to one expense from the Expenses page: the row's "···"
 * menu and the detail panel both ask here, so a rule about which expenses
 * may be changed lives in this one place.
 *
 * Today it is the permission checks the page has always made. (Payroll
 * salary rows can still be edited and deleted here: a known defect, left as
 * it is for now.)
 */
export function expenseRowActions(expense, hasPermission) {
  const can = (p) => (typeof hasPermission === 'function' ? !!hasPermission(p) : false);
  return {
    canEdit: !!expense && can('EDIT_EXPENSE'),
    canDelete: !!expense && can('DELETE_EXPENSE'),
    // Why the row cannot be changed, shown in the panel; null when it can.
    readOnlyReason: null,
  };
}

export default expenseRowActions;
