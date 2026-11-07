/**
 * SADIQ BOOK AGENCY — PAKISTANI PHONE NUMBER NORMALIZER & WHATSAPP URL HELPER
 *
 * Normalizes local and international variants of Pakistani mobile numbers to the
 * standard E.164 international format without plus prefix (required by WhatsApp wa.me).
 *
 * Examples:
 * - "0344-9633526"    -> "923449633526"
 * - "+92 342 5822259" -> "923425822259"
 * - "00923035822258"  -> "923035822258"
 * - "3459252409"      -> "923459252409"
 * - "923449633526"    -> "923449633526"
 */

export interface PhoneNormalizationResult {
  isValid: boolean;
  rawInput: string;
  normalizedNumber: string; // e.g. "923449633526"
  formattedDisplay: string; // e.g. "+92 344 9633526"
  error?: string;
}

/**
 * Normalizes and validates any Pakistani phone number string.
 */
export function normalizePakistaniPhone(phone?: string | null): PhoneNormalizationResult {
  const rawInput = (phone || '').trim();

  if (!rawInput) {
    return {
      isValid: false,
      rawInput: '',
      normalizedNumber: '',
      formattedDisplay: '',
      error: 'Phone number is required.',
    };
  }

  // Remove spaces, hyphens, periods, parentheses, and leading plus
  let cleaned = rawInput.replace(/[\s.\-()+]/g, '');

  // Strip international double-zero prefix if present (e.g. 0092 -> 92)
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }

  // If local Pakistani mobile format starting with 03 (11 digits: 03001234567)
  if (cleaned.startsWith('03') && cleaned.length === 11) {
    cleaned = '92' + cleaned.slice(1);
  }
  // If 10 digits without leading 0 (e.g. 3001234567)
  else if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '92' + cleaned;
  }

  // Valid Pakistani mobile numbers must now be exactly 12 digits, starting with 923
  // All Pakistani mobile networks (Jazz, Telenor, Zong, Ufone, Onic) use 03XX -> 923XX
  const isValid = /^923\d{9}$/.test(cleaned);

  if (!isValid) {
    let error = 'Invalid phone number format.';
    if (cleaned.length < 10) {
      error = 'Phone number is too short (e.g., 0344-9633526).';
    } else if (cleaned.length > 13) {
      error = 'Phone number contains too many digits.';
    } else if (!cleaned.startsWith('923')) {
      error = 'Must be a valid Pakistani mobile number starting with 03xx or +923xx.';
    }

    return {
      isValid: false,
      rawInput,
      normalizedNumber: cleaned,
      formattedDisplay: rawInput,
      error,
    };
  }

  // Nicely formatted display string: +92 3XX XXXXXXX
  const formattedDisplay = `+92 ${cleaned.slice(2, 5)} ${cleaned.slice(5)}`;

  return {
    isValid: true,
    rawInput,
    normalizedNumber: cleaned,
    formattedDisplay,
  };
}

/**
 * Returns true if the phone number is a valid Pakistani mobile number.
 */
export function validatePakistaniMobile(phone?: string | null): boolean {
  return normalizePakistaniPhone(phone).isValid;
}

/**
 * Returns a human-friendly formatted phone string.
 */
export function formatPakistaniPhoneForDisplay(phone?: string | null): string {
  return normalizePakistaniPhone(phone).formattedDisplay;
}

/**
 * Builds a direct wa.me WhatsApp URL with encoded message text.
 */
export function buildWhatsAppShareUrl(phone: string, messageText: string): { url: string; error?: string } {
  const norm = normalizePakistaniPhone(phone);
  if (!norm.isValid) {
    return { url: '', error: norm.error };
  }

  const encodedText = encodeURIComponent(messageText);
  return {
    url: `https://wa.me/${norm.normalizedNumber}?text=${encodedText}`,
  };
}
