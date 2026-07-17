(function () {
  'use strict';

  function formatDuration(s, fallback = '') {
    if (!isFinite(s) || isNaN(s) || s === null || s === undefined) return fallback;
    s = Math.max(0, Math.floor(s));
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  window.formatDuration = formatDuration;
})();
