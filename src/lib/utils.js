import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn/ui convention — merge conditional class names, with tailwind-merge
// resolving conflicts (cn('px-4','px-2') -> 'px-2') so overrides always win.
export const cn = (...inputs) => twMerge(clsx(inputs));

// Generate a short human-readable reference id, e.g. "SAL-K7F2M".
// Combines timestamp base36 + 2 random chars -> unique per ms per tab, short.
export const generateRef = (prefix = 'REF') => {
  const rand = Math.random().toString(36).slice(2, 4);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}-${(time + rand).toUpperCase()}`;
};

export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const formatCurrency = (amount, currencySymbol = '₹') => {
  return `${currencySymbol}${parseFloat(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

// Tenant-configurable timezone/locale. TenantContext calls setAppTZ() after
// loading business_profile. Defaults to IST for India-first launch; any tenant
// in another country gets their own TZ applied automatically.
let _appTimezone = 'Asia/Kolkata';
let _appLocale = 'en-IN';

// ISO country code -> { tz, locale } mapping for common markets. Extend as
// tenants onboard new countries. Fallback: browser-resolved options.
// Keys support both ISO-2 codes and common display names. Normalised via
// resolveCountryTZ() which uppercases and strips spaces/punctuation.
const COUNTRY_TZ = {
  IN: { tz: 'Asia/Kolkata', locale: 'en-IN' },
  INDIA: { tz: 'Asia/Kolkata', locale: 'en-IN' },
  US: { tz: 'America/New_York', locale: 'en-US' },
  USA: { tz: 'America/New_York', locale: 'en-US' },
  UNITEDSTATES: { tz: 'America/New_York', locale: 'en-US' },
  GB: { tz: 'Europe/London', locale: 'en-GB' },
  UK: { tz: 'Europe/London', locale: 'en-GB' },
  UNITEDKINGDOM: { tz: 'Europe/London', locale: 'en-GB' },
  CA: { tz: 'America/Toronto', locale: 'en-CA' },
  CANADA: { tz: 'America/Toronto', locale: 'en-CA' },
  AU: { tz: 'Australia/Sydney', locale: 'en-AU' },
  AUSTRALIA: { tz: 'Australia/Sydney', locale: 'en-AU' },
  AE: { tz: 'Asia/Dubai', locale: 'en-AE' },
  UAE: { tz: 'Asia/Dubai', locale: 'en-AE' },
  UNITEDARABEMIRATES: { tz: 'Asia/Dubai', locale: 'en-AE' },
  SG: { tz: 'Asia/Singapore', locale: 'en-SG' },
  SINGAPORE: { tz: 'Asia/Singapore', locale: 'en-SG' },
  NZ: { tz: 'Pacific/Auckland', locale: 'en-NZ' },
  NEWZEALAND: { tz: 'Pacific/Auckland', locale: 'en-NZ' },
  ZA: { tz: 'Africa/Johannesburg', locale: 'en-ZA' },
  SOUTHAFRICA: { tz: 'Africa/Johannesburg', locale: 'en-ZA' },
  PH: { tz: 'Asia/Manila', locale: 'en-PH' },
  PHILIPPINES: { tz: 'Asia/Manila', locale: 'en-PH' },
  MY: { tz: 'Asia/Kuala_Lumpur', locale: 'en-MY' },
  MALAYSIA: { tz: 'Asia/Kuala_Lumpur', locale: 'en-MY' },
  BD: { tz: 'Asia/Dhaka', locale: 'en-BD' },
  BANGLADESH: { tz: 'Asia/Dhaka', locale: 'en-BD' },
  LK: { tz: 'Asia/Colombo', locale: 'en-LK' },
  SRILANKA: { tz: 'Asia/Colombo', locale: 'en-LK' },
  PK: { tz: 'Asia/Karachi', locale: 'en-PK' },
  PAKISTAN: { tz: 'Asia/Karachi', locale: 'en-PK' },
};

export const resolveCountryTZ = (country) => {
  if (!country) return null;
  const key = String(country).toUpperCase().replace(/[^A-Z]/g, '');
  return COUNTRY_TZ[key] || null;
};

export const setAppTZ = ({ timezone, locale, country } = {}) => {
  const fromCountry = resolveCountryTZ(country);
  _appTimezone = timezone || fromCountry?.tz || _appTimezone;
  _appLocale = locale || fromCountry?.locale || _appLocale;
};

export const getAppTimezone = () => _appTimezone;
export const getAppLocale = () => _appLocale;

// Back-compat exports. Prefer getAppTimezone()/getAppLocale() for live values.
export const APP_TIMEZONE = _appTimezone;
export const APP_LOCALE = _appLocale;

export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  // Plain YYYY-MM-DD: treat as wall-clock IST date (no TZ shift).
  const ymd = typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  if (ymd) {
    const [y, m, day] = dateString.split('-').map(Number);
    // Build UTC timestamp at IST midnight so rendering in IST gives same Y-M-D.
    const d = new Date(Date.UTC(y, m - 1, day));
    return d.toLocaleDateString(_appLocale, {
      year: 'numeric', month: 'short', day: 'numeric',
      timeZone: _appTimezone
    });
  }
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString(_appLocale, {
    year: 'numeric', month: 'short', day: 'numeric',
    timeZone: _appTimezone
  });
};

/**
 * Just the clock time, in the app's timezone.
 *
 * A bill carries invoice_date, which is date-only — the time it was rung up
 * lives in created_at. Documents that show only the date cannot distinguish two
 * bills to the same customer on the same day, which is exactly when a customer
 * queries one.
 *
 * Returns '' rather than 'N/A' for a missing or date-only value: a receipt
 * should print nothing there, not an apology.
 */
export const formatTime = (value) => {
  if (!value) return '';
  // A plain YYYY-MM-DD carries no time. Nothing to show, and parsing it would
  // invent midnight.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(_appLocale, {
    hour: 'numeric', minute: '2-digit',
    timeZone: _appTimezone,
  });
};

export const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString(_appLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: _appTimezone
  });
};

/**
 * Parse a YYYY-MM-DD date string as a LOCAL midnight Date (no UTC shift).
 * Safe to use for comparisons, aging calculations, sorting.
 * Falls back to full ISO parse for timestamp strings.
 */
export const parseLocalDate = (dateStr) => {
  if (!dateStr) return new Date(NaN);
  const ymd = typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr);
  if (ymd) {
    const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d); // local midnight, no UTC shift
  }
  return new Date(dateStr);
};

// YYYY-MM-DD string for today in IST (use for default form dates).
export const todayISOInAppTZ = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: _appTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
};
