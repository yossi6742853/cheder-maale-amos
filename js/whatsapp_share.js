/**
 * whatsapp_share.js — open WhatsApp with a pre-filled message.
 *
 * Helpers:
 *   bhtShareToWhatsapp(phone, text)
 *   bhtShareMeetingSummary(meeting)   — formats and shares
 *
 * The phone is normalized: 05X… → 9725X…, +05X… → 9725X…
 */
(function () {
  'use strict';

  function normalizePhone(p) {
    if (!p) return '';
    let n = String(p).replace(/[^0-9+]/g, '');
    if (n.startsWith('+972')) n = n.slice(1);
    else if (n.startsWith('00972')) n = n.slice(2);
    else if (n.startsWith('0')) n = '972' + n.slice(1);
    return n;
  }

  window.bhtShareToWhatsapp = function (phone, text) {
    const num = normalizePhone(phone);
    const enc = encodeURIComponent(text || '');
    const url = num
      ? `https://wa.me/${num}?text=${enc}`
      : `https://wa.me/?text=${enc}`;
    window.open(url, '_blank', 'noopener');
  };

  window.bhtShareMeetingSummary = function (meeting) {
    if (!meeting) return;
    const date = new Date(meeting['תאריך'] || meeting.meeting_date || '').toLocaleDateString('he-IL');
    const subject = meeting['נושא'] || meeting.subject || 'אסיפה';
    const summary = (meeting['סיכום'] || meeting.notes || '').slice(0, 1500);
    const rabbi = meeting['רב'] || meeting.recorded_by || '';
    const lines = [
      'בס"ד',
      '',
      `סיכום אסיפה — ${subject}`,
      `תאריך: ${date}`,
      rabbi ? `מנחה: ${rabbi}` : '',
      '',
      summary,
      '',
      '',
      'בברכה,',
      'בית התלמוד מעלה עמוס',
    ].filter(Boolean);
    const text = lines.join('\n');
    // Resolve parent phone if a student is associated
    let phone = '';
    try {
      const sid = String(meeting['תלמיד_מזהה'] || meeting.student_id || '');
      if (sid && typeof api === 'function') {
        api('listStudents', []).then(r => {
          const s = (r.data || []).find(x => String(x['מזהה']) === sid);
          phone = s && (s['טלפון אב'] || s['טלפון אם']) || '';
          window.bhtShareToWhatsapp(phone, text);
        }).catch(() => window.bhtShareToWhatsapp('', text));
        return;
      }
    } catch (_) {}
    window.bhtShareToWhatsapp(phone, text);
  };
})();
