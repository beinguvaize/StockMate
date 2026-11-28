import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, MessageCircle, Activity, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, buttonVariants } from '../../components/ui/button';
import { PanelHead, Stack, SCard, FormRow } from './parts';
import { cn } from '../../lib/utils';

/**
 * Help & support (approved settings-18). The addresses are today's; the
 * mockup's sample address is not wired to anything we know receives mail.
 */
export function SupportPanel() {
  const out = cn(buttonVariants({ variant: 'outline', size: 'sm' }));
  return (
    <div>
      <PanelHead title="Help & support" sub="How to reach us." />
      <Stack>
        <SCard title="Help & support" sub="We usually reply within a business day.">
          <FormRow label="Email" hint="support@ledgrpro.co">
            <a href="mailto:support@ledgrpro.co" target="_blank" rel="noreferrer" className={out}><Mail aria-hidden="true" />Send email</a>
          </FormRow>
          <FormRow label="WhatsApp" hint="Chat with our support team">
            <a href="https://wa.me/919778707474" target="_blank" rel="noreferrer" className={out}><MessageCircle aria-hidden="true" />Open chat</a>
          </FormRow>
          <FormRow label="Report a bug" text>Use the Report issue button at the bottom right of any page.</FormRow>
          <FormRow label="Sync diagnostics" hint="Changes waiting to upload, and any that failed.">
            <Link to="/sync-diagnostics" className={out}><Activity aria-hidden="true" />Open</Link>
          </FormRow>
        </SCard>
      </Stack>
    </div>
  );
}

/** Settings sections that need the Settings permission (approved settings-19). */
export function NoSettingsAccess() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="px-5 pb-14 pt-[120px] text-center" data-testid="settings-no-access">
      <div className="mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-tile text-ink-2"><Lock size={22} aria-hidden="true" /></div>
      <h4 className="font-tight text-[16px] font-semibold text-ink">Settings are for the owner and admins</h4>
      <p className="mx-auto mb-4 mt-1 max-w-[46ch] text-[13.5px] text-body">
        Your login{currentUser?.name ? `, ${currentUser.name},` : ''} does not have the Settings permission. Ask the owner to turn it on in Users &amp; roles.
      </p>
      <Button variant="secondary" onClick={() => navigate(-1)}>Go back</Button>
    </div>
  );
}
