import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const APP_VERSION = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_VERSION) || 'dev';

const detectSourceApp = () => {
  if (typeof navigator === 'undefined') return 'WEB';
  return /Electron/i.test(navigator.userAgent) ? 'DESKTOP' : 'WEB';
};

/**
 * useBugReports — submit + list bug reports.
 * - submit(): any logged-in user (their tenant). RLS enforces tenant scope.
 * - list / update: global-admin only (RLS blocks others).
 */
export const useBugReports = (tenantId, { adminMode = false } = {}) => {
  const [data, setData]   = useState([]);
  const [loading, setLoading] = useState(adminMode);

  const fetchAll = useCallback(async () => {
    if (!adminMode) return;
    setLoading(true);
    try {
      let q = supabase.from('bug_reports').select('*').order('created_at', { ascending: false }).limit(500);
      const { data: rows, error } = await q;
      if (!error) setData(rows || []);
    } finally {
      setLoading(false);
    }
  }, [adminMode]);

  useEffect(() => {
    fetchAll();
    if (!adminMode) return;
    const ch = supabase
      .channel('bug_reports_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bug_reports' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [adminMode, fetchAll]);

  const submit = async ({ title, description, severity = 'NORMAL' }) => {
    if (!title?.trim() || !description?.trim()) {
      return { error: new Error('title and description required') };
    }
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      tenant_id:   tenantId || null,
      user_id:     user?.id || null,
      user_email:  user?.email || null,
      title:       title.trim().slice(0, 200),
      description: description.trim().slice(0, 4000),
      severity,
      source_app:  detectSourceApp(),
      app_version: APP_VERSION,
      page_url:    typeof window !== 'undefined' ? window.location.href : null,
      user_agent:  typeof navigator !== 'undefined' ? navigator.userAgent : null,
    };
    const { error } = await supabase.from('bug_reports').insert(payload);
    return { error };
  };

  const updateStatus = async (id, patch) => {
    const { error } = await supabase.from('bug_reports').update(patch).eq('id', id);
    if (!error) await fetchAll();
    return { error };
  };

  return { data, loading, refetch: fetchAll, submit, updateStatus };
};
