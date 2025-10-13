// utils/phone.js
// Normalizes phone into local 10-digit form (Nigeria-focused). Returns null if impossible.
function toLocal10(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw || '').trim();
  // remove non-digits and leading +
  s = s.replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);

  // remove leading country code 234 if present
  if (s.startsWith('234') && s.length > 3) s = s.slice(3);

  // drop leading 0 if present and 11 digits
  if (s.length === 11 && s.startsWith('0')) s = s.slice(1);

  // if exactly 10 digits return
  if (/^\d{10}$/.test(s)) return s;

  // fallback: return last 10 digits if >=10 digits
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);

  return null;
}

function maskLocalId(local10) {
  if (!local10) return '—';
  if (String(local10).length === 10) {
    // show first 3 and last 2: 806*****50
    return local10.slice(0,3) + '*****' + local10.slice(-2);
  }
  return local10;
}

module.exports = { toLocal10, maskLocalId };
