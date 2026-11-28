import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, KeyRound } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/button';
import Dialog from '../../components/ui/Dialog';
import CopyButton from '../../components/motion/CopyButton';
import { PanelHead, Stack, SCard, Note, Pill, TextLink, useSaveState, SaveMsg } from './parts';
import UpgradeDialog from './UpgradeDialog';
import { rereadSaved } from './lib/reread';

/**
 * API (approved settings-15 and 16). Enterprise plan.
 *
 * The key is still made in the browser and written to tenants.api_key, as
 * before (reported, not changed here). It is shown masked until Show, as
 * before. Regenerating now asks first, because the old key stops at once.
 */
export default function ApiPanel() {
  const { currentTenant, currentTenantId } = useTenant();
  const isEnterprise = (currentTenant?.plan || 'STARTER') === 'ENTERPRISE';
  const [apiKey, setApiKey] = useState(currentTenant?.api_key || '');
  const [visible, setVisible] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const pending = useRef(null);

  useEffect(() => { setApiKey(currentTenant?.api_key || ''); }, [currentTenant?.api_key]);

  const recheck = useCallback(async () => {
    const saved = await rereadSaved({ table: 'tenants', idCol: 'id', id: currentTenantId, sent: { api_key: pending.current } });
    if (saved) { setApiKey(pending.current); setVisible(true); }
    return saved;
  }, [currentTenantId]);
  const save = useSaveState({ recheck });

  const generate = async () => {
    if (!isEnterprise) return;
    const newKey = `sk_live_${crypto.randomUUID().replace(/-/g, '')}`;
    pending.current = newKey;
    const ok = await save.run(() => supabase.from('tenants').update({ api_key: newKey }).eq('id', currentTenantId), 'New key made. Copy it into your software now.');
    if (ok) { setApiKey(newKey); setVisible(true); setConfirm(false); }
  };

  const masked = apiKey ? `${apiKey.slice(0, 8)}${'•'.repeat(32)}` : '';

  return (
    <div>
      <PanelHead title="API" sub="Keys for connecting other software. Enterprise plan." />
      <Stack>
        {isEnterprise ? (
          <SCard pad title="API access" sub="A key for your own software to read and write this shop. Treat it like a password." right={<Pill tone="b">Enterprise</Pill>}
            footer={<>
              <SaveMsg state={save} noun="new key" />
              <Button variant="outline" size="sm" disabled={save.busy}
                onClick={() => (apiKey ? setConfirm(true) : generate())}>
                <RefreshCw aria-hidden="true" className={save.busy ? 'animate-spin' : ''} />{apiKey ? 'Regenerate key' : 'Generate API key'}
              </Button>
            </>}>
            {apiKey ? (
              <>
                <div className="flex items-center gap-2.5 rounded-xl bg-tile px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
                  <KeyRound size={15} className="shrink-0 text-mute" aria-hidden="true" />
                  <code className="min-w-0 flex-1 truncate font-tight text-[13px] font-medium tracking-[0.08em] text-ink-2">{visible ? apiKey : masked}</code>
                  <TextLink onClick={() => setVisible((v) => !v)}>{visible ? 'Hide' : 'Show'}</TextLink>
                  <CopyButton value={apiKey} label="Copy key" />
                </div>
                <Note tone="rd" className="mt-3">Regenerating stops the current key at once. Anything using it stops working until it is given the new key.</Note>
              </>
            ) : (
              <div className="rounded-xl bg-tile p-4 text-center text-[13px] text-mute shadow-[inset_0_0_0_1px_var(--color-line)]">No API key yet.</div>
            )}
          </SCard>
        ) : (
          <SCard pad title="API access" sub="A key for your own software to read and write this shop." right={<Pill>Enterprise</Pill>}>
            <Note tone="am">
              API access needs the Enterprise plan.
              <TextLink className="ml-1.5" onClick={() => setUpgrade(true)}>Upgrade</TextLink>
            </Note>
          </SCard>
        )}
      </Stack>

      <Dialog open={confirm} onClose={() => setConfirm(false)} width={470} title="Regenerate the API key?" subtitle="Enterprise · API access"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(false)}>Keep current key</Button>
          <Button variant="destructive" onClick={generate} disabled={save.busy}>{save.busy ? 'Regenerating…' : 'Regenerate'}</Button>
        </>}>
        <p className="text-[14px] text-ink-2">The current key stops working the moment the new one is made. Any till, website or script using it will fail until you paste in the new key.</p>
        {save.error && <div className="mt-3"><SaveMsg state={save} noun="new key" /></div>}
      </Dialog>

      <UpgradeDialog open={upgrade} onClose={() => setUpgrade(false)} reason="API access needs the Enterprise plan" />
    </div>
  );
}
