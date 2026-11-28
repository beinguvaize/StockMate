import { useCallback, useEffect, useMemo, useState } from 'react';
import { classifyWriteFailure } from '../lib/writeOutcome';
import { monthBounds } from '../lib/payrollView';

/**
 * One month of the attendance grid: what the database holds, the edits not
 * yet written, and saving them.
 *
 * Moved out of the Payroll page unchanged in behaviour. Nothing is written
 * until save(). A failed save keeps the buffer: re-saving is an upsert on
 * (tenant_id, employee_id, day) and costs nothing, while throwing away edits
 * the server may already hold is the one move that loses work. After a
 * dropped connection the way out is reload() -- go and look.
 *
 * Unsaved marks are never paid: pay figures come from the server, which only
 * sees what was saved, and Run payroll refuses to open while `pendingCount`
 * is above zero.
 */
export function usePayrollAttendance({ tenantId, month, loadAttendance, saveAttendanceBatch, onSaved }) {
  const [saved, setSaved] = useState({});      // { empId: { day: { status, custom_rate } } }
  const [pending, setPending] = useState({});  // a day mapped to null means "clear it"
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [problem, setProblem] = useState(null); // { kind, title, detail, maySaved }
  const [applyNote, setApplyNote] = useState(null);

  const notice = (title, detail = '') => ({ kind: 'NOTICE', maySaved: false, title, detail });

  const merged = useMemo(() => {
    if (!Object.keys(pending).length) return saved;
    const out = { ...saved };
    for (const [empId, days] of Object.entries(pending)) {
      const row = { ...(out[empId] || {}) };
      for (const [day, val] of Object.entries(days)) {
        if (val === null) delete row[day]; else row[day] = val;
      }
      out[empId] = row;
    }
    return out;
  }, [saved, pending]);

  const pendingCount = useMemo(
    () => Object.values(pending).reduce((n, days) => n + Object.keys(days).length, 0), [pending]);

  const reload = useCallback(async () => {
    const win = monthBounds(month);
    if (!tenantId || !win) return;
    setLoading(true);
    const [y, m] = month.split('-').map(Number);
    const map = await loadAttendance(y, m);
    if (map?.error) {
      setProblem(notice('Could not load attendance', map.error.message));
      setSaved({});
      setLoadFailed(true);
    } else {
      setSaved(map || {});
      setProblem(null);
      setLoadFailed(false);
    }
    setPending({});
    setApplyNote(null);
    setLoading(false);
  }, [tenantId, month, loadAttendance]);

  useEffect(() => { reload(); }, [reload]);

  // Buffered work that disappears without a word is worse than no buffer.
  useEffect(() => {
    if (!pendingCount) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingCount]);

  const stage = (empId, day, value) => {
    setProblem(null);
    setPending((prev) => ({ ...prev, [empId]: { ...(prev[empId] || {}), [day]: value } }));
  };

  const setStatus = (empId, day, status) => {
    const rate = merged[empId]?.[day]?.custom_rate ?? null;
    stage(empId, day, { status, custom_rate: rate });
  };

  const clear = (empId, day) => {
    if (!saved[empId]?.[day]) {
      setPending((prev) => {
        const days = { ...(prev[empId] || {}) };
        delete days[day];
        const next = { ...prev };
        if (Object.keys(days).length) next[empId] = days; else delete next[empId];
        return next;
      });
      return;
    }
    stage(empId, day, null);
  };

  const setRate = (empId, day, value) => {
    const cur = merged[empId]?.[day];
    if (!cur) return;                       // a rate needs a day marked first
    const rate = value === '' ? null : parseFloat(value);
    stage(empId, day, { status: cur.status, custom_rate: Number.isNaN(rate) ? null : rate });
  };

  /**
   * One rate on every Present day of the month that has no rate of its own.
   * Half days are left alone: they already pay half, so a full day's rate
   * there would halve twice. Both counts are reported so skipped days do not
   * look like a partial failure.
   */
  const applyRate = (empId, value) => {
    const rate = parseFloat(value);
    if (!(rate > 0)) { setProblem(notice('Enter a rate above zero to apply.')); return; }
    let set = 0;
    let kept = 0;
    const staged = { ...(pending[empId] || {}) };
    for (const [day, a] of Object.entries(merged[empId] || {})) {
      if (a.status !== 'PRESENT') continue;
      if (a.custom_rate != null) { kept += 1; continue; }
      staged[day] = { status: 'PRESENT', custom_rate: rate };
      set += 1;
    }
    if (!set) {
      setProblem(notice(kept ? `Every present day already has its own rate (${kept}).` : 'No days marked Present this month yet.'));
      return;
    }
    setProblem(null);
    setPending((prev) => ({ ...prev, [empId]: staged }));
    setApplyNote({ empId, text: `${set} day${set === 1 ? '' : 's'} set${kept ? ` · ${kept} kept ${kept === 1 ? 'its' : 'their'} own rate` : ''}` });
  };

  const discard = () => { setPending({}); setProblem(null); setApplyNote(null); };

  const save = async () => {
    if (!pendingCount || saving) return;
    setSaving(true);
    setProblem(null);
    const marks = [];
    const clears = [];
    for (const [empId, days] of Object.entries(pending)) {
      for (const [day, val] of Object.entries(days)) {
        if (val === null) clears.push({ employeeId: empId, day });
        else marks.push({ employeeId: empId, day, status: val.status, customRate: val.custom_rate });
      }
    }
    const { success, error } = await saveAttendanceBatch(marks, clears);
    setSaving(false);
    if (!success) {
      setProblem(classifyWriteFailure(error, { noun: 'attendance save' }));
      return;
    }
    setSaved((prev) => {
      const next = { ...prev };
      for (const [empId, days] of Object.entries(pending)) {
        const row = { ...(next[empId] || {}) };
        for (const [day, val] of Object.entries(days)) {
          if (val === null) delete row[day]; else row[day] = val;
        }
        next[empId] = row;
      }
      return next;
    });
    setPending({});
    setApplyNote(null);
    onSaved?.();
  };

  return {
    saved, pending, attendance: merged, pendingCount, saving, loading, loadFailed, problem, applyNote,
    setProblem, setStatus, clear, setRate, applyRate, discard, save, reload,
  };
}

export default usePayrollAttendance;
