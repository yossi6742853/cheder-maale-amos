// Validation utilities — Israeli ID checksum, phone, email

function validateIsraeliID(id) {
  if (!id) return { ok: true };  // empty allowed
  id = String(id).trim().replace(/\D/g, '');
  if (id.length === 0) return { ok: true };
  if (id.length < 5 || id.length > 9) {
    return { ok: false, error: 'ת.ז חייבת להכיל 5-9 ספרות' };
  }
  // Pad to 9 digits
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

function validateEmail(email) {
  if (!email) return { ok: true };
  const s = String(email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return { ok: false, error: 'כתובת מייל לא תקינה' };
  }
  return { ok: true };
}

function validateAge(age) {
  if (age === '' || age == null) return { ok: true };
  const n = Number(age);
  if (Number.isNaN(n) || n < 3 || n > 30) {
    return { ok: false, error: 'גיל צריך להיות בין 3 ל-30' };
  }
  return { ok: true };
}

function validateRequired(value, label) {
  if (!value || String(value).trim() === '') {
    return { ok: false, error: `${label} חובה` };
  }
  return { ok: true };
}

// Apply inline validation to a form field — sets bootstrap is-invalid class + tooltip
function bindFieldValidation(elementId, validator) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const showError = (msg) => {
    el.classList.add('is-invalid');
    let feedback = el.parentNode.querySelector('.invalid-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.className = 'invalid-feedback';
      el.parentNode.appendChild(feedback);
    }
    feedback.textContent = msg;
  };
  const clearError = () => {
    el.classList.remove('is-invalid');
    el.classList.add('is-valid');
    setTimeout(() => el.classList.remove('is-valid'), 1500);
  };
  el.addEventListener('blur', () => {
    const result = validator(el.value);
    if (!result.ok) showError(result.error);
    else if (el.value) clearError();
  });
  el.addEventListener('input', () => {
    if (el.classList.contains('is-invalid')) {
      const result = validator(el.value);
      if (result.ok) el.classList.remove('is-invalid');
    }
  });
}

// Validate a full student object — returns { ok, errors: [] }
function validateStudent(obj) {
  const errors = [];
  const required = [['שם פרטי', 'שם פרטי']];
  required.forEach(([field, label]) => {
    const r = validateRequired(obj[field], label);
    if (!r.ok) errors.push(r.error);
  });
  ['מספר זהות', 'תז אב', 'תז אם'].forEach(field => {
    const r = validateIsraeliID(obj[field]);
    if (!r.ok) errors.push(`${field}: ${r.error}`);
  });
  ['טלפון אם', 'טלפון אב', 'טלפון בית'].forEach(field => {
    const r = validatePhone(obj[field]);
    if (!r.ok) errors.push(`${field}: ${r.error}`);
  });
  const r = validateAge(obj['גיל']);
  if (!r.ok) errors.push(r.error);
  return { ok: errors.length === 0, errors };
}

window.validateIsraeliID = validateIsraeliID;
window.validatePhone = validatePhone;
window.validateEmail = validateEmail;
window.validateAge = validateAge;
window.validateStudent = validateStudent;
window.bindFieldValidation = bindFieldValidation;
