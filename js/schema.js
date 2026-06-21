// schema.js — Central schema for all Google Sheets sync configs
// Single source of truth for tab names, fields, validation rules.
// Per Gemini/Architect refactor directive (2026-05-27).
(function () {
  'use strict';

  /**
   * Field types and validators
   */
  const Field = {
    TEXT: 'text',
    NUMBER: 'number',
    DATE: 'date',
    DATETIME: 'datetime',
    EMAIL: 'email',
    PHONE: 'phone',
    TZ: 'tz',           // Israeli ID
    SELECT: 'select',
    TEXTAREA: 'textarea',
    JSON: 'json',
  };

  /**
   * Centralized schema definition.
   * Each tab has: name (sheet tab), key (match key), fields[].
   * fields[i] = { name, type, label, required, options?, validate? }
   */
  const SCHEMAS = {
    students: {
      tab: 'תלמידים',
      key: 'מזהה',
      label: 'תלמידים',
      icon: 'bi-people',
      fields: [
        { name: 'מזהה',        type: Field.NUMBER,   label: 'מזהה',         required: true, primary: true },
        { name: 'שם פרטי',     type: Field.TEXT,     label: 'שם פרטי',      required: true },
        { name: 'שם משפחה',    type: Field.TEXT,     label: 'שם משפחה',     required: true },
        { name: 'מחזור',       type: Field.SELECT,   label: 'שיעור',        options: ['א', 'ב 1', 'ב 2', 'ג'] },
        { name: 'תז',          type: Field.TZ,       label: 'ת.ז.' },
        { name: 'גיל',         type: Field.NUMBER,   label: 'גיל' },
        { name: 'שם אב',       type: Field.TEXT,     label: 'שם אב' },
        { name: 'שם אם',       type: Field.TEXT,     label: 'שם אם' },
        { name: 'טלפון אב',    type: Field.PHONE,    label: 'טלפון אב' },
        { name: 'טלפון אם',    type: Field.PHONE,    label: 'טלפון אם' },
        { name: 'טלפון בית',   type: Field.PHONE,    label: 'טלפון בית' },
        { name: 'כתובת',       type: Field.TEXT,     label: 'כתובת' },
        { name: 'עיר',         type: Field.TEXT,     label: 'עיר' },
        { name: 'תאריך לידה',  type: Field.DATE,     label: 'תאריך לידה' },
        { name: 'אלרגיה',      type: Field.TEXT,     label: 'אלרגיות' },
        { name: 'הערות רפואיות', type: Field.TEXTAREA, label: 'הערות רפואיות' },
        { name: 'סטטוס',       type: Field.SELECT,   label: 'סטטוס', options: ['פעיל', 'סיים', 'מושעה'], default: 'פעיל' },
        { name: 'דוח_אישי',    type: Field.TEXTAREA, label: 'דוח אישי + TLA data', secret: false },
        { name: 'פרופיל_אישיות',  type: Field.TEXTAREA, label: 'פרופיל אישיות' },
        { name: 'פרופיל_לימודי',  type: Field.TEXTAREA, label: 'פרופיל לימודי' },
        { name: 'פרופיל_הורים',   type: Field.TEXTAREA, label: 'פרופיל הורים' },
        { name: 'פרופיל_התנהגותי',type: Field.TEXTAREA, label: 'פרופיל התנהגותי' },
      ],
    },

    behavior: {
      tab: 'מעקב_התנהגות',
      key: 'מזהה',
      label: 'מעקב התנהגות',
      icon: 'bi-clipboard-check',
      fields: [
        { name: 'מזהה',         type: Field.NUMBER, primary: true },
        { name: 'תלמיד_מזהה',   type: Field.NUMBER, required: true },
        { name: 'שם תלמיד',     type: Field.TEXT },
        { name: 'תאריך',        type: Field.DATETIME, required: true },
        { name: 'תאריך_עברי',   type: Field.TEXT },
        { name: 'פרשה',         type: Field.TEXT },
        { name: 'שיעור',        type: Field.TEXT },
        { name: 'קטגוריה',      type: Field.TEXT, required: true },
        { name: 'תיאור',        type: Field.TEXTAREA, required: true },
        { name: 'פירוט',        type: Field.TEXTAREA },
        { name: 'הערות',        type: Field.TEXTAREA },
        { name: 'חומרה',        type: Field.SELECT, options: ['נמוכה', 'בינונית', 'גבוהה'], default: 'בינונית' },
        { name: 'דווח_עי',      type: Field.TEXT, label: 'דווח ע"י' },
        { name: 'רב',           type: Field.TEXT },
        { name: 'סטטוס_אישור',  type: Field.TEXT },
        { name: 'מקור',         type: Field.TEXT },
      ],
    },

    users: {
      tab: 'משתמשים',
      key: 'שם משתמש',
      label: 'משתמשים',
      icon: 'bi-person-badge',
      fields: [
        { name: 'שם משתמש',     type: Field.TEXT, required: true, primary: true },
        { name: 'שם מלא',       type: Field.TEXT },
        { name: 'סיסמה',        type: Field.TEXT, secret: true },
        { name: 'תפקיד',        type: Field.SELECT, options: ['מנהל', 'צוות', 'הורה'] },
        { name: 'הרשאות',       type: Field.TEXT },
        { name: 'מספר_עובד',    type: Field.NUMBER },
        { name: 'אימייל',       type: Field.EMAIL },
        { name: 'טלפון',        type: Field.PHONE },
        { name: 'תז',           type: Field.TZ },
        { name: 'כתובת',        type: Field.TEXT },
        { name: 'תאריך_לידה',   type: Field.DATE },
        { name: 'בנק',          type: Field.NUMBER },
        { name: 'סניף',         type: Field.NUMBER },
        { name: 'חשבון',        type: Field.TEXT },
      ],
    },

    classes: {
      tab: 'כיתות',
      key: 'שם',
      label: 'שיעורים',
      icon: 'bi-collection',
      fields: [
        { name: 'שם',          type: Field.TEXT, required: true, primary: true },
        { name: 'סדר',         type: Field.NUMBER },
        { name: 'רב_בוקר',     type: Field.TEXT },
        { name: 'רב_אחהצ',     type: Field.TEXT, label: 'רב אחה"צ' },
      ],
    },

    conversations: {
      tab: 'שיחות',
      key: 'מזהה',
      label: 'שיחות',
      icon: 'bi-chat-dots',
      fields: [
        { name: 'מזהה',         type: Field.NUMBER, primary: true },
        { name: 'תלמיד_מזהה',   type: Field.NUMBER, required: true },
        { name: 'שם תלמיד',     type: Field.TEXT },
        { name: 'תאריך',        type: Field.DATETIME, required: true },
        { name: 'תאריך_עברי',   type: Field.TEXT },
        { name: 'פרשה',         type: Field.TEXT },
        { name: 'רב',           type: Field.TEXT },
        { name: 'קטגוריה',      type: Field.SELECT, options: ['דיבור עם הורים', 'אסיפת הורים', 'שיחת חינוך', 'אחר'] },
        { name: 'נושא',         type: Field.TEXT },
        { name: 'תוכן',         type: Field.TEXTAREA },
        { name: 'הערות',        type: Field.TEXTAREA },
        { name: 'אירוע_מקושר',  type: Field.TEXT },
      ],
    },

    categories: {
      tab: 'קטגוריות',
      key: 'קטגוריה',
      label: 'קטגוריות',
      icon: 'bi-tags',
      fields: [
        { name: 'קטגוריה', type: Field.TEXT, required: true, primary: true },
        { name: 'תיאור',   type: Field.TEXT },
      ],
    },
  };

  /**
   * Validation rules — per field type
   */
  const VALIDATORS = {
    [Field.PHONE]: (v) => !v || /^(\+972|972|0)?[2-9]\d{7,8}$/.test(v.replace(/[-\s]/g, '')),
    [Field.EMAIL]: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    [Field.TZ]: (v) => !v || /^\d{8,9}$/.test(v.replace(/[-\s]/g, '')),
    [Field.NUMBER]: (v) => v == null || v === '' || !isNaN(parseFloat(v)),
    [Field.DATE]: (v) => !v || !isNaN(new Date(v).getTime()),
    [Field.JSON]: (v) => {
      if (!v) return true;
      try { JSON.parse(v); return true; } catch { return false; }
    },
  };

  function validateRecord(schemaKey, record) {
    const s = SCHEMAS[schemaKey];
    if (!s) return { valid: false, errors: { _: 'unknown schema: ' + schemaKey } };
    const errors = {};
    for (const f of s.fields) {
      const val = record[f.name];
      if (f.required && (val == null || val === '')) {
        errors[f.name] = `שדה חובה: ${f.label || f.name}`;
        continue;
      }
      const validator = VALIDATORS[f.type];
      if (validator && !validator(val)) {
        errors[f.name] = `ערך לא תקין: ${f.label || f.name}`;
      }
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  // Expose globally
  window.BHT_SCHEMA = {
    Field,
    SCHEMAS,
    VALIDATORS,
    validateRecord,
    getSchema: (key) => SCHEMAS[key],
    getTabName: (key) => SCHEMAS[key]?.tab,
    getFields: (key) => SCHEMAS[key]?.fields || [],
    getRequiredFields: (key) => (SCHEMAS[key]?.fields || []).filter(f => f.required).map(f => f.name),
    getAllSchemaKeys: () => Object.keys(SCHEMAS),
  };

  console.warn('%c📋 schema.js — Central schema loaded (6 schemas, types + validators)', 'color:#1e3a8a;font-weight:bold');
})();
