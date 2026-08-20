import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { usePayroll } from '../hooks/usePayroll';
import { findOverlapping, describePeriod, monthIsPaid, paidByEmployeeInMonth } from '../lib/payrollPeriods';
import { usePeople } from '../hooks/usePeople';
import { useAccounts, accountForMethod } from '../hooks/useAccounts';
import { DollarSign, Trash2, X, Check, CreditCard, UserPlus, Lock, Receipt, Link2, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

// Sub-components
import PayrollHeader from '../components/payroll/PayrollHeader';
import EmployeeTable from '../components/payroll/EmployeeTable';
import PayHistory from '../components/payroll/PayHistory';
import { todayISOInAppTZ } from '../lib/utils';
import { salariedBasePay } from '../lib/monthlyPay';
import { needsOverlapConfirmation } from '../lib/payrollPeriods';
import { iso } from '../lib/reportPeriods';

// HOURLY is gone. It never computed by the hour -- openPayRun paid hourly staff
// by the DAY off daily_rate, and hoursWorked was the constant 160 everywhere --
// while updatePayRunItem re-read basePay as an hourly RATE and multiplied it by
// those 160 hours, so editing any field on an hourly employee multiplied their
// pay 160-fold and silently dropped deductions and alreadyPaid with it. Nobody
// had ever created one, so nothing is migrated; a legacy row is treated as DAILY.
const PAY_TYPES = ['MONTHLY', 'WEEKLY', 'DAILY'];

// A legacy HOURLY row is paid as DAILY -- which is exactly what the old code
// did before its own hourly branch corrupted the figure.
const isDailyWage = (t) => ['DAILY', 'HOURLY'].includes(String(t || '').toUpperCase());
const DEPARTMENTS = ['Operations', 'Sales', 'Warehouse', 'Delivery', 'Management', 'Admin'];

const Payroll = () => {
  const { hasPermission, hasRole } = useAuth();
  const { currentTenantId, businessProfile } = useTenant();
  // Named so a bank or UPI payslip can say which account the money left.
  const { accounts: payAccounts = [] } = useAccounts(currentTenantId);
  const { users } = usePeople(currentTenantId);
  const {
    employees, addEmployee, updateEmployee, deleteEmployee,
    payrollRecords, payrollPaymentMethods, processPayroll, deletePayrollRecord, resetEmployeesDailyData,
    loadAttendance, saveAttendanceBatch,
    loading: payLoading
  } = usePayroll(currentTenantId);

  const isViewOnly = () => false;

  const [activeTab, setActiveTab] = useState('EMPLOYEES');
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showPayRunModal, setShowPayRunModal] = useState(false);
  const [payRunMonth, setPayRunMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [payRunItems, setPayRunItems] = useState([]);
  // MONTHLY | WEEKLY | CUSTOM. CUSTOM exists because neither of the other two
  // matches how wages are actually paid here: 28 salary payouts so far, at gaps
  // of 2, 2, 2, 2, 3, 3, 4 days. A fixed 7-day week cannot express that, so the
  // Payroll module went unused and every payout was typed into Expenses by hand.
  const [payPeriodType, setPayPeriodType] = useState('MONTHLY');
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod2, setPayMethod2] = useState('CASH'); // how this run is paid out

  // ── Attendance state ─────────────────────────────────────────────────
  // What is actually in the database for the visible month.
  const [savedAtt, setSavedAtt] = useState({});   // { [empId]: { [day]: { status, custom_rate } } }
  // Edits not yet written. A day mapped to null means "clear this one".
  const [pendingAtt, setPendingAtt] = useState({});
  const [attSaving, setAttSaving] = useState(false);
  const [attSaveError, setAttSaveError] = useState(null);
  const [attPicker, setAttPicker] = useState(null); // { empId, day, dayNum, rate } — open cell
  // The picker is rendered through a portal, because its cell sits inside an
  // overflow-hidden card AND an overflow-x-auto scroller — an absolutely
  // positioned popover is clipped by both. Same reason ProductPicker in
  // MultiPurchaseForm.jsx portals its list.
  const attAnchorRef = useRef(null);
  const [attRect, setAttRect] = useState(null);
  const [attRateDraft, setAttRateDraft] = useState({});   // { [empId]: '900' }
  const [attApplyNote, setAttApplyNote] = useState(null); // { empId, text }

  useLayoutEffect(() => {
    if (!attPicker) { setAttRect(null); return undefined; }
    const measure = () => {
      const el = attAnchorRef.current;
      if (el) setAttRect(el.getBoundingClientRect());
    };
    measure();
    // Capture phase, so the grid's own horizontal scroll moves it too — not
    // just the window's.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [attPicker]);

  useEffect(() => {
    if (!attPicker) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setAttPicker(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attPicker]);
  const [attLoading, setAttLoading] = useState(false);

  const attYear  = useMemo(() => parseInt(payRunMonth.split('-')[0]), [payRunMonth]);
  const attMonth = useMemo(() => parseInt(payRunMonth.split('-')[1]), [payRunMonth]);
  const daysInMonth = useMemo(() => new Date(attYear, attMonth, 0).getDate(), [attYear, attMonth]);
  const attDays  = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const padZ     = (n) => String(n).padStart(2, '0');

  const dailyWageEmps = useMemo(
    () => employees.filter(e => e.status === 'ACTIVE' && isDailyWage(e.pay_type)),
    [employees]
  );
  const monthlyEmps = useMemo(
    () => employees.filter(e => e.status === 'ACTIVE' && !isDailyWage(e.pay_type)),
    [employees]
  );

  const STATUS_WEIGHT    = { PRESENT: 1, HALF_DAY: 0.5, OT: 1, ABSENT: 0 };

  // Saved rows with unsaved edits laid over them. Everything downstream —
  // computeDays, computeWage, the wage column, the payout footer — reads this
  // one map, so buffered edits show their effect on pay before being written
  // and none of those helpers needed changing.
  const attendance = useMemo(() => {
    if (!Object.keys(pendingAtt).length) return savedAtt;
    const merged = { ...savedAtt };
    for (const [empId, days] of Object.entries(pendingAtt)) {
      const row = { ...(merged[empId] || {}) };
      for (const [day, val] of Object.entries(days)) {
        if (val === null) delete row[day];   // cleared
        else row[day] = val;
      }
      merged[empId] = row;
    }
    return merged;
  }, [savedAtt, pendingAtt]);

  const pendingCount = useMemo(
    () => Object.values(pendingAtt).reduce((n, days) => n + Object.keys(days).length, 0),
    [pendingAtt]
  );

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  }, [weekStart]);

  // The window a ranged run actually covers. WEEKLY is start + 6 days; CUSTOM
  // is whatever two dates were picked, which is what a payout every second day
  // needs.
  const rangeEnd = payPeriodType === 'CUSTOM' ? customEnd : weekEnd;
  const isRangeRun = payPeriodType === 'WEEKLY' || payPeriodType === 'CUSTOM';
  // The run's actual calendar window, in both shapes. Loss of pay is measured
  // against this, so a week run docks a week's worth and a month run a month's.
  const periodFrom = isRangeRun ? weekStart : `${payRunMonth}-01`;
  const periodTo   = isRangeRun ? rangeEnd
    : iso(new Date(parseInt(payRunMonth.split('-')[0]), parseInt(payRunMonth.split('-')[1]), 0));
  const rangeInvalid = payPeriodType === 'CUSTOM' && customEnd < weekStart;

  const computeDays = useCallback(
    (empId) => Object.values(attendance[empId] || {}).reduce((s, a) => s + (STATUS_WEIGHT[a.status] || 0), 0),
    [attendance]
  );

  const computeDaysForRange = useCallback(
    (empId, start, end) => Object.entries(attendance[empId] || {}).reduce((s, [d, a]) =>
      d >= start && d <= end ? s + (STATUS_WEIGHT[a.status] || 0) : s, 0),
    [attendance]
  );

  const computeWageForRange = useCallback(
    (empId, defaultRate, start, end) => Object.entries(attendance[empId] || {}).reduce((total, [d, a]) => {
      if (d < start || d > end) return total;
      const weight = STATUS_WEIGHT[a.status] || 0;
      const rate = a.custom_rate != null ? a.custom_rate : defaultRate;
      return total + weight * rate;
    }, 0),
    [attendance]
  );

  const computeWage = useCallback(
    (empId, defaultRate) => Object.entries(attendance[empId] || {}).reduce((total, [, a]) => {
      const weight = STATUS_WEIGHT[a.status] || 0;
      const rate = a.custom_rate != null ? a.custom_rate : defaultRate;
      return total + weight * rate;
    }, 0),
    [attendance]
  );

  // ── Editing ──────────────────────────────────────────────────────────────
  // These used to write to the database on every interaction — and, in the case
  // of a rate, on every keystroke, so typing 900 wrote 9 then 90 then 900. They
  // now only move the buffer; saveAttendance commits it.
  const stageAtt = (empId, day, value) => {
    setAttSaveError(null);
    setPendingAtt(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [day]: value } }));
  };

  const setAttStatus = (empId, day, status) => {
    const existingRate = attendance[empId]?.[day]?.custom_rate ?? null;
    stageAtt(empId, day, { status, custom_rate: existingRate });
  };

  // Removing a mark was impossible before: the cycle ran
  // PRESENT → ABSENT → HALF_DAY → PRESENT and never returned to blank, so a day
  // marked by accident stayed marked forever.
  const clearAtt = (empId, day) => {
    // Never saved in the first place — just drop it from the buffer.
    if (!savedAtt[empId]?.[day]) {
      setPendingAtt(prev => {
        const days = { ...(prev[empId] || {}) };
        delete days[day];
        const next = { ...prev };
        if (Object.keys(days).length) next[empId] = days; else delete next[empId];
        return next;
      });
      return;
    }
    stageAtt(empId, day, null);
  };

  const setCustomRate = (empId, day, value) => {
    const current = attendance[empId]?.[day];
    if (!current) return;                       // a rate needs a day marked first
    const rate = value === '' ? null : parseFloat(value);
    stageAtt(empId, day, { status: current.status, custom_rate: Number.isNaN(rate) ? null : rate });
  };

  /**
   * Put one rate on every Present day of the visible month for an employee.
   *
   * Setting a month at a non-default rate meant opening ~26 pickers. This does
   * it once, but only fills days that carry no rate yet — a bulk action that
   * silently overwrote a deliberate per-day exception would be worse than the
   * tedium it saves. It reports both counts so the skipped days are visible
   * rather than looking like a partial failure.
   *
   * Half-days are excluded on purpose: STATUS_WEIGHT already halves them, so
   * writing a full day's rate there would apply the halving twice.
   */
  const applyRateToPresentDays = (empId, value) => {
    const rate = parseFloat(value);
    if (!(rate > 0)) { setAttSaveError('Enter a rate above zero to apply.'); return; }

    const days = attendance[empId] || {};
    let set = 0, skipped = 0;
    const staged = { ...(pendingAtt[empId] || {}) };

    for (const [day, a] of Object.entries(days)) {
      if (a.status !== 'PRESENT') continue;
      if (a.custom_rate != null) { skipped += 1; continue; }
      staged[day] = { status: 'PRESENT', custom_rate: rate };
      set += 1;
    }

    if (!set) {
      setAttSaveError(skipped
        ? `Every present day already has its own rate (${skipped}).`
        : 'No days marked Present this month yet.');
      return;
    }

    setAttSaveError(null);
    setPendingAtt(prev => ({ ...prev, [empId]: staged }));
    setAttApplyNote({ empId, text: `${set} day${set === 1 ? '' : 's'} set${skipped ? ` · ${skipped} kept their own rate` : ''}` });
  };

  const discardAtt = () => { setPendingAtt({}); setAttSaveError(null); setAttPicker(null); setAttApplyNote(null); };

  const saveAttendance = async () => {
    if (!pendingCount || attSaving) return;
    setAttSaving(true);
    setAttSaveError(null);

    const marks = [];
    const clears = [];
    for (const [empId, days] of Object.entries(pendingAtt)) {
      for (const [day, val] of Object.entries(days)) {
        if (val === null) clears.push({ employeeId: empId, day });
        else marks.push({ employeeId: empId, day, status: val.status, customRate: val.custom_rate });
      }
    }

    const { success, error } = await saveAttendanceBatch(marks, clears);
    setAttSaving(false);
    if (!success) {
      // Say what actually went wrong. A bare "failed to save" is how the schema
      // mismatch behind all of this went unnoticed for weeks.
      setAttSaveError(error?.message || 'Could not save attendance');
      return;
    }

    // Fold the saved edits into the baseline rather than refetching — the
    // server now holds exactly what was just sent.
    setSavedAtt(prev => {
      const next = { ...prev };
      for (const [empId, days] of Object.entries(pendingAtt)) {
        const row = { ...(next[empId] || {}) };
        for (const [day, val] of Object.entries(days)) {
          if (val === null) delete row[day]; else row[day] = val;
        }
        next[empId] = row;
      }
      return next;
    });
    setPendingAtt({});
    setAttPicker(null);
  };

  // Changing month reloads the grid, which would throw away anything unsaved.
  const confirmLeaveMonth = () =>
    !pendingCount ||
    window.confirm(`${pendingCount} unsaved attendance ${pendingCount === 1 ? 'change' : 'changes'} will be lost. Continue?`);

  const goPrevMonth = () => {
    if (!confirmLeaveMonth()) return;
    const d = new Date(attYear, attMonth - 2, 1);
    setPayRunMonth(`${d.getFullYear()}-${padZ(d.getMonth() + 1)}`);
  };
  const goNextMonth = () => {
    if (!confirmLeaveMonth()) return;
    const d = new Date(attYear, attMonth, 1);
    setPayRunMonth(`${d.getFullYear()}-${padZ(d.getMonth() + 1)}`);
  };
  
  const [empForm, setEmpForm] = useState({
  name: '', email: '', phone: '', department: DEPARTMENTS[0],
  position: '', payType: 'MONTHLY', basePay: '', bankAccount: '', notes: '',
  dailyRate: 500, daysWorked: 0, userId: '',
  dob: '', gender: '', bloodGroup: '', emergencyContact: '',
  joiningDate: '', employmentType: 'FULL_TIME',
  aadhaar: '', pan: '', pfAccount: '', esiNo: '',
});
  
  // Modals state
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [salaryPayment, setSalaryPayment] = useState({ empId: null, amount: '', date: todayISOInAppTZ(), notes: ''});

  const viewOnly = isViewOnly();

  // ===== EMPLOYEE CRUD =====
  const openAdd = () => {
  setEditingEmployee(null);
  setEmpForm({ name: '', email: '', phone: '', department: DEPARTMENTS[0], position: '', payType: 'MONTHLY', basePay: '', bankAccount: '', notes: '', dailyRate: 500, daysWorked: 0, userId: '', dob: '', gender: '', bloodGroup: '', emergencyContact: '', joiningDate: '', employmentType: 'FULL_TIME', aadhaar: '', pan: '', pfAccount: '', esiNo: '' });
  setShowForm(true);
};

  const openEdit = (emp) => {
  setEditingEmployee(emp);
  setEmpForm({
  name: emp.name, email: emp.email || '', phone: emp.phone || '',
  department: emp.department || DEPARTMENTS[0], position: emp.position || '',
  payType: emp.pay_type || emp.payType || 'MONTHLY', basePay: emp.salary ?? emp.basePay ?? '',
  bankAccount: emp.bank_account || emp.bankAccount || '', notes: emp.notes || '',
  dailyRate: emp.daily_rate ?? emp.dailyRate ?? 500,
  daysWorked: emp.days_worked ?? emp.daysWorked ?? 0,
  userId: emp.user_id || '',
  dob: emp.dob || '', gender: emp.gender || '', bloodGroup: emp.blood_group || '',
  emergencyContact: emp.emergency_contact || '', joiningDate: emp.joining_date || '',
  employmentType: emp.employment_type || 'FULL_TIME',
  aadhaar: emp.aadhaar || '', pan: emp.pan || '',
  pfAccount: emp.pf_account || '', esiNo: emp.esi_no || '',
});
  setShowForm(true);
};

  const handleSubmit = async (e) => {
  e.preventDefault();
  if (isSaving) return;
  const dailyRate = parseFloat(empForm.dailyRate) || 0;
  const daysWorked = parseFloat(empForm.daysWorked) || 0;
  const basePay = (dailyRate > 0 && daysWorked > 0) ? (dailyRate * daysWorked) : (parseFloat(empForm.basePay) || 0);

  const data = {
  ...empForm,
  basePay,
  dailyRate,
  daysWorked,
  user_id: empForm.userId || null,
};
  setIsSaving(true);
  try {
  if (editingEmployee) {
    const { error } = await updateEmployee({ ...editingEmployee, ...data });
    if (error) { alert('Failed to update: ' + error.message); return; }
  } else {
    const { success, error } = await addEmployee(data);
    if (error || !success) { alert('Failed to add employee: ' + (error?.message || 'Unknown error')); return; }
  }
  setShowForm(false);
  setEditingEmployee(null);
} catch(err) {
  console.error('Employee form error:', err);
  alert('Error: ' + err.message);
} finally {
  setIsSaving(false);
}
};

  const handleDelete = (empId) => {
  deleteEmployee(empId);
  setDeleteConfirm(null);
};

  const toggleStatus = (emp) => {
  updateEmployee({ ...emp, status: emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'});
};

  const handleMonthlyReset = async () => {
  if (!hasRole('OWNER')) return;
  if (confirm("Reset ALL active personnel days worked to zero for the new month?")) {
  await resetEmployeesDailyData();
}
};

  const handleMarkSalaryPaid = (e) => {
  e.preventDefault();
  const emp = employees.find(e => e.id === salaryPayment.empId);
  if (emp) {
  updateEmployee({
  ...emp,
  amountPaid: (emp.amountPaid || 0) + parseFloat(salaryPayment.amount)
});
  setShowSalaryModal(false);
}
};

  // ===== PAYROLL RUN LOGIC =====
  // What each employee has already been paid for the month on screen, and the
  // windows that money covered. The grid used to show only a month-to-date
  // wage, so a month already paid still read as the full amount owing — that
  // figure under a PROCESS button is what invited a second payout.
  const paidThisMonth = useMemo(
    () => paidByEmployeeInMonth(attYear, attMonth, payrollRecords),
    [attYear, attMonth, payrollRecords]);

  const buildPayRunItems = useCallback(() => {
    const activeEmployees = employees.filter(e => e.status === 'ACTIVE');
    // Weekly and custom both cost a date window; only the end date differs.
    const ranged = isRangeRun;
    return activeEmployees.map(emp => {
      const isDW  = isDailyWage(emp.pay_type);
      const days  = isDW
        ? (ranged ? computeDaysForRange(emp.id, weekStart, rangeEnd) : computeDays(emp.id))
        : null;
      // Salaried staff: full salary, less only the days someone actually marked
      // absent. An unmarked day is paid -- see monthlyPay.js. Reading a blank
      // grid as absence would pay a manager nothing.
      const monthly = isDW ? null : salariedBasePay({
        salary: Number(emp.salary) || Number(emp.basePay) || 0,
        // WEEKLY stores ONE WEEK's pay in the same column MONTHLY uses for a
        // month's. Without the pay type both were paid flat for whatever window
        // was run, so a weekly employee processed over August got a single
        // week's wage for the month.
        payType: emp.pay_type || emp.payType,
        from: periodFrom, to: periodTo,
        days: attendance[emp.id],
      });
      const base  = isDW
        ? Math.round(ranged
            ? computeWageForRange(emp.id, emp.daily_rate || 0, weekStart, rangeEnd)
            : computeWage(emp.id, emp.daily_rate || 0))
        : monthly.basePay;
      // What this employee has ALREADY been paid for a window overlapping this
      // one. The run used to offer the full earned wage regardless, so paying
      // 1-8 Aug and then running August handed over the first week twice. The
      // overlap warning caught the period; it did not correct the amount.
      const already = Math.round(paidThisMonth.get(emp.id)?.amount || 0);
      const net = Math.max(0, base - already);
      return {
        employeeId:   emp.id,
        employeeName: emp.name,
        department:   emp.department,
        payType:      emp.pay_type || emp.payType,
        daysWorked:   days,
        dailyRate:    emp.daily_rate || 0,
        basePay:      base,
        // The workings behind a salaried figure. A slip showing only the net
        // gives the employee nothing to check.
        salary:       monthly ? monthly.salary : null,
        lopDays:      monthly ? monthly.lopDays : null,
        lopAmount:    monthly ? monthly.lopAmount : null,
        periodDays:   monthly ? monthly.periodDays : null,
        cycleDays:    monthly ? monthly.cycleDays : null,
        // Carried on the item so it reaches the saved run: the record should say
        // what was earned AND what was outstanding when it was paid, not just a
        // net figure nobody can explain later.
        alreadyPaid:  already,
        overtime:     0,
        commission:   0,
        bonus:        0,
        deductions:   0,
        netPay:       net,
      };
    });
  }, [employees, isRangeRun, weekStart, rangeEnd, computeDays, computeDaysForRange, computeWage, computeWageForRange, paidThisMonth]);

  const openPayRun = () => {
    setPayRunItems(buildPayRunItems());
    setShowPayRunModal(true);
  };

  /**
   * Re-run a period that has already been processed.
   *
   * A processed run is not edited in place: it wrote salary expenses, and those
   * posted to the ledger. Correcting it means reversing what was written and
   * writing it again, which is exactly what deletePayrollRecord already does --
   * it soft-deletes the run AND its expenses, so DayBook, the P&L and the cash
   * account all move back. Composing the two verified paths keeps a single
   * writer for payroll money rather than inventing a second one that edits rows
   * the first one created.
   *
   * The modal reopens on the SAME period so the correction covers the same days
   * rather than whatever window happened to be selected.
   */
  const rerunPayroll = async (record) => {
    const period = String(record?.period || '');
    if (!period) return;

    const amount = `${businessProfile?.currencySymbol || '₹'}${Number(record.totalNet || 0).toLocaleString('en-IN')}`;
    const ok = window.confirm(
      `Re-run ${describePeriod(period)}?\n\n` +
      `The existing run of ${amount} is reversed first, so DayBook, the P&L and the cash ` +
      `account drop by that much before you enter the corrected figures. Nothing is ` +
      `deleted permanently — the old run stays in the record, marked deleted.`
    );
    if (!ok) return;

    const res = await deletePayrollRecord(record.id);
    if (res && res.success === false) {
      alert(`That run could not be reversed, so nothing was changed.\n\n${res.message || res.error?.message || 'Unknown error.'}`);
      return;
    }

    // Put the modal on the period being corrected.
    if (period.includes('/')) {
      const [from, to] = period.split('/');
      setPayPeriodType('CUSTOM');
      setWeekStart(from);
      setCustomEnd(to);
    } else {
      setPayPeriodType('MONTHLY');
      setPayRunMonth(period);
    }
    // Costing is left to the recost effect below rather than done here: it
    // depends on buildPayRunItems, which changes the moment the refetched
    // payrollRecords arrive without the reversed run. Costing now would read
    // the stale list and still count this run as already paid.
    setShowPayRunModal(true);
  };

  // Changing the period inside the modal has to recost the run. Without this,
  // switching Monthly → Custom or moving a date left every base pay showing the
  // old window's figure while the header claimed the new one.
  //
  // Manual bonus/commission/deduction entries are deliberately reset with it: a
  // different period is a different payout, and silently carrying an amount
  // typed for one window into another is how someone gets paid twice.
  useEffect(() => {
    if (!showPayRunModal) return;
    setPayRunItems(buildPayRunItems());
  }, [showPayRunModal, payPeriodType, weekStart, rangeEnd, payRunMonth, buildPayRunItems]);

  const updatePayRunItem = (empId, field, value) => {
  const numVal = parseFloat(value) || 0;
  const newItems = payRunItems.map(item => {
  if (item.employeeId === empId) {
  const updated = { ...item, [field]: numVal};
  // Recalculate net
  // One formula for every pay type. The hourly branch that used to sit here
  // multiplied basePay by a hardcoded 160 hours and dropped deductions and
  // alreadyPaid on the floor; HOURLY no longer exists.
  const net = updated.basePay + updated.overtime + updated.commission
            + updated.bonus - updated.deductions - (updated.alreadyPaid || 0);
  return { ...updated, netPay: Math.round(net)};
}
  return item;
});
  setPayRunItems(newItems);
};

  const handleProcessPayroll = async () => {
  if (isSaving) return;
  // An overlapping period can still be paid — a genuine second payout in the
  // same window (an advance, a correction) has to stay possible — but not
  // without being seen first.
  if (mustAckOverlap && !overlapAcknowledged) return;
  setIsSaving(true);
  try {
  const totalBase = payRunItems.reduce((sum, i) => sum + i.basePay, 0);
  const totalNet = payRunItems.reduce((sum, i) => sum + i.netPay, 0);
  const totalOvertime = payRunItems.reduce((sum, i) => sum + i.overtime, 0);
  const totalCommission = payRunItems.reduce((sum, i) => sum + (i.commission || 0), 0);
  const totalBonus = payRunItems.reduce((sum, i) => sum + i.bonus, 0);
  const totalDeductions = payRunItems.reduce((sum, i) => sum + i.deductions, 0);

  const record = {
  period: isRangeRun ? `${weekStart}/${rangeEnd}` : payRunMonth,
  // Decides which account the salary expense lands on: the ledger trigger maps
  // CASH/UPI/BANK to the matching account. It was hardcoded to CASH, and at
  // least one advance here was actually paid by UPI.
  paymentMethod: payMethod2,
  items: payRunItems,
  totalBase,
  totalNet,
  totalOvertime,
  totalCommission,
  totalBonus,
  totalDeductions,
  processedAt: new Date().toISOString()
};

  const result = await processPayroll(record);
  if (result?.success) {
    // The run can save while the salary expenses behind it fail. That gap is
    // exactly what puts the payout in DayBook, so it must be said out loud
    // rather than closing the modal as though everything went through.
    if (result.expenseError) alert(result.message);
    setShowPayRunModal(false);
  } else {
    alert('Failed to save payroll: ' + (result?.error?.message || 'Unknown error'));
  }
} catch(err) {
  console.error('Payroll process error:', err);
  alert('Payroll error: ' + (err?.message || String(err)));
} finally {
  setIsSaving(false);
}
};

  // ===== METRICS =====
  const activeEmployeesCount = useMemo(() => employees.filter(e => e.status === 'ACTIVE').length, [employees]);
  const totalMonthlyPayroll = useMemo(() => employees.filter(e => e.status === 'ACTIVE').reduce((sum, emp) => sum + (Number(emp.salary) || Number(emp.basePay) || 0), 0), [employees]);
  const lastPayRun = useMemo(() => payrollRecords.length > 0 ? payrollRecords[0] : null, [payrollRecords]);

  // ── Has this period already been paid? ──────────────────────────────────
  //
  // Nothing used to ask. August 2026 was processed for 1-8 Aug at ₹7,200 and
  // the grid still offered PROCESS AUGUST PAYROLL with the full amount showing,
  // so a second press would have posted another ₹7,200 to DayBook, the P&L and
  // the cash account.
  const pendingPeriod = isRangeRun ? `${weekStart}/${rangeEnd}` : payRunMonth;
  const overlappingRuns = useMemo(
    () => findOverlapping(pendingPeriod, payrollRecords),
    [pendingPeriod, payrollRecords]);

  // The warning is acknowledged per period: changing the dates must re-arm it,
  // or a confirm given for one window silently licenses another.
  const [overlapAckFor, setOverlapAckFor] = useState(null);
  // Overlap alone does not mean a double payment -- prior pay is netted off each
  // line. Only ask when a line would actually pay for already-paid days.
  const mustAckOverlap = needsOverlapConfirmation(payRunItems, overlappingRuns);
  const overlapAcknowledged = overlapAckFor === pendingPeriod;

  // Whether the month the grid is showing is fully covered by a run. Seeing it
  // on the grid is what prevents the mistake; the modal warning is the backstop.
  const paidRunForMonth = useMemo(
    () => monthIsPaid(attYear, attMonth, payrollRecords),
    [attYear, attMonth, payrollRecords]);

  // Whether a given day sits inside a window this employee was paid for. Runs
  // record daysWorked, not which days, so this marks the window and never
  // claims a specific cell was paid.
  const dayInPaidWindow = useCallback((empId, dateStr) =>
    (paidThisMonth.get(empId)?.runs || []).find(r => r.window && dateStr >= r.window.from && dateStr <= r.window.to) || null,
    [paidThisMonth]);

  // Employees whose rate resolves to zero: the day is marked, counted in DAYS,
  // and worth nothing. All three employees here carry daily_rate = 0, so this
  // is one forgotten per-day rate away from a day that pays nothing.
  const zeroRateNames = useMemo(
    () => payRunItems.filter(i => i.payType === 'DAILY' && i.basePay <= 0).map(i => i.employeeName),
    [payRunItems]);

  useEffect(() => {
    if (showForm || showPayRunModal || showSalaryModal || deleteConfirm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showForm, showPayRunModal, showSalaryModal, deleteConfirm]);

  // Load attendance whenever the active month changes
  useEffect(() => {
    if (!currentTenantId) return;
    setAttLoading(true);
    loadAttendance(attYear, attMonth).then(map => {
      if (map?.error) { setAttSaveError(map.error.message || 'Could not load attendance'); setSavedAtt({}); }
      else setSavedAtt(map);
      setPendingAtt({});
      setAttPicker(null);
      setAttLoading(false);
    });
  }, [attYear, attMonth, currentTenantId]);

  // Buffered work that disappears without a word is worse than no buffer.
  useEffect(() => {
    if (!pendingCount) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingCount]);

  return (
  <>
  <div className="animate-fade-in flex flex-col gap-4 pb-12">
  <PayrollHeader 
  activeEmployeesCount={activeEmployeesCount}
  totalMonthlyPayroll={totalMonthlyPayroll}
  lastPayRun={lastPayRun}
  currencySymbol={businessProfile?.currencySymbol || ''}
  viewOnly={viewOnly}
  hasRole={hasRole}
  handleMonthlyReset={handleMonthlyReset}
  openPayRun={openPayRun}
  openAdd={openAdd}
  />

  <div className="flex flex-col gap-4 mt-2">
  <div className="pill-nav self-start">
    <button
      onClick={() => setActiveTab('EMPLOYEES')}
      className={`px-10 py-2 rounded-pill text-[10px] font-semibold transition-all ${activeTab === 'EMPLOYEES' ? 'bg-ink-primary text-surface shadow-premium' : 'text-ink-secondary hover:text-ink-primary'}`}
    >
      Employees
    </button>
    <button
      onClick={() => setActiveTab('ATTENDANCE')}
      className={`px-10 py-2 rounded-pill text-[10px] font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'ATTENDANCE' ? 'bg-ink-primary text-surface shadow-premium' : 'text-ink-secondary hover:text-ink-primary'}`}
    >
      <Calendar size={10} />
      Attendance
    </button>
    <button
      onClick={() => setActiveTab('HISTORY')}
      className={`px-10 py-2 rounded-pill text-[10px] font-semibold transition-all ${activeTab === 'HISTORY' ? 'bg-ink-primary text-surface shadow-premium' : 'text-ink-secondary hover:text-ink-primary'}`}
    >
      Pay History
    </button>
  </div>

  {activeTab === 'EMPLOYEES' && (
  <EmployeeTable 
  employees={employees}
  updateEmployee={updateEmployee}
  openEdit={openEdit}
  setDeleteConfirm={setDeleteConfirm}
  setSalaryPayment={setSalaryPayment}
  setShowSalaryModal={setShowSalaryModal}
  currencySymbol={businessProfile?.currencySymbol || ''}
  viewOnly={viewOnly}
  departments={DEPARTMENTS}
  />
  )}

  {activeTab === 'HISTORY' && (
    <PayHistory
      payrollRecords={payrollRecords}
      currencySymbol={businessProfile?.currencySymbol || ''}
      openPayRun={openPayRun}
      deletePayrollRecord={deletePayrollRecord}
      rerunPayroll={rerunPayroll}
      employees={employees}
      business={businessProfile}
      records={payrollRecords}
      paymentMethods={payrollPaymentMethods}
      accounts={payAccounts}
    />
  )}

  {activeTab === 'ATTENDANCE' && (() => {
    const sym = businessProfile?.currencySymbol || '₹';
    const monthLabel = new Date(attYear, attMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    const statusStyle = (s) => {
      if (s === 'PRESENT')  return 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200';
      if (s === 'ABSENT')   return 'bg-red-50 text-red-500 hover:bg-red-100';
      if (s === 'HALF_DAY') return 'bg-accent-signature/10 text-accent-signature hover:bg-accent-signature/15';
      return 'bg-canvas text-muted-foreground hover:bg-muted hover:text-muted-foreground';
    };
    const statusLabel = (s) => s === 'PRESENT' ? '✓' : s === 'ABSENT' ? '✗' : s === 'HALF_DAY' ? '½' : '·';

    return (
      <div className="flex flex-col gap-6">
        {/* Month navigator */}
        <div className="flex items-center gap-3 self-start bg-white border border-black/8 rounded-pill px-4 py-2 shadow-sm">
          <button onClick={goPrevMonth} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/5 transition-all text-ink-primary">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm font-semibold text-ink-primary min-w-[160px] text-center">{monthLabel}</span>
          <button onClick={goNextMonth} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/5 transition-all text-ink-primary">
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] font-semibold">
          <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-bold">✓</span> Present</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-red-50 text-red-500 flex items-center justify-center text-[9px] font-bold">✗</span> Absent</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-accent-signature/10 text-accent-signature flex items-center justify-center text-[9px] font-bold">½</span> Half Day</span>
          {paidThisMonth.size > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-emerald-50 border border-emerald-200 inline-block" />
              <span className="font-semibold text-ink-secondary">Already paid</span>
            </span>
          )}
          <span className="text-muted-foreground italic">Click a day to mark it, clear it, or set that day&apos;s rate</span>
          {attLoading && <span className="text-muted-foreground animate-pulse">Loading…</span>}
        </div>

        {/* Save bar. Nothing in this grid is written until this is pressed. */}
        {(pendingCount > 0 || attSaveError) && (
          <div className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-2.5 ${
            attSaveError ? 'bg-red-50 border-red-200' : 'bg-accent-signature/10 border-accent-signature/25'
          }`}>
            <div className="min-w-0">
              {attSaveError ? (
                <>
                  <span className="text-[12px] font-bold text-red-700">Not saved</span>
                  <span className="text-[11px] text-red-600 ml-2">{attSaveError}</span>
                </>
              ) : (
                <>
                  <span className="text-[12px] font-bold text-accent-signature-hover">
                    {pendingCount} unsaved {pendingCount === 1 ? 'change' : 'changes'}
                  </span>
                  <span className="text-[11px] text-muted-foreground ml-2">Wages and totals below already reflect them.</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={discardAtt} disabled={attSaving}
                className="px-3 py-1.5 rounded-lg border border-black/10 bg-white text-[11px] font-bold text-ink-secondary hover:text-ink-primary disabled:opacity-50 transition-all">
                Discard
              </button>
              <button onClick={saveAttendance} disabled={attSaving || !pendingCount}
                className="px-4 py-1.5 rounded-lg bg-ink-primary text-white text-[11px] font-bold hover:bg-black disabled:opacity-50 transition-all">
                {attSaving ? 'Saving…' : `Save ${pendingCount || ''}`.trim()}
              </button>
            </div>
          </div>
        )}

        {/* Daily wage grid */}
        {dailyWageEmps.length > 0 && (
          <div className="bg-white rounded-2xl border border-black/5 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-black/5 flex items-center gap-2">
              <span className="text-[10px] font-semibold text-ink-secondary uppercase tracking-wide">Daily Wage / Hourly Employees</span>
              <span className="text-[9px] bg-accent-signature/15 text-accent-signature-hover px-2 py-0.5 rounded-pill font-bold uppercase">Attendance tracked</span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse" style={{ minWidth: `${140 + attDays.length * 34 + 120}px` }}>
                <thead>
                  <tr className="bg-canvas">
                    <th className="text-left px-4 py-2 text-[9px] font-semibold text-muted-foreground uppercase sticky left-0 bg-canvas z-10 w-36">Employee</th>
                    {attDays.map(d => {
                      const dow = new Date(attYear, attMonth - 1, d).getDay(); // 0=Sun,6=Sat
                      const isWeekend = dow === 0 || dow === 6;
                      const dayName = ['Su','Mo','Tu','We','Th','Fr','Sa'][dow];
                      return (
                        <th key={d} className={`px-0.5 py-1 text-center w-8 ${isWeekend ? 'bg-orange-50' : ''}`}>
                          <div className={`text-[8px] font-bold leading-none mb-0.5 ${isWeekend ? 'text-orange-400' : 'text-muted-foreground'}`}>{dayName}</div>
                          <div className={`text-[9px] font-semibold ${isWeekend ? 'text-orange-500' : 'text-muted-foreground'}`}>{d}</div>
                        </th>
                      );
                    })}
                    <th className="px-3 py-2 text-right text-[9px] font-semibold text-muted-foreground uppercase w-14">Days</th>
                    <th className="px-3 py-2 text-right text-[9px] font-semibold text-muted-foreground uppercase w-24">Still due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {dailyWageEmps.map(emp => {
                    const days = computeDays(emp.id);
                    const wage = Math.round(computeWage(emp.id, emp.daily_rate || 0));
                    const paid = Math.round(paidThisMonth.get(emp.id)?.amount || 0);
                    const due  = Math.max(0, wage - paid);
                    return (
                      <tr key={emp.id} className="hover:bg-canvas/50">
                        <td className="px-4 py-2 sticky left-0 bg-white z-10 align-top">
                          <div className="text-xs font-semibold text-ink-primary leading-none truncate max-w-[120px]">{emp.name}</div>
                          <div className="text-[8px] text-muted-foreground font-semibold mt-0.5">{sym}{(emp.daily_rate || 0).toLocaleString('en-IN')}/day</div>
                          {/* One rate across the month's present days, instead of
                              opening a picker on each of ~26 cells. Fills only
                              days with no rate of their own. */}
                          <div className="flex items-center gap-1 mt-1.5">
                            <input
                              type="number"
                              className="w-14 text-[9px] px-1.5 py-1 rounded border border-black/10 outline-none focus:ring-1 focus:ring-accent-signature/30 tabular-nums"
                              placeholder={String(emp.daily_rate || 0)}
                              value={attRateDraft[emp.id] ?? ''}
                              onChange={e => setAttRateDraft(prev => ({ ...prev, [emp.id]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key !== 'Enter') return;
                                applyRateToPresentDays(emp.id, attRateDraft[emp.id] || emp.daily_rate);
                              }}
                            />
                            <button
                              onClick={() => applyRateToPresentDays(emp.id, attRateDraft[emp.id] || emp.daily_rate)}
                              title="Apply this rate to every day marked Present this month that has no rate yet"
                              className="px-1.5 py-1 rounded border border-black/10 text-[9px] font-bold text-ink-secondary hover:text-ink-primary hover:bg-black/5 transition-all whitespace-nowrap">
                              Apply
                            </button>
                          </div>
                          {attApplyNote?.empId === emp.id && (
                            <div className="text-[8px] text-emerald-600 font-semibold mt-1 leading-tight">{attApplyNote.text}</div>
                          )}
                        </td>
                        {attDays.map(d => {
                          const dateStr = `${attYear}-${padZ(attMonth)}-${padZ(d)}`;
                          const dow = new Date(attYear, attMonth - 1, d).getDay();
                          const isWeekend = dow === 0 || dow === 6;
                          const attEntry = attendance[emp.id]?.[dateStr];
                          const status  = attEntry?.status;
                          const hasCustomRate = attEntry?.custom_rate != null;
                          const isDirty = pendingAtt[emp.id] && dateStr in pendingAtt[emp.id];
                          const isOpen  = attPicker?.empId === emp.id && attPicker?.day === dateStr;
                          const rateShown = hasCustomRate ? attEntry.custom_rate : null;
                          const paidRun = dayInPaidWindow(emp.id, dateStr);
                          return (
                            // Paid and weekend are both a background on this cell,
                            // so emitting both leaves the winner to Tailwind's
                            // stylesheet order — which shaded paid weekdays green
                            // and left Sa 1 and Sa 8 orange inside the same paid
                            // window. Pick one: paid is the more important fact.
                            <td key={d} className={`p-0.5 text-center align-top ${paidRun ? 'bg-emerald-50/70' : isWeekend ? 'bg-orange-50/60' : ''}`}>
                              <button
                                onClick={(e) => {
                                  if (isOpen) { setAttPicker(null); return; }
                                  attAnchorRef.current = e.currentTarget;
                                  setAttPicker({ empId: emp.id, day: dateStr, dayNum: d, rate: emp.daily_rate || 0 });
                                }}
                                className={`w-8 rounded text-[10px] font-bold transition-all cursor-pointer leading-none py-1 ${statusStyle(status)} ${
                                  hasCustomRate ? 'ring-1 ring-blue-400' : ''
                                } ${isDirty ? 'outline outline-2 outline-offset-1 outline-accent-signature' : ''} ${isOpen ? 'ring-2 ring-ink-primary' : ''}`}
                                title={paidRun
                                  ? `${dateStr} — inside the ${describePeriod(paidRun.period)} run, paid ${sym}${Number(paidRun.amount).toLocaleString('en-IN')}${paidRun.processed_at ? ' on ' + new Date(paidRun.processed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}`
                                  : dateStr}
                              >
                                <span className="block">{statusLabel(status)}</span>
                                {/* The day's rate, on the cell. It used to live
                                    in a title tooltip and a hover-only input,
                                    so a wage you had set was invisible. */}
                                {rateShown != null && (
                                  <span className="block text-[7px] font-semibold tabular-nums text-blue-600 mt-0.5">
                                    {Math.round(rateShown)}
                                  </span>
                                )}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right text-xs font-bold text-ink-primary tabular-nums">{days}</td>
                        <td className="px-3 py-2 text-right align-top tabular-nums">
                          {/* Wage earned, then what is actually still owed. Showing
                              only the first is what made an already-paid month look
                              unpaid. */}
                          <div className={`text-xs font-bold ${due > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                            {sym}{due.toLocaleString('en-IN')}
                          </div>
                          {paid > 0 && (
                            <div className="text-[8px] font-semibold text-muted-foreground leading-tight mt-0.5 whitespace-nowrap">
                              {sym}{wage.toLocaleString('en-IN')} earned<br />
                              <span className="text-emerald-700">{sym}{paid.toLocaleString('en-IN')} paid</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    // This single figure was the trap: it read ₹7,200 for a month
                    // whose ₹7,200 had already been paid, directly above a button
                    // offering to pay it.
                    const earned = dailyWageEmps.reduce((s, e) => s + Math.round(computeWage(e.id, e.daily_rate || 0)), 0);
                    const paid   = dailyWageEmps.reduce((s, e) => s + Math.round(paidThisMonth.get(e.id)?.amount || 0), 0);
                    const due    = Math.max(0, earned - paid);
                    return (
                      <tr className="bg-ink-primary text-surface">
                        <td className="px-4 py-3 sticky left-0 bg-ink-primary z-10" colSpan={attDays.length + 1}>
                          <div className="text-[10px] font-semibold">
                            {paid > 0 ? 'Still to pay this month' : 'Total Daily Wage Payout'}
                          </div>
                          {paid > 0 && (
                            <div className="text-[9px] font-semibold text-white/50 mt-0.5">
                              {sym}{earned.toLocaleString('en-IN')} earned · {sym}{paid.toLocaleString('en-IN')} already paid
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-bold tabular-nums" colSpan={2}>
                          {sym}{(paid > 0 ? due : earned).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Monthly salary employees */}
        {monthlyEmps.length > 0 && (
          <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-black/5">
              <span className="text-[10px] font-semibold text-ink-secondary uppercase tracking-wide">Monthly Salary Employees</span>
            </div>
            <div className="divide-y divide-black/5">
              {monthlyEmps.map(emp => (
                <div key={emp.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-ink-primary">{emp.name}</div>
                    <div className="text-[9px] font-semibold text-muted-foreground uppercase mt-0.5">{emp.department} · {emp.pay_type}</div>
                  </div>
                  <div className="text-sm font-bold text-ink-primary tabular-nums">
                    Fixed {sym}{(Number(emp.salary) || 0).toLocaleString('en-IN')}/mo
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {employees.filter(e => e.status === 'ACTIVE').length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-sm font-semibold">No active employees. Add employees first.</div>
        )}

        {/* Process payroll CTA */}
        {employees.filter(e => e.status === 'ACTIVE').length > 0 && (
          <div className="flex flex-col items-end gap-2 pt-2">
            {/* A month already paid must not present itself as unpaid. The grid
                keeps showing the full month-to-date wage, which is what invited
                a second run: ₹7,200 on screen under a button offering to pay it. */}
            {paidRunForMonth && (
              <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                {describePeriod(paidRunForMonth.period)} already processed —{' '}
                {businessProfile?.currencySymbol || '₹'}
                {Number(paidRunForMonth.totalNet || 0).toLocaleString('en-IN')}
                {paidRunForMonth.processed_at
                  ? ` on ${new Date(paidRunForMonth.processed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                  : ''}
              </div>
            )}
            <button onClick={openPayRun}
              className={`!h-14 !px-10 !text-sm flex items-center gap-3 ${paidRunForMonth ? 'rounded-pill border border-black/10 bg-canvas text-ink-secondary font-semibold' : 'btn-signature'}`}>
              {paidRunForMonth ? 'PAY AGAIN' : `PROCESS ${new Date(attYear, attMonth - 1).toLocaleString('default', { month: 'long' }).toUpperCase()} PAYROLL`}
              <div className="icon-nest !w-8 !h-8 ml-2"><Check size={16} /></div>
            </button>
          </div>
        )}

        {/* ── Day picker ──────────────────────────────────────────────────
            One instance for the whole grid, portalled to <body> so neither the
            card's overflow-hidden nor the table's horizontal scroller can clip
            it. Positioned from the anchor cell's measured rect, flipped up and
            clamped sideways when it would otherwise leave the viewport — day 31
            sits at the right edge and the last row at the bottom of the page. */}
        {attPicker && attRect && createPortal((() => {
          const W = 168, H = attendance[attPicker.empId]?.[attPicker.day]?.status ? 240 : 120;
          const flipUp = attRect.bottom + H > window.innerHeight - 8;
          const left = Math.min(
            Math.max(8, attRect.left + attRect.width / 2 - W / 2),
            window.innerWidth - W - 8
          );
          const top = flipUp ? Math.max(8, attRect.top - H - 6) : attRect.bottom + 6;
          const entry = attendance[attPicker.empId]?.[attPicker.day];
          const st = entry?.status;
          return (
            <>
              <div className="fixed inset-0 z-[90]" onClick={() => setAttPicker(null)} />
              <div
                className="fixed z-[100] bg-white border border-black/10 rounded-xl shadow-xl p-2 text-left"
                style={{ left, top, width: W }}
              >
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-1.5">
                  {new Date(attYear, attMonth - 1, attPicker.dayNum).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>
                {[['PRESENT','Present','✓'],['ABSENT','Absent','✗'],['HALF_DAY','Half day','½']].map(([val, label, icon]) => (
                  <button key={val}
                    onClick={() => { setAttStatus(attPicker.empId, attPicker.day, val); setAttPicker(null); }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                      st === val ? 'bg-ink-primary text-white' : 'text-ink-primary hover:bg-black/5'
                    }`}>
                    <span className="w-4 text-center">{icon}</span>{label}
                  </button>
                ))}
                {st && (
                  <>
                    <div className="border-t border-black/5 my-1.5" />
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1">
                      Rate for this day
                    </label>
                    <input
                      type="number" autoFocus
                      className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-black/10 outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums"
                      placeholder={`${sym}${attPicker.rate} default`}
                      value={entry?.custom_rate ?? ''}
                      onChange={e => setCustomRate(attPicker.empId, attPicker.day, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') setAttPicker(null); }}
                    />
                    <button
                      onClick={() => { clearAtt(attPicker.empId, attPicker.day); setAttPicker(null); }}
                      className="w-full mt-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-all text-left">
                      Clear this day
                    </button>
                  </>
                )}
              </div>
            </>
          );
        })(), document.body)}
      </div>
    );
  })()}
  </div>
  </div>

  {/* Mark Salary Paid Modal */}
  {showSalaryModal && (
  <div className="modal-overlay z-50">
  <div className="glass-modal !max-w-[400px]">
  <div className="flex justify-between items-start mb-4">
  <div>
  <h2 className="text-xl font-semibold text-ink-primary">Record Payment</h2>
  <p className="text-[10px] font-semibold text-ink-secondary opacity-80 mb-6 uppercase">Pay Employee Salary</p>
  </div>
  <button onClick={() => setShowSalaryModal(false)} className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 text-ink-primary transition-all">
  <X size={16} />
  </button>
  </div>
  <form onSubmit={handleMarkSalaryPaid} className="space-y-4">
  <div>
  <label className="text-[10px] font-semibold text-ink-secondary opacity-70 block mb-2">Amount Paying</label>
  <div className="flex items-center gap-2 bg-canvas px-4 py-3 rounded-xl border border-black/10">
  <span className="text-sm font-semibold text-ink-secondary">{businessProfile?.currencySymbol || ''}</span>
  <input type="number" step="0.01" required className="w-full bg-transparent border-none text-base font-semibold text-ink-primary outline-none" value={salaryPayment.amount} onChange={e => setSalaryPayment({...salaryPayment, amount: e.target.value})} />
  </div>
  </div>
  <div>
  <label className="text-[10px] font-semibold text-ink-secondary opacity-70 block mb-2">Payment Date</label>
  <input type="date" required className="w-full bg-canvas px-4 py-3 rounded-xl border border-black/10 text-sm font-semibold text-ink-primary outline-none" value={salaryPayment.date} onChange={e => setSalaryPayment({...salaryPayment, date: e.target.value})} />
  </div>
  <div>
  <label className="text-[10px] font-semibold text-ink-secondary opacity-70 block mb-2">Notes (Optional)</label>
  <input type="text" className="w-full bg-canvas px-4 py-3 rounded-xl border border-black/10 text-sm font-semibold text-ink-primary outline-none" value={salaryPayment.notes} onChange={e => setSalaryPayment({...salaryPayment, notes: e.target.value})} />
  </div>
  <button type="submit" className="w-full btn-signature py-2 rounded-xl mt-4 text-xs font-semibold">
  RECORD SALARY PAYMENT
  </button>
  </form>
  </div>
  </div>
  )}

  {/* Employee Form Modal */}
  {showForm && (
  <div className="modal-overlay">
  <div className="glass-modal !max-w-2xl !p-0 overflow-hidden flex flex-col" style={{maxHeight:'90vh'}}>

    {/* Header */}
    <div className="flex items-center justify-between px-6 py-4 border-b border-black/8 shrink-0">
      <div>
        <h2 className="text-base font-semibold text-ink-primary">{editingEmployee ? 'Edit employee' : 'Add employee'}</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">{editingEmployee ? 'Update staff member details' : 'New staff member will be added to payroll'}</p>
      </div>
      <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary">
        <X size={15} />
      </button>
    </div>

    {/* Scrollable body */}
    <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

      {/* ── Personal ── */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Personal information</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Full name</label>
            <input required type="text" placeholder="e.g. Ramesh Kumar"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Date of birth</label>
            <input type="date"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.dob} onChange={e => setEmpForm({...empForm, dob: e.target.value})} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Gender</label>
            <select className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 appearance-none cursor-pointer"
              value={empForm.gender} onChange={e => setEmpForm({...empForm, gender: e.target.value})}>
              <option value="">Select</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Blood group</label>
            <select className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 appearance-none cursor-pointer"
              value={empForm.bloodGroup} onChange={e => setEmpForm({...empForm, bloodGroup: e.target.value})}>
              <option value="">Select</option>
              {['A+','A−','B+','B−','O+','O−','AB+','AB−'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Phone</label>
            <input type="tel" placeholder="9876543210"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.phone} onChange={e => setEmpForm({...empForm, phone: e.target.value})} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Emergency contact</label>
            <input type="tel" placeholder="Family member's number"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.emergencyContact} onChange={e => setEmpForm({...empForm, emergencyContact: e.target.value})} />
          </div>
        </div>
      </div>

      {/* ── Employment ── */}
      <div className="border-t border-black/6 pt-5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Employment</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Date of joining</label>
            <input type="date"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.joiningDate} onChange={e => setEmpForm({...empForm, joiningDate: e.target.value})} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Employment type</label>
            <select className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 appearance-none cursor-pointer"
              value={empForm.employmentType} onChange={e => setEmpForm({...empForm, employmentType: e.target.value})}>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERN">Intern</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Department</label>
            <select className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 appearance-none cursor-pointer"
              value={empForm.department} onChange={e => setEmpForm({...empForm, department: e.target.value})}>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Position / role</label>
            <input required type="text" placeholder="e.g. Driver, Cashier, Warehouse Staff"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.position} onChange={e => setEmpForm({...empForm, position: e.target.value})} />
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] font-medium text-ink-secondary mb-1 flex items-center gap-1">
              <Link2 size={10} /> Link to user account <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <select className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 appearance-none cursor-pointer"
              value={empForm.userId}
              onChange={e => {
                const u = users.find(u => u.id === e.target.value);
                setEmpForm(prev => ({ ...prev, userId: e.target.value, name: prev.name || u?.name || prev.name, email: prev.email || u?.email || prev.email }));
              }}>
              <option value="">— No linked account —</option>
              {(users || []).map(u => <option key={u.id} value={u.id}>{u.name || u.email}{u.roles?.includes('DRIVER') ? ' (Driver)' : ''}</option>)}
            </select>
            {empForm.userId && <p className="text-[10px] text-emerald-600 font-semibold mt-1 flex items-center gap-1"><Check size={10} /> Linked — van dispatch will use this account</p>}
          </div>
        </div>
      </div>

      {/* ── Pay structure ── */}
      <div className="border-t border-black/6 pt-5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Pay structure</p>
        <div className="flex gap-2 mb-4 bg-canvas border border-black/8 rounded-lg p-1">
          {PAY_TYPES.map(t => (
            <button key={t} type="button"
              onClick={() => setEmpForm({...empForm, payType: t})}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${empForm.payType === t ? 'bg-ink-primary text-surface shadow-sm' : 'text-muted-foreground hover:text-ink-primary'}`}>
              {t === 'MONTHLY' ? 'Monthly' : t === 'DAILY' ? 'Daily' : 'Weekly'}
            </button>
          ))}
        </div>
        {(empForm.payType === 'MONTHLY' || empForm.payType === 'WEEKLY') ? (
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">{empForm.payType === 'MONTHLY' ? 'Monthly salary (₹)' : 'Weekly pay (₹)'}</label>
            <input required type="number" step="0.01" placeholder="e.g. 15000"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.basePay} onChange={e => setEmpForm({...empForm, basePay: e.target.value})} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">{empForm.payType === 'DAILY' ? 'Daily rate (₹)' : 'Hourly rate (₹)'}</label>
              <input required type="number" step="0.01" placeholder="e.g. 500"
                className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
                value={empForm.dailyRate} onChange={e => setEmpForm({...empForm, dailyRate: e.target.value})} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                {empForm.payType === 'DAILY' ? 'Days worked (this cycle)' : 'Hours worked (this cycle)'}
              </label>
              <input type="number" placeholder="0"
                className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
                value={empForm.daysWorked} onChange={e => setEmpForm({...empForm, daysWorked: e.target.value})} />
            </div>
            {/* The wage is rate × units, worked out silently at save time. You
                were typing two numbers and only finding out what got stored
                afterwards — show it as it is typed. */}
            {(() => {
              const sym  = businessProfile?.currencySymbol || '₹';
              const rate = parseFloat(empForm.dailyRate) || 0;
              const unit = parseFloat(empForm.daysWorked) || 0;
              const noun = empForm.payType === 'DAILY' ? 'day' : 'hour';
              if (!(rate > 0)) return null;
              return (
                <div className="col-span-2 -mt-1">
                  {unit > 0 ? (
                    <div className="flex items-baseline justify-between rounded-lg bg-canvas border border-black/8 px-3 py-2">
                      <span className="text-[11px] font-medium text-ink-secondary">
                        Wage this cycle
                        <span className="text-muted-foreground ml-1.5 tabular-nums">
                          {sym}{rate.toLocaleString('en-IN')} × {unit.toLocaleString('en-IN')} {noun}{unit === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="text-sm font-bold tabular-nums text-ink-primary">
                        {sym}{(rate * unit).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      {sym}{rate.toLocaleString('en-IN')} per {noun}. Add {noun}s worked to record a wage for this cycle — attendance drives the actual pay run.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Payment mode</label>
            <select className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 appearance-none cursor-pointer">
              <option>Cash</option>
              <option>Bank transfer</option>
              <option>UPI</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Bank account / UPI ID</label>
            <input type="text" placeholder="Account no. or handle@upi"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.bankAccount} onChange={e => setEmpForm({...empForm, bankAccount: e.target.value})} />
          </div>
        </div>
      </div>

      {/* ── Statutory ── */}
      <div className="border-t border-black/6 pt-5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Statutory IDs</p>
        <p className="text-[11px] text-muted-foreground mb-3">Required for PF, TDS and ESI compliance</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">Aadhaar number</label>
            <input type="text" placeholder="XXXX XXXX XXXX" maxLength={14}
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.aadhaar} onChange={e => setEmpForm({...empForm, aadhaar: e.target.value})} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
              PAN <span className="text-[9px] bg-red-50 text-red-500 font-bold px-1.5 py-0.5 rounded ml-1">TDS</span>
            </label>
            <input type="text" placeholder="ABCDE1234F" maxLength={10}
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 uppercase"
              value={empForm.pan} onChange={e => setEmpForm({...empForm, pan: e.target.value.toUpperCase()})} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">PF account no.</label>
            <input type="text" placeholder="MH/BOM/12345/000/0000000"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.pfAccount} onChange={e => setEmpForm({...empForm, pfAccount: e.target.value})} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">ESI no.</label>
            <input type="text" placeholder="31-00-123456-000-0001"
              className="w-full bg-canvas border border-black/8 rounded-lg px-3 py-2.5 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20"
              value={empForm.esiNo} onChange={e => setEmpForm({...empForm, esiNo: e.target.value})} />
          </div>
        </div>
      </div>

    </form>

    {/* Footer */}
    <div className="px-6 py-4 border-t border-black/8 flex gap-3 justify-end shrink-0">
      <button type="button" onClick={() => setShowForm(false)}
        className="px-5 py-2 rounded-lg border border-black/10 text-sm font-medium text-ink-secondary hover:bg-black/5 transition-all cursor-pointer">
        Cancel
      </button>
      <button form="emp-form-inner" type="submit" onClick={handleSubmit} disabled={isSaving}
        className="btn-signature px-6 py-2 !rounded-lg !text-sm flex items-center gap-2">
        <UserPlus size={15} />
        {isSaving ? 'Saving…' : (editingEmployee ? 'Save changes' : 'Add employee')}
      </button>
    </div>

  </div>
  </div>
  )}

  {/* Pay Run Modal */}
  {showPayRunModal && (() => {
    const sym = businessProfile?.currencySymbol || '₹';
    const [prY, prM] = payRunMonth.split('-').map(Number);
    const dayLabel = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const periodLabel = isRangeRun
      ? (weekStart === rangeEnd
          ? `${dayLabel(weekStart)} — single day`
          : `${dayLabel(weekStart)} – ${new Date(rangeEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`)
      : new Date(prY, prM - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const totalNet = payRunItems.reduce((s, i) => s + i.netPay, 0);
    const inputCls = 'w-full bg-canvas border border-black/8 rounded-lg px-2.5 py-2 text-right text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 tabular-nums';
    return (
  <div className="modal-overlay">
  <div className="glass-modal !max-w-[1200px] !p-0 !overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

    {/* Header */}
    <div className="flex items-center justify-between px-6 py-4 border-b border-black/8 shrink-0">
      <div>
        <h2 className="text-base font-semibold text-ink-primary">Process Payroll</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
          <span>{periodLabel}</span>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-pill uppercase ${isRangeRun ? 'bg-blue-50 text-blue-600' : 'bg-muted text-muted-foreground'}`}>{payPeriodType.toLowerCase()}</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        {/* Period type toggle */}
        <div className="flex bg-canvas rounded-lg border border-black/8 p-0.5 gap-0.5">
          {[['MONTHLY','Monthly'], ['WEEKLY','Weekly'], ['CUSTOM','Custom']].map(([t, label]) => (
            <button key={t} type="button" onClick={() => setPayPeriodType(t)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${payPeriodType === t ? 'bg-ink-primary text-surface shadow-sm' : 'text-muted-foreground hover:text-ink-primary'}`}>
              {label}
            </button>
          ))}
        </div>
        {payPeriodType === 'MONTHLY' ? (
          <input type="month" className="bg-canvas border border-black/8 rounded-lg px-3 py-2 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20" value={payRunMonth} onChange={e => setPayRunMonth(e.target.value)} />
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-semibold text-muted-foreground uppercase px-1">
                {payPeriodType === 'WEEKLY' ? 'Week start (Mon)' : 'From'}
              </label>
              <input type="date" className="bg-canvas border border-black/8 rounded-lg px-3 py-2 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20" value={weekStart} onChange={e => setWeekStart(e.target.value)} />
            </div>
            {/* Custom lets the window be any length, including a single day.
                Wages here are paid every two or three days, which neither a
                calendar month nor a fixed week can express. */}
            {payPeriodType === 'CUSTOM' && (
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-semibold text-muted-foreground uppercase px-1">To</label>
                <input type="date" min={weekStart}
                  className={`bg-canvas border rounded-lg px-3 py-2 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 ${rangeInvalid ? 'border-red-300' : 'border-black/8'}`}
                  value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-semibold text-muted-foreground uppercase px-1">Paid by</label>
              <select className="bg-canvas border border-black/8 rounded-lg px-3 py-2 text-sm font-semibold text-ink-primary outline-none focus:ring-2 focus:ring-accent-signature/20 cursor-pointer"
                value={payMethod2} onChange={e => setPayMethod2(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK">Bank</option>
              </select>
            </div>
          </div>
        )}
        <button onClick={() => setShowPayRunModal(false)} className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-all cursor-pointer text-ink-primary">
          <X size={15} />
        </button>
      </div>
    </div>

    {/* Table */}
    <div className="flex-1 overflow-y-auto custom-scrollbar">
    <table className="w-full text-left border-collapse">
      <thead className="sticky top-0 z-10 bg-canvas border-b border-black/8">
        <tr>
          <th className="px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
          <th className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Days</th>
          <th className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Base Pay</th>
          <th className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Overtime / Extra</th>
          <th className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Commission</th>
          <th className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Bonus</th>
          <th className="px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Deductions</th>
          <th className="px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">Net Pay</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-black/5">
      {payRunItems.map(item => (
        <tr key={item.employeeId} className="hover:bg-canvas/60 transition-colors">
          <td className="px-5 py-4">
            <div className="text-sm font-semibold text-ink-primary leading-none">{item.employeeName}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">{item.department} · {item.payType}</div>
          </td>
          <td className="px-3 py-4 text-right">
            {isDailyWage(item.payType) ? (
              <span className="text-sm font-bold text-ink-primary tabular-nums">{item.daysWorked ?? 0}</span>
            ) : item.lopDays > 0 ? (
              /* A salaried employee's figure moved, so say why right here
                 rather than leaving "Fixed" next to a reduced amount. */
              <span className="text-xs font-semibold text-amber-700 tabular-nums" title={`${item.lopDays} day(s) marked absent`}>
                −{item.lopDays}d LOP
              </span>
            ) : (
              <span className="text-xs text-muted-foreground italic">Fixed</span>
            )}
          </td>
          <td className="px-3 py-4 text-right text-sm font-semibold text-ink-secondary tabular-nums">
            {sym}{Math.round(item.basePay).toLocaleString('en-IN')}
            {/* A net figure that is smaller than the base has to explain itself,
                or it reads as the wage being wrong rather than already paid. */}
            {item.alreadyPaid > 0 && (
              <div className="text-[10px] font-semibold text-emerald-700 mt-0.5 whitespace-nowrap">
                −{sym}{item.alreadyPaid.toLocaleString('en-IN')} already paid
              </div>
            )}
          </td>
          <td className="px-3 py-4 text-right">
            <input type="number" className={inputCls + ' !w-28'} value={item.overtime} onChange={e => updatePayRunItem(item.employeeId, 'overtime', e.target.value)} />
          </td>
          <td className="px-3 py-4 text-right">
            <input type="number" className={inputCls + ' !w-24 !text-emerald-600'} value={item.commission || 0} onChange={e => updatePayRunItem(item.employeeId, 'commission', e.target.value)} />
          </td>
          <td className="px-3 py-4 text-right">
            <input type="number" className={inputCls + ' !w-24'} value={item.bonus} onChange={e => updatePayRunItem(item.employeeId, 'bonus', e.target.value)} />
          </td>
          <td className="px-3 py-4 text-right">
            <input type="number" className={inputCls + ' !w-24 !text-red-500'} value={item.deductions} onChange={e => updatePayRunItem(item.employeeId, 'deductions', e.target.value)} />
          </td>
          <td className="px-5 py-4 text-right">
            <span className="text-base font-bold text-ink-primary tabular-nums">{sym}{Math.round(item.netPay).toLocaleString('en-IN')}</span>
          </td>
        </tr>
      ))}
      </tbody>
    </table>
    </div>

    {/* Footer */}
    <div className="px-6 py-4 border-t border-black/8 flex flex-col gap-3 shrink-0 bg-ink-primary">
      {/* Already paid? Say what, when and how much, then let it through on a
          confirm — a second payout in the same window is legitimate, being
          unaware of the first is not. */}
      {overlappingRuns.length > 0 && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-400/10 px-4 py-3">
          <div className="text-[12px] font-bold text-amber-200">
            {mustAckOverlap
              ? 'These dates have already been paid'
              : 'Already paid this period — netted off the amounts below'}
          </div>
          <ul className="mt-1 text-[11px] text-amber-100/90 font-medium space-y-0.5">
            {overlappingRuns.map(r => (
              <li key={r.id}>
                {describePeriod(r.period)} — {sym}{Number(r.totalNet || 0).toLocaleString('en-IN')}
                {r.processed_at ? `, processed ${new Date(r.processed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
              </li>
            ))}
          </ul>
          {/* Only when a line would genuinely pay twice. When prior pay has
              been netted off, the list above is information, not a warning to
              agree to -- asking the owner to tick "pay again anyway" to collect
              a remainder he is owed describes the opposite of what happens. */}
          {mustAckOverlap && (
          <label className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-amber-200 cursor-pointer">
            <input type="checkbox" checked={overlapAcknowledged}
              onChange={e => setOverlapAckFor(e.target.checked ? pendingPeriod : null)} />
            Pay these dates again anyway
          </label>
          )}
        </div>
      )}

      {zeroRateNames.length > 0 && (
        <div className="text-[11px] font-semibold text-amber-200/90">
          No daily rate set for {zeroRateNames.join(', ')} — those days pay {sym}0.
        </div>
      )}

      <div className="flex items-center justify-between">
      <div className="flex items-center gap-10">
        <div>
          <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">Total Payout</div>
          <div className="text-2xl font-bold text-accent-signature tabular-nums">{sym}{totalNet.toLocaleString('en-IN')}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">Employees</div>
          <div className="text-2xl font-bold text-white">{payRunItems.length}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">Period</div>
          <div className="text-sm font-semibold text-white">{periodLabel}</div>
        </div>
      </div>
      <button className="btn-signature !h-12 !px-8 !text-sm flex items-center gap-2.5"
        onClick={handleProcessPayroll}
        disabled={isSaving || rangeInvalid || totalNet <= 0 || (mustAckOverlap && !overlapAcknowledged)}
        title={rangeInvalid ? 'The end date is before the start date'
          : (totalNet <= 0 ? 'Nothing to pay for this period'
          : (mustAckOverlap && !overlapAcknowledged ? 'These dates have already been paid — confirm above to pay them again' : undefined))}>
        <Check size={16} />
        {isSaving ? 'Processing…' : rangeInvalid ? 'Check the dates' : 'Confirm & Process'}
      </button>
      </div>
    </div>

  </div>
  </div>
    );
  })()}

  {/* Delete Confirmation Modal */}
  {deleteConfirm && (
  <div className="modal-overlay">
  <div className="glass-modal !max-w-[400px] text-center">
  <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-6">
  <Trash2 size={40} />
  </div>
  <h2 className="text-3xl font-semibold text-ink-primary mb-2">CONFIRM DELETE.</h2>
  <p className="text-[10px] font-semibold text-ink-secondary opacity-80 mb-6 uppercase">
  This action cannot be undone. All staff records will be purged.
  </p>
  <div className="grid grid-cols-2 gap-4">
  <button 
  onClick={() => setDeleteConfirm(null)}
  className="px-8 py-2 rounded-pill border border-black/10 font-semibold text-ink-primary text-xs hover:bg-black/5 transition-all"
  >
  CANCEL
  </button>
  <button 
  onClick={() => handleDelete(deleteConfirm)}
  className="px-8 py-2 rounded-pill bg-red-500 text-white font-semibold text-xs hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
  >
  DELETE
  </button>
  </div>
  </div>
  </div>
  )}
  </>
  );
};

export default Payroll;
