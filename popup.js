/**
 * Video Controller – popup.js
 *
 * Connects to the content scripts on the active tab and renders the list of
 * detected videos so the user can open the controller for a specific one.
 *
 * The content script runs in every frame; chrome.tabs.connect (no frameId)
 * opens a Port to all of them at once. Each frame reports its videos over
 * the port, aggregated here. Videos are addressed by a stable
 * (frameToken, id) pair instead of a positional index.
 */
(function () {
  'use strict';

  const list  = document.getElementById('video-list');
  const found = new Map(); /* "frameToken:id" -> video info */
  let port = null;

  document.getElementById('version').textContent =
    `v${chrome.runtime.getManifest().version}`;

  function formatDuration(s) {
    if (!s || !isFinite(s)) return '';
    s = Math.floor(s);
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }

  function showMessage(text) {
    while (list.firstChild) list.removeChild(list.firstChild);
    const p = document.createElement('p');
    p.id = 'no-videos';
    p.textContent = text;
    list.appendChild(p);
  }

  function createVideoCard(v, i) {
    const name  = v.title || v.src || `Video ${i + 1}`;
    const dur   = formatDuration(v.duration);
    const state = v.paused ? '⏸' : '▶';

    /* Build card with DOM APIs to avoid XSS from untrusted video metadata */
    const card = document.createElement('div');
    card.className = 'video-card';

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
    btn.textContent = 'Control';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openVideo(v);
    });

    /* Also allow clicking the card */
    card.addEventListener('click', () => openVideo(v));

    info.appendChild(nameEl);
    info.appendChild(metaEl);
    card.appendChild(thumb);
    card.appendChild(info);
    card.appendChild(btn);
    return card;
  }

  function renderVideos() {
    const videos = [...found.values()];
    while (list.firstChild) list.removeChild(list.firstChild);

    if (videos.length === 0) {
      showMessage('No videos found on this page. Navigate to a page with a <video> element.');
      return;
    }

    videos.forEach((v, i) => {
      list.appendChild(createVideoCard(v, i));
    });
  }

  function openVideo(v) {
    if (!port) return;
    port.postMessage({ type: 'OPEN_VIDEO', frameToken: v.frameToken, id: v.id });
    /* give the port a moment to flush before the popup context dies */
    setTimeout(() => window.close(), 80);
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      showMessage('No videos found on this page.');
      return;
    }

    port = chrome.tabs.connect(tabs[0].id, { name: 'vc-popup' });

    port.onMessage.addListener((msg) => {
      if (msg.type !== 'VIDEOS') return;
      msg.videos.forEach((v) => found.set(`${v.frameToken}:${v.id}`, v));
      renderVideos();
    });

    /* Fires immediately when no content script is listening in the tab */
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      if (found.size === 0) {
        showMessage(
          `Could not connect to the page. Try refreshing the tab. (${err ? err.message : 'disconnected'})`
        );
      }
    });

    /* Give frames a moment to report before declaring none found */
    setTimeout(() => {
      if (found.size === 0 && list.querySelector('.spinner')) renderVideos();
    }, 400);
  });
})();
