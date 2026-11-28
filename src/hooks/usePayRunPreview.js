import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPayRun } from '../lib/payRunClient';

/**
 * The server's pay figures for a window, kept current.
 *
 *   const { data, loading, error, reload } = usePayRunPreview({ tenantId, from, to, ... })
 *
 * `data` is what lib/payRunClient returns. It is kept while a newer request is
 * in flight (so typing a bonus does not blank the table) and dropped when the
 * window itself changes (so one month's figures never sit under another's
 * heading). Only the newest answer is ever applied.
 *
 * `version` is anything that changes when the inputs on the server change: a
 * saved attendance batch, a saved or deleted pay run, an edited employee.
 */
export function usePayRunPreview({ tenantId, from, to, includeOnLeave = [], adjustments = {}, skipAdvance = [], recoverAll = [], enabled = true, version = 0, debounceMs = 0 }) {
  const [state, setState] = useState({ data: null, loading: !!enabled, error: null, key: null });
  const seq = useRef(0);
  const windowKey = `${tenantId}|${from}|${to}`;
  const inputsKey = JSON.stringify([includeOnLeave, adjustments, skipAdvance, recoverAll]);

  const run = useCallback(async () => {
    if (!enabled || !tenantId || !from || !to || to < from) {
      setState((s) => ({ ...s, loading: false }));
      return null;
    }
    const mine = ++seq.current;
    setState((s) => ({ data: s.key === windowKey ? s.data : null, loading: true, error: null, key: windowKey }));
    try {
      const data = await fetchPayRun({ tenantId, from, to, includeOnLeave, adjustments, skipAdvance, recoverAll });
      if (mine === seq.current) setState({ data, loading: false, error: null, key: windowKey });
      return data;
    } catch (error) {
      console.error('[payroll] payroll-run failed:', error);
      if (mine === seq.current) setState((s) => ({ ...s, loading: false, error }));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, windowKey, inputsKey]);

  useEffect(() => {
    if (!debounceMs) { run(); return undefined; }
    const t = setTimeout(run, debounceMs);
    return () => clearTimeout(t);
  }, [run, version, debounceMs]);

  const current = state.key === windowKey ? state.data : null;
  return { data: current, loading: state.loading, error: state.error, reload: run };
}

export default usePayRunPreview;
