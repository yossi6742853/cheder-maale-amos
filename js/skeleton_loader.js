/**
 * skeleton_loader.js — helpers for showing loading placeholders.
 *
 * Usage:
 *   bhtSkeleton('selector', 6);   // 6 ghost rows in target
 *   bhtSkeletonCard('selector');  // card-sized ghost
 */
(function () {
  'use strict';
  window.bhtSkeleton = function (target, count, size) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    const cls = size === 'lg' ? 'bht-sk-row lg' : size === 'sm' ? 'bht-sk-row sm' : 'bht-sk-row';
    el.innerHTML = Array.from({ length: count || 6 }).map(() => `<div class="${cls}"></div>`).join('');
  };
  window.bhtSkeletonCard = function (target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.innerHTML = `
      <div style="padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
        <div class="bht-sk-row lg" style="width:60%"></div>
        <div class="bht-sk-row" style="width:40%"></div>
        <div class="bht-sk-row" style="width:75%"></div>
      </div>`;
  };
})();
