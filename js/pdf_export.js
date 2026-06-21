/**
 * pdf_export.js — adds a small "PDF" button to the student card and
 * triggers the browser's native Save-as-PDF flow.
 *
 * Browser print + the print stylesheet in main.css produce a clean
 * student summary without needing a PDF library.
 */
(function () {
  'use strict';

  function addButton() {
    const card = document.getElementById('page-student-card') ||
                 document.querySelector('[id^="student-card"]');
    if (!card) return;
    if (card.querySelector('.bht-pdf-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-outline-secondary bht-pdf-btn';
    btn.innerHTML = '<i class="bi bi-file-pdf"></i> PDF';
    btn.title = 'הדפס/שמור כ-PDF (Ctrl+P)';
    btn.onclick = () => window.print();
    btn.style.cssText = 'margin-right:6px';
    // Try to find a header to attach to
    const target = card.querySelector('h3') || card.querySelector('h2') || card.firstElementChild;
    if (target && target.parentElement) target.parentElement.appendChild(btn);
    else card.insertBefore(btn, card.firstChild);
  }

  function maybeAdd() {
    if (location.hash.startsWith('#student-card')) {
      setTimeout(addButton, 600);
    }
  }
  window.addEventListener('hashchange', maybeAdd);
  document.addEventListener('DOMContentLoaded', () => setTimeout(maybeAdd, 1500));

  // Global Ctrl+Shift+P quick-print bind
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      window.print();
    }
  });
})();
