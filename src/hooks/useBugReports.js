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
  const [notes, setNotes] = useState({});   // report_id -> note[]
  const [loading, setLoading] = useState(adminMode);

  const fetchAll = useCallback(async () => {
    // Customers list their own reports too, so they can see what happened to
    // them. RLS decides what comes back: their own rows, and only the PUBLIC
    // notes on them.
    if (!adminMode && !tenantId) return;
    setLoading(true);
    try {
      let q = supabase.from('bug_reports').select('*').order('created_at', { ascending: false }).limit(500);
      const { data: rows, error } = await q;
      if (!error) setData(rows || []);

      // Notes for every listed report. A tenant reading this same table sees
      // only PUBLIC ones -- that is enforced by the row's policy, not here, so
      // the client cannot leak an internal note by asking the wrong way.
      const { data: noteRows, error: noteErr } = await supabase
        .from('bug_report_notes')
        .select('*').is('deleted_at', null)
        .order('created_at', { ascending: true }).limit(2000);
      if (noteErr) console.error('bug notes fetch error:', noteErr);
      const byReport = {};
      for (const n of noteRows || []) {
        (byReport[n.report_id] = byReport[n.report_id] || []).push(n);
      }
      setNotes(byReport);
    } finally {
      setLoading(false);
    }
  }, [adminMode, tenantId]);

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

  /**
   * Add a note. `visibility` decides who can ever read it: PUBLIC reaches the
   * customer who filed the report, INTERNAL never leaves the team. The default
   * is INTERNAL because the safe mistake is a note the customer does not see,
   * not one they should not have.
   */
  const addNote = async (reportId, body, visibility = 'INTERNAL') => {
    const text = String(body || '').trim();
    if (!reportId) return { error: new Error('addNote: reportId required') };
    if (!text) return { error: new Error('A note cannot be empty.') };
    if (!['PUBLIC', 'INTERNAL'].includes(visibility)) {
      return { error: new Error(`addNote: unknown visibility ${visibility}`) };
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('bug_report_notes').insert({
      report_id: reportId,
      // Overwritten by the trigger from the report itself; sent so the insert
      // satisfies NOT NULL.
      tenant_id: data.find(r => r.id === reportId)?.tenant_id || null,
      visibility,
      body: text.slice(0, 4000),
      author_id: user?.id || null,
      author_name: user?.email || null,
    });
    if (!error) await fetchAll();
    return { error };
  };

  const deleteNote = async (noteId) => {
    const { error } = await supabase.from('bug_report_notes')
      .update({ deleted_at: new Date().toISOString() }).eq('id', noteId);
    if (!error) await fetchAll();
    return { error };
  };

  return { data, notes, loading, refetch: fetchAll, submit, updateStatus, addNote, deleteNote };
};
