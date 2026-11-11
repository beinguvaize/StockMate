import { describe, it, expect, vi } from 'vitest';
import { checkReply } from '../../supabase/functions/ai-ask/guard.ts';
import { toModelFigures, restoreNames } from '../../supabase/functions/ai-ask/standins.ts';
import { buildCard } from '../../supabase/functions/ai-ask/cards.ts';
import { monthEnd } from '../../supabase/functions/ai-ask/periods.ts';
import { runQuestion, ReadFailed } from '../../supabase/functions/ai-ask/runs.ts';
import { handle } from '../../supabase/functions/ai-ask/handler.ts';
import { screenPath } from './askFormat.js';
import strings from '../../shared/ai_chat/strings.json';
import registry from '../../shared/ai_chat/questions.json';

// The Staff category: payroll_month, salary_due, attendance_today and
// attendance_month. Figures are the shapes ai_staff_pay and
// ai_staff_attendance_day/_month return. Names, phone numbers and amounts are
// invented; the November figures follow FUTURE DISPO's aggregates (4 daily-wage
// staff, ₹7,200 earned and paid in 4 runs), read on prod read-only.

const IDS = ['payroll_month', 'salary_due', 'attendance_today', 'attendance_month'];

const PAY = {
  period_from: '2026-11-01', period_to: '2026-11-30', as_of: 'x',
  daily_staff: 3, daily_earned: 9150, daily_paid: 8100, daily_due: 1050,
  due_total: 1950, staff_due: 2, overpaid: 900, staff_overpaid: 1,
  monthly_staff: 1, monthly_salaries: 12000, monthly_paid: 6000, monthly_unpaid_staff: 0,
  paid_total: 14600, run_count: 5, paid_people: 4, other_paid: 500, other_people: 1, staff_count: 4,
  staff: [
    { employee_id: 'E1', name: 'Ravi Kumar', pay_type: 'DAILY', days: 6.5, earned: 5850, salary: null, paid: 4500, due: 1350 },
    { employee_id: 'E2', name: 'Sunita', pay_type: 'DAILY', days: 3, earned: 2700, salary: null, paid: 2100, due: 600 },
    { employee_id: 'E3', name: 'Imran', pay_type: 'DAILY', days: 1, earned: 600, salary: null, paid: 1500, due: 0 },
    { employee_id: 'E4', name: 'Meena Joshi', pay_type: 'MONTHLY', days: 0, earned: null, salary: 12000, paid: 6000, due: null },
  ],
  due_staff: [
    { employee_id: 'E1', name: 'Ravi Kumar', days: 6.5, earned: 5850, paid: 4500, due: 1350 },
    { employee_id: 'E2', name: 'Sunita', days: 3, earned: 2700, paid: 2100, due: 600 },
  ],
};
// FUTURE DISPO, November 2026 to the 11th: everything earned was paid.
const PAY_NOV = {
  period_from: '2026-11-01', period_to: '2026-11-30', as_of: 'x',
  daily_staff: 4, daily_earned: 7200, daily_paid: 7200, daily_due: 0, due_total: 0, staff_due: 0, overpaid: 0, staff_overpaid: 0,
  monthly_staff: 0, monthly_salaries: 0, monthly_paid: 0, monthly_unpaid_staff: 0,
  paid_total: 7200, run_count: 4, paid_people: 2, other_paid: 0, other_people: 0, staff_count: 4,
  salary_expenses: 7200, salary_expense_count: 8,
  staff: [
    { employee_id: 'E1', name: 'Worker A', pay_type: 'DAILY', days: 4, earned: 3600, salary: null, paid: 3600, due: 0 },
    { employee_id: 'E2', name: 'Worker B', pay_type: 'DAILY', days: 4, earned: 3600, salary: null, paid: 3600, due: 0 },
    { employee_id: 'E3', name: 'Worker C', pay_type: 'DAILY', days: 0, earned: 0, salary: null, paid: 0, due: 0 },
    { employee_id: 'E4', name: 'Worker D', pay_type: 'DAILY', days: 0, earned: 0, salary: null, paid: 0, due: 0 },
  ],
  due_staff: [],
};
const DAY = {
  period_from: '2026-11-11', period_to: '2026-11-11', as_of: 'x', staff_count: 4,
  present: 1, overtime: 0, half_day: 1, absent: 1, not_marked: 1, other_mark: 0, marks_off_grid: 1, away_count: 3,
  staff: [
    { employee_id: 'E2', name: 'Sunita', status: 'ABSENT' },
    { employee_id: 'E3', name: 'Imran', status: 'HALF_DAY' },
    { employee_id: 'E4', name: 'Ravi 9876543210', status: 'NOT_MARKED' },
  ],
};
const MONTH = {
  period_from: '2026-10-01', period_to: '2026-10-31', as_of: 'x', staff_count: 4, marked_days: 31,
  absent_days: 3, half_days: 1, missed_days: 3.5, staff_missed: 2, marks_off_grid: 0,
  staff: [
    { employee_id: 'E1', name: 'Ravi Kumar', absent: 2, half_days: 1, missed_days: 2.5, days: 12.5, marked: 15 },
    { employee_id: 'E2', name: 'Sunita', absent: 1, half_days: 0, missed_days: 1, days: 14, marked: 15 },
    { employee_id: 'E3', name: 'Imran', absent: 0, half_days: 0, missed_days: 0, days: 1, marked: 1 },
  ],
};

/** A database that answers by function name, and records the calls. */
const fnDb = (answers, calls = []) => ({
  calls,
  rpc: async (name, args) => {
    calls.push({ name, ...args });
    const a = answers[name];
    return a ? { data: typeof a === 'function' ? a(args) : a, error: null } : { data: null, error: { message: `unexpected ${name}` } };
  },
});
const run = (id, db, today = '2026-11-11') => runQuestion(id, db, { tenantId: 'T', today, taxMode: null });

describe('staff: registry and strings', () => {
  it('four questions under staff, gated on payroll, linked to the Attendance tab', () => {
    const qs = registry.questions.filter((q) => q.category === 'staff');
    expect(qs.map((q) => q.id)).toEqual(IDS);
    for (const q of qs) {
      expect(q).toMatchObject({ module: 'payroll', roles: ['OWNER'] });
      expect(q.screen).toEqual({ key: 'payroll_attendance', fallback_key: null, module: 'payroll', mobile: false });
      expect(q.label.en && q.label.hi).toBeTruthy();
      expect(q.hidden).toBeUndefined();
    }
    expect(strings.en.ui.category_staff).toBe('Staff');
  });

  it('every new key exists in both languages, and every new Hindi key awaits review', () => {
    for (const id of IDS) {
      for (const sec of ['titles', 'notes', 'no_data_by_question']) {
        expect(strings.en[sec][id]).toBeTruthy();
        expect(strings.hi[sec][id]).toBeTruthy();
      }
      expect(Object.keys(strings.hi.hero[id]).sort()).toEqual(Object.keys(strings.en.hero[id]).sort());
    }
    for (const k of ['ui.category_staff', 'card.staff', 'card.att_absent', 'hero.salary_due.none', 'titles.attendance_month',
      'footnotes.salary_due_footer', 'links.payroll_attendance', 'no_data_by_question.attendance_today']) {
      expect(strings.hi.review_pending).toContain(k);
    }
    expect(strings.en.review_pending).toEqual([]);
  });

  it('the link opens Payroll on the Attendance tab, on the answer\'s month', () => {
    expect(screenPath('payroll_attendance', { from: '2026-11-01', to: '2026-11-30' }))
      .toBe('/payroll?tab=ATTENDANCE&from=2026-11-01&to=2026-11-30');
    expect(strings.en.links.payroll_attendance).toBe('Open Payroll attendance');
  });
});

describe('staff: reads', () => {
  it('payroll_month and salary_due read the whole calendar month, and drop the salary-expense check', async () => {
    for (const id of ['payroll_month', 'salary_due']) {
      const db = fnDb({ ai_staff_pay: PAY_NOV });
      const r = await run(id, db);
      expect(db.calls).toEqual([{ name: 'ai_staff_pay', p_from: '2026-11-01', p_to: '2026-11-30', p_limit: 20 }]);
      expect(r.params).toEqual({ from: '2026-11-01', to: '2026-11-30' });
      expect(r.figures.salary_expenses).toBeUndefined();
      expect(r.figures.salary_expense_count).toBeUndefined();
      expect(r.figures.paid_total).toBe(7200);
      expect(r.empty).toBe(false);
    }
  });

  it('a pay-run and salary-expense gap is logged, not shown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await run('payroll_month', fnDb({ ai_staff_pay: { ...PAY_NOV, salary_expenses: 6300 } }));
    expect(warn).toHaveBeenCalledWith('[ai-ask] pay runs and salary expenses differ:', 7200, 6300);
    warn.mockRestore();
  });

  it('month ends are right in short months and leap years', () => {
    expect(monthEnd('2026-02-14')).toBe('2026-02-28');
    expect(monthEnd('2028-02-01')).toBe('2028-02-29');
    expect(monthEnd('2026-12-31')).toBe('2026-12-31');
  });

  it('attendance_today reads the shop\'s today; attendance_month keeps only staff who missed a day', async () => {
    const db = fnDb({ ai_staff_attendance_day: DAY, ai_staff_attendance_month: MONTH });
    const t = await run('attendance_today', db);
    expect(db.calls[0]).toEqual({ name: 'ai_staff_attendance_day', p_day: '2026-11-11', p_limit: 30 });
    expect(t.params).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    const m = await run('attendance_month', db, '2026-10-20');
    expect(db.calls[1]).toEqual({ name: 'ai_staff_attendance_month', p_from: '2026-10-01', p_to: '2026-10-31', p_limit: 20 });
    expect(m.figures.staff.map((s) => s.name)).toEqual(['Ravi Kumar', 'Sunita']);
  });

  it('empty when there is nothing to show; a failed read is never a zero', async () => {
    const none = { ...PAY_NOV, staff_count: 0, run_count: 0, staff: [], due_staff: [] };
    expect((await run('salary_due', fnDb({ ai_staff_pay: none }))).empty).toBe(true);
    expect((await run('attendance_today', fnDb({ ai_staff_attendance_day: { ...DAY, staff_count: 0, staff: [] } }))).empty).toBe(true);
    expect((await run('attendance_month', fnDb({ ai_staff_attendance_month: { ...MONTH, marked_days: 0 } }))).empty).toBe(true);
    await expect(run('payroll_month', fnDb({}))).rejects.toBeInstanceOf(ReadFailed);
    await expect(run('attendance_month', fnDb({ ai_staff_attendance_month: { staff_count: 1 } }))).rejects.toBeInstanceOf(ReadFailed);
  });
});

describe('staff: cards', () => {
  const card = (id, f) => buildCard(id, f, strings.en);

  it('payroll_month: the Attendance tab footer, then what else the pay runs paid, each with its size', () => {
    const c = card('payroll_month', PAY);
    expect(c.title).toBe('Staff pay this month');
    expect(c.hero).toMatchObject({ value: 14600, kind: 'money', caption: 'Paid to staff, 1 to 30 Nov, 5 pay runs', detail: '₹1,050.00 still to pay daily-wage staff' });
    expect(c.rows.map((r) => [r.label, r.value])).toEqual([
      ['Daily-wage staff earned', 9150], ['Paid to them', 8100], ['Still to pay', 1050],
      ['Monthly salaries, 1 staff', 12000], ['Paid to monthly staff', 6000], ['Paid to 1 staff no longer listed', 500],
    ]);
    expect(c.rows_after).toEqual([{ label: 'Paid this month, all pay runs', value: 14600, kind: 'money', tone: 'total' }]);
    expect(c.table.columns.map((x) => x.label)).toEqual(['Staff', 'Days', 'Earned or salary', 'Paid', 'Still due']);
    expect(c.table.rows[0]).toEqual(['Ravi Kumar', '6.5', 5850, 4500, 1350]);
    expect(c.table.rows[3]).toEqual(['Meena Joshi', 'Monthly', 12000, 6000, null]);
    expect(c.footnote).toBe("The Attendance tab's footer counts daily-wage staff only: ₹8,100.00 of the ₹14,600.00 paid. "
      + '₹6,000.00 went to monthly-salary staff, listed apart on the tab. ₹500.00 went to 1 staff no longer active, whom the tab does not list. '
      + '1 staff were paid ₹900.00 more than they earned this month; the footer takes that off Still to pay.');
  });

  it('payroll_month on FUTURE DISPO\'s November: ties to the footer, so no footnote', () => {
    const c = card('payroll_month', PAY_NOV);
    expect(c.hero.value).toBe(7200);
    expect(c.rows.map((r) => r.value)).toEqual([7200, 7200, 0]);
    expect(c.footnote).toBeNull();
  });

  it('salary_due: the rows are the tab\'s Still due column, and the footer gap is named', () => {
    const c = card('salary_due', PAY);
    expect(c.hero).toMatchObject({ value: 1950, caption: 'Still due to 2 daily-wage staff, 1 to 30 Nov' });
    expect(c.table.rows).toEqual([['Ravi Kumar', 6.5, 5850, 4500, 1350], ['Sunita', 3, 2700, 2100, 600]]);
    expect(c.rows_after).toEqual([{ label: 'Total still due', value: 1950, kind: 'money', tone: 'total' }]);
    expect(c.footnote).toBe("The Attendance tab's footer reads ₹1,050.00: it takes off ₹900.00 paid beyond earned to 1 staff. "
      + '1 monthly-salary staff are not counted: the Payroll screen shows no amount due for them. 0 of them have no pay run this month yet.');
    const nov = card('salary_due', PAY_NOV);
    expect(nov.hero).toMatchObject({ value: 0, caption: 'No daily-wage pay is due for 1 to 30 Nov' });
    expect(nov.table).toBeNull();
    expect(nov.footnote).toBeNull();
  });

  it('attendance_today: counts, the list of who is away, and marks the tab does not show', () => {
    const c = card('attendance_today', DAY);
    expect(c.hero).toMatchObject({ value: 1, kind: 'count', unit: 'absent', caption: '11 Nov, of 4 daily-wage staff' });
    expect(c.rows.map((r) => [r.label, r.value])).toEqual([['Present', 1], ['Half day', 1], ['Absent', 1], ['Not marked', 1]]);
    expect(c.table.rows).toEqual([['Sunita', 'Absent'], ['Imran', 'Half day'], ['Ravi 9876543210', 'Not marked']]);
    expect(c.table.tones).toEqual(['strong', null, null]);
    expect(c.footnote).toBe('1 marks today are for staff the Attendance tab does not list (monthly-salary, inactive or removed) and are not counted.');
  });

  it('attendance_month: missed days ranked, with the Days column', () => {
    const c = card('attendance_month', { ...MONTH, staff: MONTH.staff.slice(0, 2) });
    expect(c.hero).toMatchObject({ value: 3.5, kind: 'days', unit: 'days missed', caption: '3 absent and 1 half days, 1 to 31 Oct',
      detail: '2 of 4 daily-wage staff missed a day' });
    expect(c.table.columns.map((x) => x.label)).toEqual(['Staff', 'Absent days', 'Half days', 'Days']);
    expect(c.table.rows).toEqual([['Ravi Kumar', 2, 1, 12.5], ['Sunita', 1, 0, 14]]);
    expect(c.footnote).toBeNull();
    const none = card('attendance_month', { ...MONTH, absent_days: 0, half_days: 0, missed_days: 0, staff_missed: 0, staff: [] });
    expect(none.hero.detail).toBe('No one of 4 daily-wage staff was marked absent');
    expect(none.table).toBeNull();
  });

  it('every card builds in Hindi too, and empty cards say why', () => {
    for (const [id, f] of [['payroll_month', PAY], ['salary_due', PAY], ['attendance_today', DAY], ['attendance_month', MONTH]]) {
      expect(buildCard(id, f, strings.hi).title).toBe(strings.hi.titles[id]);
      expect(buildCard(id, f, strings.en, true).hero.caption).toBe(strings.en.no_data_by_question[id]);
    }
  });
});

describe('staff: stand-ins', () => {
  const NAMES = ['Ravi Kumar', 'Sunita', 'Imran', 'Meena Joshi', 'Ravi 9876543210'];
  const sent = (f) => JSON.stringify(toModelFigures(f).view);

  it('no staff name, id or phone number reaches the model view', () => {
    for (const f of [PAY, DAY, MONTH]) {
      const s = sent(f);
      for (const n of NAMES) expect(s).not.toContain(n);
      expect(s).not.toMatch(/"E\d"/);
      expect(s).not.toContain('employee_id');
      expect(s).not.toContain('9876543210');
    }
  });

  it('one person keeps one token across staff and due_staff, and the pay figures go alongside', () => {
    const { view, map } = toModelFigures(PAY);
    expect(view.staff.map((s) => s.name)).toEqual(['[P1]', '[P2]', '[P3]', '[P4]']);
    expect(view.due_staff.map((s) => s.name)).toEqual(['[P1]', '[P2]']);
    expect(view.staff[0]).toEqual({ name: '[P1]', pay_type: 'DAILY', days: 6.5, earned: 5850, salary: null, paid: 4500, due: 1350 });
    expect(map).toMatchObject({ '[P1]': 'Ravi Kumar', '[P2]': 'Sunita', '[P4]': 'Meena Joshi' });
    expect(restoreNames('[P1] is owed ₹1,350.', map)).toBe('Ravi Kumar is owed ₹1,350.');
  });

  it('two staff with the same name stay two people', () => {
    const f = { staff: [{ employee_id: 'A', name: 'Raju' }, { employee_id: 'B', name: 'Raju' }] };
    const { view, map } = toModelFigures(f);
    expect(view.staff.map((s) => s.name)).toEqual(['[P1]', '[P2]']);
    expect(map).toEqual({ '[P1]': 'Raju', '[P2]': 'Raju' });
  });

  it('a name that looks like a phone number is still swapped, never dropped or sent', () => {
    const { view, map } = toModelFigures(DAY);
    expect(view.staff.map((s) => s.name)).toEqual(['[P1]', '[P2]', '[P3]']);
    expect(map['[P3]']).toBe('Ravi 9876543210');
  });

  it('HR and statutory fields are dropped by name if a read ever returns one', () => {
    const f = { staff: [{ employee_id: 'A', name: 'Raju', phone: '9876543210', email: 'r@x.in', bank_account: '123456789012',
      ifsc: 'SBIN0001234', upi_id: 'raju@upi', pan: 'ABCDE1234F', aadhaar: '123412341234', uan: '100200300400', esi_no: '31001234560001',
      pf_account: 'MH/BAN/1234', dob: '1990-01-01', date_of_birth: '1990-01-01', emergency_contact: 'x', blood_group: 'O+', gender: 'M',
      employee_code: 'EMP-7', address: 'Pune', staff_name: 'Raju', employee_name: 'Raju', worker_name: 'Raju', paid: 900 }] };
    expect(toModelFigures(f).view.staff).toEqual([{ name: '[P1]', paid: 900 }]);
  });

  it('ordinary keys that only contain those letters survive', () => {
    const { view } = toModelFigures({ quantity: 3, bank_total: 5, half_days: 1, overpaid: 2, staff_due: 1 });
    expect(view).toEqual({ quantity: 3, bank_total: 5, half_days: 1, overpaid: 2, staff_due: 1 });
  });
});

describe('staff: number guard', () => {
  const guard = (text, figures) => {
    const { view, map } = toModelFigures(figures);
    return checkReply(text, view, map);
  };
  it('allows the figures as the cards state them', () => {
    expect(guard('You paid staff ₹14,600 across 5 pay runs this month. [P1] is still owed ₹1,350 and [P2] ₹600.', PAY).ok).toBe(true);
    expect(guard('[P1] and [P2] are owed ₹1,950 in all. [P3] was paid ₹900 more than earned.', PAY).ok).toBe(true);
    expect(guard('[P1] is absent today, [P2] is on a half day and [P3] has not been marked.', DAY).ok).toBe(true);
    expect(guard('[P1] missed the most: 2 absent days and 1 half day, 2.5 days in all.', MONTH).ok).toBe(true);
    expect(guard('[P1] आज ग़ैरहाज़िर है और [P2] का आधा दिन है।', DAY).ok).toBe(true);
  });
  it('rejects a sum, a stand-in or a word the figures do not hold', () => {
    expect(guard('[P1] and [P2] earned ₹8,550 together.', PAY).ok).toBe(false);
    expect(guard('[P5] was absent.', DAY).ok).toBe(false);
    expect(guard('Half the staff were away today.', DAY)).toEqual({ ok: false, reason: 'spelled:half' });
    expect(guard("[P1]'s pay is overdue.", PAY)).toEqual({ ok: false, reason: 'banned:overdue' });
    expect(guard('[P1] missed 7 days.', MONTH).ok).toBe(false);
  });
});

describe('staff: the whole flow', () => {
  const dbFor = (modules, calls = []) => ({
    auth: { getUser: async () => ({ data: { user: { id: 'USER' } } }) },
    from: (table) => {
      const rows = { tenants: { status: 'ACTIVE', settings: { ai_enabled: true, ai_chat_available: true } },
        business_profile: { tax_mode: 'EXCLUSIVE', timezone: 'Asia/Kolkata' }, ai_answer_cache: null, product_batches: [] };
      const q = {};
      for (const m of ['select', 'eq', 'is', 'not', 'limit']) q[m] = () => q;
      q.maybeSingle = async () => ({ data: rows[table], error: null });
      return q;
    },
    rpc: async (name, args) => {
      calls.push(name);
      const h = {
        current_tenant_id: () => 'T1', is_tenant_admin: () => true, get_my_effective_plan: () => 'GROWTH',
        plan_modules: () => modules, ai_staff_pay: () => PAY, ai_usage_claim: () => ({ ok: true, id: 'U1' }), ai_usage_status: () => null,
      };
      return { data: h[name]?.(args) ?? null, error: null };
    },
  });
  const post = (body, db, model) => handle(new Request('https://x/ai-ask', { method: 'POST', headers: { Authorization: 'Bearer good' }, body: JSON.stringify(body) }),
    { ai: { name: 'f', model: 'm', configured: true, ask: model ?? vi.fn() }, db: () => db, now: () => new Date('2026-11-11T06:00:00Z'), cors: {} });

  it('stand-ins reach the model, real names reach the owner, and the card links to the Attendance tab', async () => {
    const model = vi.fn(async () => ({ text: '[P1] is still owed ₹1,350, the most of anyone.', stopReason: 'end_turn', inputTokens: 1, cachedTokens: 0, outputTokens: 1 }));
    const res = await post({ action: 'ask', question_id: 'salary_due', lang: 'en' }, dbFor(['payroll', 'reports']), model);
    const body = await res.json();
    expect(res.status).toBe(200);
    const prompt = model.mock.calls[0][1];
    for (const n of ['Ravi', 'Sunita', 'Meena', 'E1']) expect(prompt).not.toContain(n);
    expect(body.text).toBe('Ravi Kumar is still owed ₹1,350, the most of anyone.');
    expect(body.screen).toMatchObject({ key: 'payroll_attendance', mobile: false, params: { from: '2026-11-01', to: '2026-11-30' } });
    expect(body.card.hero.value).toBe(1950);
  });

  it('a shop whose plan has no payroll sees none of the four, and cannot ask them', async () => {
    const list = await (await post({ action: 'list', lang: 'en' }, dbFor(['sales', 'expenses']))).json();
    expect(list.questions.filter((q) => q.category === 'staff')).toEqual([]);
    const withPayroll = await (await post({ action: 'list', lang: 'en' }, dbFor(['payroll']))).json();
    expect(withPayroll.questions.filter((q) => q.category === 'staff').map((q) => q.id)).toEqual(IDS);
    const res = await post({ action: 'ask', question_id: 'payroll_month', lang: 'en' }, dbFor(['sales']));
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('module_locked');
  });
});
