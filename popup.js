/**
 * Video Controller – popup.js
 *
 * Queries the content script for detected videos on the active tab and
 * renders a list so the user can open the controller for a specific video.
 */
(function () {
  'use strict';

  const list = document.getElementById('video-list');

  function formatDuration(s) {
    if (!s || !isFinite(s)) return '';
    s = Math.floor(s);
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }

  function renderVideos(videos) {
    /* Clear existing content */
    while (list.firstChild) list.removeChild(list.firstChild);

    if (!videos || videos.length === 0) {
      const p = document.createElement('p');
      p.id = 'no-videos';
      p.textContent = 'No videos found on this page.';
      const br = document.createElement('br');
      p.appendChild(br);
      p.appendChild(document.createTextNode('Navigate to a page with a <video> element.'));
      list.appendChild(p);
      return;
    }

    videos.forEach((v) => {
      const name  = v.title || v.src || `Video ${v.index + 1}`;
      const dur   = formatDuration(v.duration);
      const state = v.paused ? '⏸' : '▶';

      /* Build card with DOM APIs to avoid XSS from untrusted video metadata */
      const card = document.createElement('div');
      card.className = 'video-card';
      card.dataset.index = v.index;

      const thumb = document.createElement('span');
      thumb.className = 'vc-thumb';
      thumb.textContent = state;

      const info = document.createElement('div');
      info.className = 'vc-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'vc-name';
      nameEl.title = name;
      nameEl.textContent = name; /* textContent is XSS-safe */

      const metaEl = document.createElement('div');
      metaEl.className = 'vc-meta';
      metaEl.textContent = dur ? `Duration: ${dur}` : 'Duration unknown';

      const btn = document.createElement('button');
      btn.className = 'vc-open-btn';
      btn.dataset.index = v.index;
      btn.textContent = 'Control';

      info.appendChild(nameEl);
      info.appendChild(metaEl);
      card.appendChild(thumb);
      card.appendChild(info);
      card.appendChild(btn);
      list.appendChild(card);
    });

    /* Wire up "Control" buttons */
    list.querySelectorAll('.vc-open-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openVideo(parseInt(btn.dataset.index, 10));
      });
    });

    /* Also allow clicking the card */
    list.querySelectorAll('.video-card').forEach((card) => {
      card.addEventListener('click', () => {
        openVideo(parseInt(card.dataset.index, 10));
      });
    });
  }

  function openVideo(index) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_VIDEO', index }, () => {
        window.close(); /* close the popup after activating */
      });
    });
  }

  /* Query the active tab for videos */
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      renderVideos([]);
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_VIDEOS' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        while (list.firstChild) list.removeChild(list.firstChild);
        const p = document.createElement('p');
        p.id = 'no-videos';
        p.textContent = 'Could not connect to the page. Try refreshing the tab.';
        list.appendChild(p);
        return;
      }
      renderVideos(response.videos || []);
    });
  });
})();
