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
