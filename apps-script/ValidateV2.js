/**
 * apps-script-v2-validate.gs — Server-side validation mirror of js/validate.js
 * Cheder-BHT Production - 2026-05-27
 *
 * MIRRORS the client-side validate.js so that:
 *   1. Bad data can't bypass client validation by direct API call
 *   2. Single source of truth for validation rules
 *
 * USAGE in routeRequest_v2 (mutations):
 *   const validation = validateRecord(action, params);
 *   if (!validation.valid) return error(validation.errors);
 */

/**
 * Israeli ID checksum validation (Luhn-like algorithm).
 * Mirrors js/validate.js validateIsraeliID().
 */
function validateIsraeliID(id) {
  if (!id) return { ok: true };
  id = String(id).trim().replace(/\D/g, '');
  if (id.length === 0) return { ok: true };
  if (id.length < 5 || id.length > 9) {
    return { ok: false, error: 'ת.ז חייבת 5-9 ספרות' };
  }
  id = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(id[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  if (sum % 10 !== 0) {
    return { ok: false, error: 'ת.ז לא חוקית (checksum)' };
  }
  return { ok: true };
}

/**
 * Phone validation (Israeli + international).
 */
function validatePhone(phone) {
  if (!phone) return { ok: true };
  const s = String(phone).replace(/[\s\-]/g, '');
  if (!/^[\d+]+$/.test(s)) {
    return { ok: false, error: 'טלפון חייב להכיל רק ספרות, רווחים ומקפים' };
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 13) {
    return { ok: false, error: 'טלפון חייב 7-13 ספרות' };
  }
  return { ok: true };
}

/**
 * Email validation.
 */
function validateEmail(email) {
  if (!email) return { ok: true };
  const s = String(email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return { ok: false, error: 'מייל לא תקין' };
  }
  return { ok: true };
}

/**
 * Age validation.
 */
function validateAge(age) {
  if (age === '' || age == null) return { ok: true };
  const n = Number(age);
  if (isNaN(n) || n < 3 || n > 30) {
    return { ok: false, error: 'גיל 3-30' };
  }
  return { ok: true };
}

/**
 * Required field validator.
 */
function validateRequired(value, label) {
  if (!value || String(value).trim() === '') {
    return { ok: false, error: `${label || 'שדה'} חובה` };
  }
  return { ok: true };
}

/**
 * Validate full record by action type.
 * @param {string} action - e.g. 'addStudent', 'addBehavior'
 * @param {Object} params - record fields
 * @returns {{valid: boolean, errors: Object<field, error>}}
 */
function validateBackendRecord(action, params) {
  const errors = {};
  const a = (action || '').toLowerCase();

  if (a.includes('student')) {
    // Required fields
    const fname = validateRequired(params['שם פרטי'], 'שם פרטי');
    if (!fname.ok) errors['שם פרטי'] = fname.error;
    const lname = validateRequired(params['שם משפחה'], 'שם משפחה');
    if (!lname.ok) errors['שם משפחה'] = lname.error;
    // Optional but validated if present
    const tz = validateIsraeliID(params['תז'] || params['מספר זהות']);
    if (!tz.ok) errors['תז'] = tz.error;
    const phMother = validatePhone(params['טלפון אם']);
    if (!phMother.ok) errors['טלפון אם'] = phMother.error;
    const phFather = validatePhone(params['טלפון אב']);
    if (!phFather.ok) errors['טלפון אב'] = phFather.error;
    const age = validateAge(params['גיל']);
    if (!age.ok) errors['גיל'] = age.error;
  } else if (a.includes('behavior')) {
    const sid = validateRequired(params['תלמיד_מזהה'], 'תלמיד');
    if (!sid.ok) errors['תלמיד_מזהה'] = sid.error;
    const cat = validateRequired(params['קטגוריה'], 'קטגוריה');
    if (!cat.ok) errors['קטגוריה'] = cat.error;
    const desc = validateRequired(params['תיאור'], 'תיאור');
    if (!desc.ok) errors['תיאור'] = desc.error;
  } else if (a.includes('user') || a.includes('staff')) {
    const u = validateRequired(params['שם משתמש'], 'שם משתמש');
    if (!u.ok) errors['שם משתמש'] = u.error;
    const email = validateEmail(params['אימייל']);
    if (!email.ok) errors['אימייל'] = email.error;
    const phone = validatePhone(params['טלפון']);
    if (!phone.ok) errors['טלפון'] = phone.error;
    const tz = validateIsraeliID(params['תז']);
    if (!tz.ok) errors['תז'] = tz.error;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Wrap a handler with validation enforcement.
 * Returns 422 JSON if validation fails.
 *
 * USAGE in router:
 *   if (a === 'addStudent') {
 *     const v = enforceValidation(action, params);
 *     if (v) return v;  // returns error response
 *     // proceed with actual handler
 *   }
 */
function enforceValidation(action, params) {
  const r = validateBackendRecord(action, params);
  if (!r.valid) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: r.errors,
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return null;  // passes
}
