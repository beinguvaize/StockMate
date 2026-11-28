import React, { useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Shared pieces of the sign-in screens (approved auth-01 to 14): the split
 * page with the grey brand panel, labelled fields, the masked password with
 * its show/hide eye, notes, the big status icon, the "or" rule and the back
 * link. Look only: every screen keeps its own handlers.
 */

export const LOGO_SRC = `${import.meta.env.BASE_URL}logo-clear.png`;

const Svg = ({ children, className, size = 17 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn('shrink-0', className)}>
    {children}
  </svg>
);

export const Icon = {
  eye: (p) => <Svg {...p}><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" /></Svg>,
  eyeOff: (p) => <Svg {...p}><path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10.5 7 10.5 7a17 17 0 01-3.2 3.9M6.6 6.6C3.4 8.4 1.5 12 1.5 12s4 7 10.5 7a10 10 0 005.4-1.6" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></Svg>,
  mail: (p) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Svg>,
  warn: (p) => <Svg {...p}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></Svg>,
  info: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></Svg>,
  check: (p) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>,
  lock: (p) => <Svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></Svg>,
  back: (p) => <Svg {...p}><path d="M14 6l-6 6 6 6" /></Svg>,
  whatsapp: (p) => <Svg {...p}><path d="M12 3a9 9 0 00-7.8 13.4L3 21l4.7-1.2A9 9 0 1012 3z" /><path d="M8.8 8.5c.3 2.9 3.2 6 6.6 6.6l1.1-1.4-2-1-1 .9c-1.1-.5-2.2-1.6-2.7-2.7l.9-1-1-2z" /></Svg>,
  google: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 12h8M16.5 7.5A6 6 0 1018 12" /></Svg>,
  search: (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>,
  spinner: ({ className }) => (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" className={cn('animate-spin motion-reduce:animate-none', className)}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" opacity=".25" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
};

/** Split page: grey brand panel on the left (wide screens), the form on the right. */
export function AuthShell({ children, onLogoClick }) {
  return (
    <div className="grid min-h-screen bg-white font-inter text-ink lg:grid-cols-[minmax(420px,600px)_1fr]">
      <aside className="hidden flex-col bg-frame px-12 py-10 lg:flex">
        <img src={LOGO_SRC} alt="bookledger" onClick={onLogoClick}
          className="h-[30px] w-auto self-start select-none" draggable="false" />
        <div className="my-auto max-w-[420px]">
          <h1 className="font-tight text-[34px] font-semibold leading-[1.12] tracking-[-0.03em] text-ink">
            Inventory, billing and reports, built for Indian shops.
          </h1>
          <p className="mt-3 text-[15px] leading-[1.5] text-body">
            Sign in on the web, the phone or the desktop app. Your books are the same on all three.
          </p>
        </div>
        <div className="text-[12px] text-mute">© 2026 bookledger</div>
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-12 sm:px-12">
        {/* The logo still shows on a narrow screen, where the brand panel is hidden. */}
        <img src={LOGO_SRC} alt="bookledger" onClick={onLogoClick}
          className="mb-8 h-[26px] w-auto select-none lg:hidden" draggable="false" />
        <div className="m-rise w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}

export const AuthTitle = ({ title, sub }) => (
  <>
    <h2 className="font-tight text-[28px] font-semibold tracking-[-0.025em] text-ink">{title}</h2>
    {sub && <p className="mb-6 mt-1.5 text-[14px] text-body">{sub}</p>}
  </>
);

/** Big status tile above a heading: amber (mail), red (stop) or green (done). */
export const AuthMark = ({ tone = 'am', children }) => (
  <div className={cn('mb-[18px] grid h-14 w-14 place-items-center rounded-2xl',
    tone === 'rd' ? 'bg-bad-soft text-bad-text' : tone === 'gr' ? 'bg-good-soft text-good-text' : 'bg-amber-soft text-amber-text')}>
    {children}
  </div>
);

/** Label row (with an optional action on the right) over a control. */
export const AuthField = ({ label, htmlFor, action, children, className }) => (
  <div className={cn('mb-3.5 block', className)}>
    {label && (
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">{label}</label>
        {action}
      </div>
    )}
    {children}
  </div>
);

/** The input box. `bad` paints the soft red ring the error boards show. */
export const boxCls = (bad) => cn(
  'flex h-[46px] items-center gap-2 rounded-xl bg-white px-3.5 text-[14.5px] text-ink transition-shadow duration-[var(--dur-hover)]',
  bad ? 'shadow-[inset_0_0_0_1.5px_#E7A3A3]' : 'shadow-[inset_0_0_0_1px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-ink)]',
);
export const inputCls = 'min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-mute';

export function AuthInput({ bad, lead, trail, className, ...props }) {
  return (
    <div className={cn(boxCls(bad), className)}>
      {lead}
      <input className={inputCls} aria-invalid={bad || undefined} {...props} />
      {trail}
    </div>
  );
}

/** "+91" shown, not typed, with the hairline after it. */
export const PhonePrefix = () => (
  <span className="mr-0.5 border-r border-line pr-2.5 text-body">+91</span>
);

/**
 * Password box with the show/hide eye. Hidden by default; revealing is the
 * user's choice. The eye is type=button so it never submits the form.
 */
export function PasswordInput({ bad, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <AuthInput bad={bad} type={show ? 'text' : 'password'} {...props}
      trail={(
        <button type="button" onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
          title={show ? 'Hide password' : 'Show password'}
          className="m-press -mr-1 grid h-8 w-8 place-items-center rounded-full text-mute hover:text-ink">
          {show ? <Icon.eyeOff /> : <Icon.eye />}
        </button>
      )} />
  );
}

const NOTE = {
  rd: 'bg-bad-soft text-[#991b1b]',
  am: 'bg-amber-soft text-[#7c3d06]',
  gr: 'bg-good-soft text-[#0f6b31]',
  gy: 'bg-tile text-body shadow-[inset_0_0_0_1px_var(--color-line)]',
};
const NOTE_ICON = { rd: Icon.warn, am: Icon.info, gr: Icon.check, gy: Icon.info };

export function AuthNote({ tone = 'gy', children, className, role }) {
  const I = NOTE_ICON[tone];
  return (
    <div role={role ?? (tone === 'rd' ? 'alert' : 'status')}
      className={cn('mb-3.5 flex items-start gap-2.5 rounded-xl px-3.5 py-[11px] text-[13px] leading-[1.45] [&_b]:font-semibold', NOTE[tone], className)}>
      <I className="mt-px" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Full-width 48px button: amber primary, white outlined alternative. */
export function AuthButton({ variant = 'pri', className, children, busy, ...props }) {
  return (
    <button type="button" {...props}
      className={cn(
        'm-press mt-1.5 flex h-12 w-full items-center justify-center gap-2 rounded-pill font-tight text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'pri' ? 'bg-amber text-white hover:bg-amber-hover' : 'bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile',
        className,
      )}>
      {busy && <Icon.spinner />}
      {children}
    </button>
  );
}

export const OrRule = () => (
  <div className="mb-3 mt-[18px] flex items-center gap-3 font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
    or
  </div>
);

export const BackLink = ({ children, onClick }) => (
  <button type="button" onClick={onClick}
    className="m-press mb-[22px] inline-flex items-center gap-1.5 font-tight text-[13px] font-semibold text-body hover:text-ink">
    <Icon.back size={15} />{children}
  </button>
);

/** Amber text link (Forgot password?, Create an account). */
export const AuthLink = ({ children, className, ...props }) => (
  <button type="button" {...props}
    className={cn('font-tight font-semibold text-amber-text hover:underline underline-offset-4 disabled:cursor-not-allowed disabled:text-faint disabled:no-underline', className)}>
    {children}
  </button>
);

export const Swap = ({ children }) => (
  <p className="mt-[22px] text-center text-[13.5px] text-body">{children}</p>
);

export const Hint = ({ children, className, ...props }) => (
  <p {...props} className={cn('text-[12px] text-mute', className)}>{children}</p>
);

/**
 * The code boxes. One real input sits over six drawn boxes, so the code keeps
 * a single value, the browser's one-time-code autofill still lands, and paste
 * works. More boxes appear if a longer code is typed (the input allows 8).
 */
export function OtpBoxes({ value, onChange, maxLength = 8, ...props }) {
  const [focused, setFocused] = useState(false);
  const count = Math.max(6, value.length);
  const cur = Math.min(value.length, count - 1);
  return (
    <div className="relative">
      <div className="flex gap-2" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span key={i}
            className={cn('grid h-[58px] w-14 min-w-0 flex-1 place-items-center rounded-xl font-tight text-[22px] font-semibold text-ink',
              focused && i === cur ? 'shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'shadow-[inset_0_0_0_1px_var(--color-line)]')}>
            {value[i] || ''}
          </span>
        ))}
      </div>
      <input
        {...props}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
}
