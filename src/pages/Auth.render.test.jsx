import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

/**
 * Smoke test: the sign-in and first-time setup screens render in the approved
 * look (auth-01..14, setup-01..13) with every server call stubbed. Nothing here
 * reaches a real server: supabase is a stub that throws if anything is called
 * during render.
 */
const boom = () => { throw new Error('no server calls during render'); };
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => new Promise(() => {}),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: boom, signUp: boom, resetPasswordForEmail: boom, signInWithOAuth: boom,
      updateUser: boom, signOut: boom, signInWithOtp: boom, verifyOtp: boom,
    },
    from: boom,
  },
}));
vi.mock('../lib/offline/authGuard', () => ({
  isElectron: () => false, loadBootstrap: async () => null, isGraceValid: () => true,
  isSubscriptionActive: () => true, OFFLINE_GRACE_MS: 1,
}));
const auth = { currentUser: null, loading: false, login: boom, logout: () => {} };
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
const tenant = { currentTenant: { name: 'Test Shop', plan: 'GROWTH', status: 'TRIAL', trial_end_date: '2027-01-27' } };
vi.mock('../context/TenantContext', () => ({ useTenant: () => tenant }));

globalThis.React = React;
const { default: Login } = await import('./Login.jsx');
const { default: SaaSLogin } = await import('./SaaSLogin.jsx');
const { default: ResetPassword } = await import('./ResetPassword.jsx');
const { default: TenantSetup } = await import('./TenantSetup.jsx');
const { default: Onboarding } = await import('./Onboarding.jsx');
const { default: AccountNotProvisioned } = await import('../components/AccountNotProvisioned.jsx');

const html = (el) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);

describe('sign-in screens', () => {
  it('sign-in shows email, masked password, WhatsApp and Google, and the signup link', () => {
    const out = html(<Login />);
    expect(out).toContain('Welcome back');
    expect(out).toContain('Sign in to your shop.');
    expect(out).toContain('Forgot password?');
    expect(out).toMatch(/type="password"/);
    expect(out).toContain('aria-label="Show password"');
    expect(out).toContain('Sign in with WhatsApp');
    expect(out).toContain('Continue with Google');
    expect(out).toContain('Create an account');
    expect(out).toContain('Inventory, billing and reports, built for Indian shops.');
  });

  it('the register page signs in and signs up in the same look', () => {
    const out = html(<SaaSLogin />);
    expect(out).toContain('Welcome back');
    expect(out).toMatch(/type="password"/);
    expect(out).toContain('Continue with Google');
  });

  it('reset page asks for the email link when there is no recovery session', () => {
    const out = html(<ResetPassword />);
    expect(out).toContain('Open the link from your email');
    expect(out).toContain('Go to sign in for a new link');
  });

  it('account-not-set-up names the address and offers sign out', () => {
    const out = html(<AccountNotProvisioned email="someone@example.test" onSignOut={() => {}} />);
    expect(out).toContain('This account is not set up yet');
    expect(out).toContain('someone@example.test');
    expect(out).toContain('Sign out');
    const gone = html(<AccountNotProvisioned email="someone@example.test" onSignOut={() => {}} removed />);
    expect(gone).toContain('This account no longer has access');
  });
});

describe('first-time setup', () => {
  it('opens on the plan step with Growth picked', () => {
    const out = html(<TenantSetup />);
    expect(out).toContain('Step 1 of 6');
    expect(out).toContain('Pick a plan to start with');
    expect(out).toContain('Most popular');
    expect(out).toContain('Continue with Growth');
    expect(out).toContain('₹1,999');
    expect(out).toContain('Need a hand? WhatsApp support');
    expect(out).toContain('Sign out');
    expect(out).not.toContain('/mo');   // the old card read "₹1,999/yr /mo"
  });

  it('welcome card names the shop, the plan and the trial end', () => {
    const out = html(<Onboarding />);
    expect(out).toContain('Welcome, Test Shop');
    expect(out).toContain('Growth plan');
    expect(out).toContain('trial ends');
    expect(out).toContain('1,000 invoices a month');
    expect(out).toContain('Get started');
    expect(out).toContain('Skip, go to the Dashboard');
  });
});
