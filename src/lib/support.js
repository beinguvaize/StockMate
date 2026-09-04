/**
 * Where a stuck user reaches a human.
 *
 * Kept in one place so onboarding, error states and Settings can never drift
 * apart — a support number that is right on two screens out of three is worse
 * than no number at all.
 */

// Digits only, country code first. wa.me rejects '+', spaces and dashes.
export const SUPPORT_WHATSAPP = '19029191716';
export const SUPPORT_WHATSAPP_DISPLAY = '+1 902 919 1716';
export const SUPPORT_NAME = 'Uvaize';

/** Open a WhatsApp chat with support, optionally pre-filling the first message. */
export const supportWhatsAppLink = (message = '') =>
  `https://wa.me/${SUPPORT_WHATSAPP}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
