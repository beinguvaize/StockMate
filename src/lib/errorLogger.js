import { supabase } from './supabase';
import { buildErrorRow, classifyError, newReference } from './errorCodes';

/**
 * Platform Error Logger
 * Captures and persists application-level failures to the cloud.
 */

/**
 * Logs an error to the platform_error_logs table via a RPC call.
 * RPC is used to bypass RLS during the recording phase using a SECURITY DEFINER function.
 * 
 * @param {Object} params - Error details
 * @param {string} params.module - The ERP module where the error occurred (Inventory, Sales, etc.)
 * @param {string} params.action - The specific operation that failed (Save Invoice, Load Data, etc.)
 * @param {string|number} params.error_code - The database or application error code
 * @param {string} params.error_message - Descriptive message for the error
 * @param {string} [params.severity='Medium'] - Priority of the error (Critical, High, Medium, Low)
 * @param {string} [params.stack_trace] - JS Stack trace if available
 */
export async function logError({ 
  module, 
  action, 
  error_code, 
  error_message, 
  severity = 'Medium', 
  stack_trace 
}) {
  try {
    // 1. Infer Context from Session/Storage
    const storedTenant = sessionStorage.getItem('nexus_impersonated_tenant');
    const tenantObj = storedTenant ? JSON.parse(storedTenant) : null;
    
    // Fallback to fetching user meta from Supabase if not in storage
    const { data: { user } } = await supabase.auth.getUser();
    
    const context = {
        tenant_id: tenantObj?.id || user?.user_metadata?.tenant_id || 'a0000000-0000-0000-0000-000000000001',
        user_id: user?.id || null,
        user_role: user?.user_metadata?.role || 'ANON',
        plan_tier: tenantObj?.plan || user?.user_metadata?.plan || 'STARTER'
    };

    // 2. Detect RLS / Plan Restriction
    const isPlanBlocked = String(error_code) === '42501';
    const finalErrorMessage = isPlanBlocked 
        ? `[RLS_PLAN_BLOCKED] ${error_message} (Action potentially unauthorized for current plan)`
        : error_message;

    // 3. Transmit Diagnostics via SECURITY DEFINER function
    const { data, error } = await supabase.rpc('record_platform_error', {
      p_tenant_id: context.tenant_id,
      p_user_id: context.user_id,
      p_user_role: context.user_role,
      p_module: module,
      p_action: action,
      p_error_code: String(error_code || 'APP_ERR'),
      p_error_message: finalErrorMessage,
      p_stack_trace: stack_trace || new Error().stack,
      p_severity: isPlanBlocked ? 'High' : severity,
      p_plan_tier: context.plan_tier
    });

    if (error) {
      console.error('Failed to record diagnostic log:', error);
    }

    // 3. Optional Console Feedback (Dev Mode)
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.includes('-dev.'))) {
      const color = severity === 'Critical' ? '#ff0000' : severity === 'High' ? '#ffa500' : '#4169e1';
      console.log(
        `%c[Diagnostics] ${severity} Error in ${module} during ${action}: ${error_message}`, 
        `color: ${color}; font-weight: bold;`
      );
    }

    return { success: !error, id: data };
  } catch (err) {
    console.error('Fatal error in LoggerService:', err);
    return { success: false };
  }
}

/**
 * Higher-Order Wrapper for Supabase queries.
 * Automatically catches and logs errors without breaking the app flow.
 * 
 * @param {string} module - ERP module name
 * @param {string} action - Action description
 * @param {Function} queryFn - Async function that returns { data, error }
 */
export async function safeQuery(module, action, queryFn, severity = 'Medium') {
    const result = await queryFn();
    
    if (result.error) {
        logError({
            module,
            action,
            error_code: result.error.code,
            error_message: result.error.message,
            severity
        });
    }
    
    return result;
}

/**
 * Log one shown error with its support code and reference -- the same row the
 * phone writes (code, reference, outcome, screen, action, platform, app
 * version, UTC time, scrubbed raw error). A direct INSERT, gated by the
 * "Members log their own shop's errors" policy; no SECURITY DEFINER call.
 *
 * Fire-and-forget: never throws, never blocks the screen. Until the 20261127
 * migration is applied the insert is refused, and that is returned, not
 * thrown. Never pass shop name, client name, amounts or typed values.
 *
 * @returns {Promise<{success: boolean, reference: string, error?: string}>}
 */
export async function logCodedError({
  error, result, reference, screen, action, tenantId, userId = null,
  appVersion = null, sent = true, earlierWriteSucceeded = false,
  offlineBeforeSend = false, client,
}) {
  const ref = reference || newReference();
  try {
    const r = result || classifyError(error, { sent, earlierWriteSucceeded, offlineBeforeSend });
    const row = buildErrorRow({
      result: r, reference: ref, screen, action, tenantId, userId,
      raw: String(error?.message || error || ''), appVersion,
    });
    const db = client || supabase;
    const { error: insertError } = await db.from('platform_error_logs').insert(row);
    if (insertError && insertError.code !== '23505') {
      // Local only: logging a logging failure would loop.
      console.warn('[error-log] insert refused:', insertError.code, insertError.message);
      return { success: false, reference: ref, error: insertError.message };
    }
    return { success: true, reference: ref };
  } catch (err) {
    console.warn('[error-log] insert failed:', err?.message || err);
    return { success: false, reference: ref, error: String(err?.message || err) };
  }
}
