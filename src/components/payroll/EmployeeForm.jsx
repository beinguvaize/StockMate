import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import Dialog from '../ui/Dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Seg } from '../documents/DocParts';
import WriteFailure from '../invoices/WriteFailure';
import { PT_STATES } from '../../lib/statutory';
import { cn } from '../../lib/utils';

/**
 * Add / edit employee (approved mockups 04, 05).
 *
 * The fields today's form had, in two columns. "Payment mode" is gone: the
 * old select was never saved -- employees has no column for it -- so it
 * looked like a setting and did nothing. How each run is paid is chosen in
 * Run payroll ("Paid by"), which is what reaches the books.
 *
 * Days worked are never typed here; they come from Attendance.
 */
export const DEPARTMENTS = ['Operations', 'Sales', 'Warehouse', 'Delivery', 'Management', 'Admin'];
const PAY_TYPES = [['MONTHLY', 'Monthly'], ['WEEKLY', 'Weekly'], ['DAILY', 'Daily']];

const blank = () => ({
  name: '', email: '', phone: '', department: DEPARTMENTS[0], position: '', payType: 'MONTHLY',
  basePay: '', bankAccount: '', notes: '', dailyRate: 500, userId: '', dob: '', gender: '',
  bloodGroup: '', emergencyContact: '', joiningDate: '', employmentType: 'FULL_TIME', aadhaar: '',
  pan: '', pfAccount: '', esiNo: '', epfEnabled: false, epfOnFullWage: false, esiEnabled: false,
  professionalTaxState: '', tdsMonthly: 0, status: 'ACTIVE', paidLeavePerMonth: 0,
});

export const formFromEmployee = (emp) => ({
  name: emp.name || '', email: emp.email || '', phone: emp.phone || '',
  department: emp.department || DEPARTMENTS[0], position: emp.position || '',
  payType: (emp.pay_type || emp.payType || 'MONTHLY').toUpperCase() === 'HOURLY' ? 'DAILY' : (emp.pay_type || emp.payType || 'MONTHLY'),
  basePay: emp.salary ?? emp.basePay ?? '', bankAccount: emp.bank_account || emp.bankAccount || '',
  notes: emp.notes || '', dailyRate: emp.daily_rate ?? emp.dailyRate ?? 500, userId: emp.user_id || '',
  dob: emp.dob || '', gender: emp.gender || '', bloodGroup: emp.blood_group || '',
  emergencyContact: emp.emergency_contact || '', joiningDate: emp.joining_date || '',
  employmentType: emp.employment_type || 'FULL_TIME', aadhaar: emp.aadhaar || '', pan: emp.pan || '',
  pfAccount: emp.pf_account || '', esiNo: emp.esi_no || '', epfEnabled: !!emp.epf_enabled,
  epfOnFullWage: !!emp.epf_on_full_wage, esiEnabled: !!emp.esi_enabled,
  professionalTaxState: emp.professional_tax_state || '', tdsMonthly: Number(emp.tds_monthly) || 0,
  status: emp.status || 'ACTIVE', paidLeavePerMonth: Number(emp.paid_leave_per_month) || 0,
});

const SH = ({ children, first }) => (
  <div className={cn('mb-2.5 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute', first ? '' : 'mt-4')}>{children}</div>
);

const Fl = ({ label, hint, full, children, htmlFor }) => (
  <label htmlFor={htmlFor} className={cn('block', full && 'col-span-2')}>
    <span className="mb-[5px] block text-[12px] font-medium text-ink-2">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[12px] text-mute">{hint}</span>}
  </label>
);

const selCls = 'h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink shadow-[inset_0_0_0_1px_var(--color-line)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)]';

const Check2 = ({ checked, onChange, children, sub }) => (
  <label className={cn('flex cursor-pointer items-start gap-2.5 py-[7px] text-[13px] text-ink', sub && 'ml-7')}>
    <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-[var(--color-ink)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
);

export default function EmployeeForm({ open, employee, users = [], onClose, addEmployee, updateEmployee, onSaved, refetch }) {
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);   // validation text
  const [failure, setFailure] = useState(null);   // a failed write
  // Kept for the life of the dialog: pressing Add again after a dropped
  // connection then cannot add the same person twice (usePayroll.addEmployee).
  const newId = useRef(null);

  useEffect(() => {
    if (!open) return;
    setF(employee ? formFromEmployee(employee) : blank());
    setProblem(null);
    setFailure(null);
    newId.current = employee ? null : crypto.randomUUID();
  }, [open, employee]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const salaried = f.payType === 'MONTHLY' || f.payType === 'WEEKLY';

  const submit = async (e) => {
    e?.preventDefault();
    if (saving) return;
    if (!String(f.name).trim()) { setProblem('Enter the employee’s full name.'); return; }
    if (!String(f.position).trim()) { setProblem('Enter a position or role.'); return; }
    if (salaried && !(parseFloat(f.basePay) > 0)) { setProblem(`Enter the ${f.payType === 'WEEKLY' ? 'weekly pay' : 'monthly salary'}.`); return; }
    if (!salaried && !(parseFloat(f.dailyRate) >= 0)) { setProblem('Enter the daily rate.'); return; }
    setProblem(null);
    setFailure(null);
    setSaving(true);
    const data = {
      ...f,
      basePay: parseFloat(f.basePay) || 0,
      dailyRate: parseFloat(f.dailyRate) || 0,
      user_id: f.userId || null,
    };
    try {
      const res = employee
        ? await updateEmployee({ ...employee, ...data })
        : await addEmployee({ ...data, id: newId.current });
      if (!res?.success) { setFailure(res?.error || new Error('The server gave no reason.')); return; }
      onSaved?.(employee ? 'updated' : 'added', res);
      onClose();
    } catch (err) {
      console.error('[payroll] employee save failed:', err);
      setFailure(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} width={900} title={employee ? 'Edit employee' : 'Add employee'}
      subtitle={employee ? 'Update staff member details' : 'New staff member will be added to payroll'} className="!pb-0">
      <form onSubmit={submit} className="-mx-[22px] -mb-4 border-t border-sep">
        <div className="grid max-h-[62vh] overflow-y-auto md:grid-cols-2">
          <div className="px-[22px] py-4">
            <SH first>Personal information</SH>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <Fl label="Full name" full><Input value={f.name} onChange={set('name')} placeholder="Full name" autoFocus /></Fl>
              <Fl label="Date of birth"><Input type="date" value={f.dob} onChange={set('dob')} /></Fl>
              <Fl label="Gender">
                <select className={selCls} value={f.gender} onChange={set('gender')}>
                  <option value="">Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
                </select>
              </Fl>
              <Fl label="Blood group">
                <select className={selCls} value={f.bloodGroup} onChange={set('bloodGroup')}>
                  <option value="">Select</option>
                  {['A+', 'A−', 'B+', 'B−', 'O+', 'O−', 'AB+', 'AB−'].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Fl>
              <Fl label="Phone"><Input type="tel" value={f.phone} onChange={set('phone')} placeholder="Mobile number" /></Fl>
              <Fl label="Emergency contact" full><Input type="tel" value={f.emergencyContact} onChange={set('emergencyContact')} placeholder="Family member's number" /></Fl>
            </div>
            <SH>Employment</SH>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <Fl label="Date of joining"><Input type="date" value={f.joiningDate} onChange={set('joiningDate')} /></Fl>
              <Fl label="Employment type">
                <select className={selCls} value={f.employmentType} onChange={set('employmentType')}>
                  <option value="FULL_TIME">Full-time</option><option value="PART_TIME">Part-time</option>
                  <option value="CONTRACT">Contract</option><option value="INTERN">Intern</option>
                </select>
              </Fl>
              <Fl label="Status" hint="Active, On leave or Inactive">
                <select className={selCls} value={f.status} onChange={set('status')}>
                  <option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option>
                </select>
              </Fl>
              <Fl label="Paid leave allowed a month">
                <Input type="number" min="0" max="31" step="1" value={f.paidLeavePerMonth} onChange={set('paidLeavePerMonth')} />
              </Fl>
              <Fl label="Department">
                <select className={selCls} value={f.department} onChange={set('department')}>
                  {(DEPARTMENTS.includes(f.department) ? DEPARTMENTS : [f.department, ...DEPARTMENTS]).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Fl>
              <Fl label="Position / role"><Input value={f.position} onChange={set('position')} placeholder="e.g. Cashier" /></Fl>
              <Fl label={<>Link to user account <span className="font-normal text-mute">(optional)</span></>} full
                hint={f.userId ? null : 'Linking lets van dispatch use this person’s login.'}>
                <select className={selCls} value={f.userId}
                  onChange={(e) => {
                    const u = users.find((x) => x.id === e.target.value);
                    setF((p) => ({ ...p, userId: e.target.value, name: p.name || u?.name || '', email: p.email || u?.email || '' }));
                  }}>
                  <option value="">— No linked account —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}{u.roles?.includes('DRIVER') ? ' (Driver)' : ''}</option>)}
                </select>
                {f.userId && <span className="mt-[5px] flex items-center gap-1.5 font-tight text-[12px] font-semibold text-good-text"><Check size={12} /> Linked — van dispatch will use this account</span>}
              </Fl>
            </div>
          </div>

          <div className="border-t border-sep px-[22px] py-4 md:border-t-0 md:border-l">
            <SH first>Pay structure</SH>
            <Seg value={f.payType} onChange={(v) => setF((p) => ({ ...p, payType: v }))} options={PAY_TYPES}
              ariaLabel="Pay type" className="mb-3 flex w-full [&>button]:flex-1 [&>button]:py-1.5" />
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {salaried ? (
                <Fl full label={f.payType === 'MONTHLY' ? 'Monthly salary (₹)' : 'Weekly pay (₹)'} hint="Full pay unless a day is marked Absent. Leave is paid.">
                  <Input type="number" step="0.01" min="0" value={f.basePay} onChange={set('basePay')} placeholder="e.g. 15000" />
                </Fl>
              ) : (
                <Fl full label="Daily rate (₹)" hint="Paid for the days marked on the Attendance tab. Half day pays half.">
                  <Input type="number" step="0.01" min="0" value={f.dailyRate} onChange={set('dailyRate')} placeholder="e.g. 500" />
                </Fl>
              )}
              <Fl full label="Bank account / UPI ID"><Input value={f.bankAccount} onChange={set('bankAccount')} placeholder="Account no. or handle@upi" /></Fl>
            </div>
            <SH>Statutory IDs</SH>
            <p className="-mt-1 mb-2.5 text-[12px] text-mute">Required for PF, TDS and ESI compliance</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <Fl label="Aadhaar number"><Input value={f.aadhaar} onChange={set('aadhaar')} placeholder="XXXX XXXX XXXX" maxLength={14} /></Fl>
              <Fl label={<>PAN<span className="ml-1 rounded-[5px] bg-bad-soft px-[5px] py-px font-tight text-[10px] font-semibold text-bad-text">TDS</span></>}>
                <Input value={f.pan} onChange={(e) => setF((p) => ({ ...p, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" maxLength={10} className="uppercase" />
              </Fl>
              <Fl label="PF account no."><Input value={f.pfAccount} onChange={set('pfAccount')} placeholder="PF account number" /></Fl>
              <Fl label="ESI no."><Input value={f.esiNo} onChange={set('esiNo')} placeholder="ESI number" /></Fl>
            </div>
            <div className="mt-3 rounded-xl bg-tile px-3.5 py-3">
              <b className="block font-tight text-[13.5px] font-semibold">Statutory deductions</b>
              <p className="mt-0.5 mb-2 text-[12px] text-body">These come off every pay run for this employee. Leave them off unless the business is registered for them.</p>
              <Check2 checked={f.epfEnabled} onChange={(v) => setF((p) => ({ ...p, epfEnabled: v }))}>Provident fund <small className="text-[12px] text-mute">— 12% of wages, capped at ₹15,000 a month</small></Check2>
              {f.epfEnabled && (
                <Check2 sub checked={f.epfOnFullWage} onChange={(v) => setF((p) => ({ ...p, epfOnFullWage: v }))}>Contribute on the full wage <small className="text-[12px] text-mute">— ignore the ₹15,000 ceiling</small></Check2>
              )}
              <Check2 checked={f.esiEnabled} onChange={(v) => setF((p) => ({ ...p, esiEnabled: v }))}>ESI <small className="text-[12px] text-mute">— 0.75% of gross, while gross is ₹21,000 or below</small></Check2>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
                <Fl label="Professional tax state">
                  <select className={selCls} value={f.professionalTaxState} onChange={set('professionalTaxState')}>
                    <option value="">Not applicable</option>
                    {PT_STATES.map((st) => <option key={st.key} value={st.key}>{st.label}{st.levies ? '' : ' — no professional tax'}</option>)}
                  </select>
                </Fl>
                <Fl label="TDS per month (₹)" hint="Entered as advised by your accountant — not calculated here.">
                  <Input type="number" min="0" step="1" value={f.tdsMonthly} onChange={set('tdsMonthly')} />
                </Fl>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-sep px-[22px] pt-3.5 pb-5">
          {problem && <p role="alert" className="mb-2.5 rounded-[10px] bg-bad-soft px-3 py-2 text-[12.5px] text-bad-text">{problem}</p>}
          {failure && <WriteFailure error={failure} noun={employee ? 'change' : 'new employee'} onReread={refetch} className="mb-2.5" />}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto max-w-[520px] text-[12px] text-mute">Days worked come from the Attendance tab, never from this form.</span>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : failure ? (employee ? 'Save again' : 'Add again') : employee ? 'Save changes' : 'Add employee'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
