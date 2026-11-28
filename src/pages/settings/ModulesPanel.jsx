import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { PLANS, getRequiredPlan } from '../../lib/tenancy';
import { BUSINESS_TYPES, VERTICAL_META, DEFAULT_MODULES, MODULE_KEYS, MODULE_META, overridesFrom } from '../../lib/verticals';
import { Button } from '../../components/ui/button';
import OptionCard, { OptionGroup } from '../../components/ui/OptionCard';
import { Switch } from '../../components/documents/DocParts';
import { PanelHead, Stack, SCard, FormRow, Note, LockPill, useSaveState, SaveMsg } from './parts';
import { rereadSaved } from './lib/reread';

/**
 * Business type & modules (approved settings-04).
 *
 * Two axes meet on this screen, and they are not the same thing:
 *   · the PLAN says what the shop has paid for. Server-enforced. Not editable
 *     here, and a toggle cannot buy it.
 *   · the VERTICAL says which parts of that a shop wants to see. This screen.
 * Saved with updateTenant({ business_type, modules }), as before. Owner only.
 */
export default function ModulesPanel() {
  const { currentTenantId, businessType, tenantModules, updateTenant, isModuleAllowed } = useTenant();
  const { isOwner } = useAuth();

  const [type, setType] = useState(businessType);
  const [modules, setModules] = useState(tenantModules);
  const lastSent = useRef(null);
  const recheck = useCallback(
    () => rereadSaved({ table: 'tenants', idCol: 'id', id: currentTenantId, sent: lastSent.current }),
    [currentTenantId],
  );
  const save = useSaveState({ recheck });

  // Re-seed when the tenant finishes loading, or after another device saves.
  useEffect(() => { setType(businessType); setModules(tenantModules); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [businessType, JSON.stringify(tenantModules)]);

  const defaults = DEFAULT_MODULES[type] || DEFAULT_MODULES.RETAIL;
  const pending = overridesFrom(type, modules);
  const dirty = type !== businessType ||
    JSON.stringify(pending) !== JSON.stringify(overridesFrom(businessType, tenantModules));

  // Switching vertical re-bases every toggle on the new defaults. Carrying the
  // old overrides across would silently hand a restaurant the retail module set
  // under a restaurant label.
  const chooseType = (next) => { setType(next); setModules(DEFAULT_MODULES[next]); save.clear(); };

  const onSave = () => {
    const patch = { business_type: type, modules: overridesFrom(type, modules) };
    lastSent.current = patch;
    return save.run(() => updateTenant(patch), 'Saved.');
  };

  if (!isOwner) {
    return (
      <div>
        <PanelHead title="Business type & modules" sub="Which parts of the app this shop uses." />
        <Stack>
          <SCard title="Business type & modules" sub="Only the account owner can change these.">
            <FormRow label="Business type" text>{VERTICAL_META[businessType]?.label || businessType}</FormRow>
          </SCard>
        </Stack>
      </div>
    );
  }

  return (
    <div>
      <PanelHead title="Business type & modules" sub="Which parts of the app this shop uses." />
      <Stack>
        <SCard pad title="Business type" sub="Sets the starting module list and the words the app uses. A restaurant sees Dishes and Orders where a shop sees Products and Sales.">
          <OptionGroup cols={3} aria-label="Business type">
            {BUSINESS_TYPES.map((id) => (
              <OptionCard key={id} title={VERTICAL_META[id]?.label || id} hint={VERTICAL_META[id]?.tagline}
                selected={type === id} onClick={() => chooseType(id)} />
            ))}
          </OptionGroup>
        </SCard>

        <SCard title="Modules" sub="What this shop sees. Switching one off hides it from the menu and closes the page; nothing is deleted and you can switch it back."
          footer={<>
            <SaveMsg state={save} noun="change" hint="Plan decides what is paid for; these decide what is shown." />
            <Button variant="outline" size="sm" onClick={() => { setModules(defaults); save.clear(); }}>Reset to defaults</Button>
            <Button size="sm" onClick={onSave} disabled={save.busy || !dirty}>{save.busy ? 'Saving…' : 'Save changes'}</Button>
          </>}>
          {MODULE_KEYS.map((key) => {
            const meta = MODULE_META[key] || { label: key };
            const on = !!modules[key];
            const isDefault = !!defaults[key];
            // A toggle the plan does not cover would look like it worked and
            // then change nothing, so it is shown locked with the plan that
            // would unlock it.
            const planned = meta.plan ? isModuleAllowed(meta.plan) : true;
            const needs = meta.plan ? getRequiredPlan(meta.plan) : null;
            return (
              <FormRow key={key} label={meta.label} hint={meta.help}>
                <div className="flex items-center gap-2 pt-0.5">
                  {planned
                    ? <Switch checked={on} label={meta.label} onChange={(v) => { setModules((m) => ({ ...m, [key]: v })); save.clear(); }} />
                    : <LockPill>Needs {PLANS[needs]?.label || needs}</LockPill>}
                  {planned && on !== isDefault && (
                    <span className="ml-2 rounded-pill bg-amber-soft px-2 py-0.5 font-tight text-[11px] font-semibold text-amber-text">Changed from default</span>
                  )}
                </div>
              </FormRow>
            );
          })}
        </SCard>

        <Note tone="am">
          Picking a different type resets the modules to that type's defaults. Your data is not touched: no product, bill or client changes.{' '}
          <b>Only the owner can change these;</b> other logins see the type, read-only.
        </Note>
      </Stack>
    </div>
  );
}
