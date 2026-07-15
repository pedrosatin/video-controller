/**
 * Video Controller – content.js
 *
 * Injects a hover-activated indicator on every <video> element on the page.
 * Clicking the indicator opens a draggable floating mini-player that exposes
 * all HTMLVideoElement controls, including speed and seeking, bypassing
 * per-instance property overrides that player libraries may set.
 */
(function () {
  'use strict';

  /* Guard against double-injection (e.g., in iframes) */
  if (window.__vcLoaded) return;
  window.__vcLoaded = true;

  // ══════════════════════════════════════════════════════════════════════════
  // NATIVE PROPERTY ACCESSORS
  //
  // Grabbing the original get/set from HTMLMediaElement.prototype lets us
  // bypass per-instance overrides that some players set via
  // Object.defineProperty(videoElement, 'playbackRate', { set: locked }).
  // ══════════════════════════════════════════════════════════════════════════
  const _proto = HTMLMediaElement.prototype;
  const _desc  = (prop) => Object.getOwnPropertyDescriptor(_proto, prop) || {};
  const _rawSet = (prop) => _desc(prop).set;
  const _rawGet = (prop) => _desc(prop).get;

  function _set(video, prop, value) {
    const setter = _rawSet(prop);
    try {
      if (setter) setter.call(video, value);
      else video[prop] = value;
    } catch (_e) { /* silently ignore; the native API should always work */ }
  }

  function _get(video, prop) {
    const getter = _rawGet(prop);
    try {
      return getter ? getter.call(video) : video[prop];
    } catch (_e) {
      return video[prop];
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════
  const SEEK_SMALL   = 5;
  const SEEK_LARGE   = 10;
  const SPEED_FINE   = 0.1;
  const SPEED_COARSE = 0.25;
  const MIN_RATE     = 0.1;
  /* 16× is the de-facto upper limit for HTMLMediaElement.playbackRate across
     browsers (Chrome supports up to 16, Firefox up to 20). Values above that
     are clamped silently by the engine anyway. */
  const MAX_RATE     = 16;

  const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];

  // ══════════════════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════════════════
  let activeVideo          = null;
  let videoEventListeners  = [];
  let rafId                = null;
  let hoveredVideo         = null;
  let dragState            = null;
  let indicatorHideTimer   = null;

  const knownVideos = new Set();

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  function formatTime(s) {
    if (!isFinite(s) || isNaN(s)) return '–:––';
    s = Math.max(0, Math.floor(s));
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function roundRate(r) { return Math.round(r * 100) / 100; }

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO ACTIONS  (all go through native prototype accessors)
  // ══════════════════════════════════════════════════════════════════════════
  function seek(delta) {
    if (!activeVideo) return;
    const dur = _get(activeVideo, 'duration') || 0;
    const cur = _get(activeVideo, 'currentTime') || 0;
    _set(activeVideo, 'currentTime', clamp(cur + delta, 0, dur));
  }

  function seekTo(fraction) {
    if (!activeVideo) return;
    const dur = _get(activeVideo, 'duration') || 0;
    _set(activeVideo, 'currentTime', clamp(fraction * dur, 0, dur));
  }

  function changeSpeed(delta) {
    if (!activeVideo) return;
    const cur  = _get(activeVideo, 'playbackRate') || 1;
    const next = roundRate(clamp(cur + delta, MIN_RATE, MAX_RATE));
    _set(activeVideo, 'playbackRate', next);
  }

  function setSpeed(rate) {
    if (!activeVideo) return;
    _set(activeVideo, 'playbackRate', clamp(roundRate(rate), MIN_RATE, MAX_RATE));
  }

  function togglePlay() {
    if (!activeVideo) return;
    if (_get(activeVideo, 'paused')) activeVideo.play().catch(() => {});
    else activeVideo.pause();
  }

  function setVolume(v) {
    if (!activeVideo) return;
    _set(activeVideo, 'volume', clamp(v, 0, 1));
    if (v > 0) _set(activeVideo, 'muted', false);
  }

  function toggleMute() {
    if (!activeVideo) return;
    _set(activeVideo, 'muted', !_get(activeVideo, 'muted'));
  }

  function toggleFullscreen() {
    if (!activeVideo) return;
    /* Try the closest player container first, then the video itself */
    const container =
      activeVideo.closest('[class*="player"]') ||
      activeVideo.closest('[class*="Player"]') ||
      activeVideo.parentElement;
    if (!document.fullscreenElement) {
      (container || activeVideo)
        .requestFullscreen()
        .catch(() => activeVideo.requestFullscreen().catch(() => {}));
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function togglePiP() {
    if (!activeVideo) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else {
      activeVideo.requestPictureInPicture().catch(() => {});
    }
  }

  function toggleLoop() {
    if (!activeVideo) return;
    _set(activeVideo, 'loop', !_get(activeVideo, 'loop'));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUILD THE PANEL DOM
  // ══════════════════════════════════════════════════════════════════════════
  const panel = document.createElement('div');
  panel.id = 'vc-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Video Controller');

  panel.innerHTML = `
    <div id="vc-header">
      <span id="vc-title">🎬 Video Controller</span>
      <div id="vc-header-btns">
        <button id="vc-pin-btn"   class="vc-icon-btn" title="Pin / unpin panel">📌</button>
        <button id="vc-close-btn" class="vc-icon-btn" title="Close panel">✕</button>
      </div>
    </div>
    <div id="vc-body">

      <!-- Video selector (visible only when multiple videos exist) -->
      <div id="vc-selector-row" class="vc-row" style="display:none">
        <label class="vc-label" for="vc-video-sel">Video</label>
        <select id="vc-video-sel"></select>
      </div>

      <!-- Time / speed info bar -->
      <div id="vc-info-row" class="vc-row">
        <span id="vc-time-display">–:–– / –:––</span>
        <span id="vc-speed-badge" title="Current playback speed">1.00×</span>
      </div>

      <!-- Seek / progress bar -->
      <div id="vc-progress-wrap">
        <input type="range" id="vc-progress" min="0" max="1000" value="0" step="1"
               title="Seek — drag to jump">
      </div>

      <!-- Playback controls -->
      <div class="vc-row vc-center">
        <button class="vc-btn" id="vc-back-large" title="Back ${SEEK_LARGE} s">−${SEEK_LARGE}s</button>
        <button class="vc-btn" id="vc-back-small" title="Back ${SEEK_SMALL} s">−${SEEK_SMALL}s</button>
        <button class="vc-btn vc-btn-main" id="vc-play-pause" title="Play / Pause (Space)">▶</button>
        <button class="vc-btn" id="vc-fwd-small"  title="Forward ${SEEK_SMALL} s">+${SEEK_SMALL}s</button>
        <button class="vc-btn" id="vc-fwd-large"  title="Forward ${SEEK_LARGE} s">+${SEEK_LARGE}s</button>
      </div>

      <!-- Speed fine-tune -->
      <div class="vc-row vc-center">
        <span class="vc-label">Speed</span>
        <button class="vc-btn" id="vc-spd-m-c" title="−${SPEED_COARSE}×">−0.25</button>
        <button class="vc-btn" id="vc-spd-m-f" title="−${SPEED_FINE}×">−0.1</button>
        <button class="vc-btn" id="vc-spd-rst" title="Reset to 1×">1×</button>
        <button class="vc-btn" id="vc-spd-p-f" title="+${SPEED_FINE}×">+0.1</button>
        <button class="vc-btn" id="vc-spd-p-c" title="+${SPEED_COARSE}×">+0.25</button>
      </div>

      <!-- Speed presets -->
      <div class="vc-row vc-wrap" id="vc-presets-row">
        ${SPEED_PRESETS.map((s) =>
          `<button class="vc-btn vc-preset-btn" data-speed="${s}" title="${s}×">${s}×</button>`
        ).join('')}
      </div>

      <!-- Volume -->
      <div class="vc-row vc-center">
        <button class="vc-btn vc-icon-btn" id="vc-mute-btn" title="Mute / Unmute (M)">🔊</button>
        <input type="range" id="vc-vol-slider" min="0" max="1" value="1" step="0.02"
               title="Volume">
        <span id="vc-vol-display">100%</span>
      </div>

      <!-- Extra controls -->
      <div class="vc-row vc-center">
        <button class="vc-btn" id="vc-fullscreen-btn" title="Toggle Fullscreen (F)">⛶ Full</button>
        <button class="vc-btn" id="vc-pip-btn"        title="Picture in Picture (P)">⧉ PiP</button>
        <button class="vc-btn" id="vc-loop-btn"       title="Toggle Loop (L)">↺ Loop</button>
      </div>

    </div>
  `;

  panel.style.display = 'none';
  document.body.appendChild(panel);

  /* Hover indicator – a small button that appears over a hovered <video> */
  const indicator = document.createElement('div');
  indicator.id    = 'vc-indicator';
  indicator.title = 'Open Video Controller';
  indicator.textContent = '🎬';
  indicator.style.display = 'none';
  document.body.appendChild(indicator);

  // ══════════════════════════════════════════════════════════════════════════
  // PANEL DOM SHORTCUTS
  // ══════════════════════════════════════════════════════════════════════════
  const q = (sel) => panel.querySelector(sel);

  const closeBtn    = q('#vc-close-btn');
  const pinBtn      = q('#vc-pin-btn');
  const playBtn     = q('#vc-play-pause');
  const progressBar = q('#vc-progress');
  const timeDisp    = q('#vc-time-display');
  const speedBadge  = q('#vc-speed-badge');
  const muteBtn     = q('#vc-mute-btn');
  const volSlider   = q('#vc-vol-slider');
  const volDisp     = q('#vc-vol-display');
  const loopBtn     = q('#vc-loop-btn');
  const selectorRow = q('#vc-selector-row');
  const videoSel    = q('#vc-video-sel');

  // ══════════════════════════════════════════════════════════════════════════
  // UI UPDATE FUNCTIONS
  // ══════════════════════════════════════════════════════════════════════════
  function updatePlayBtn() {
    if (!activeVideo) return;
    const paused = _get(activeVideo, 'paused');
    playBtn.textContent = paused ? '▶' : '⏸';
    playBtn.title       = paused ? 'Play (Space)' : 'Pause (Space)';
  }

  function updateProgress() {
    if (!activeVideo) return;
    const cur = _get(activeVideo, 'currentTime') || 0;
    const dur = _get(activeVideo, 'duration')    || 0;
    if (dur > 0 && isFinite(dur)) {
      progressBar.value = (cur / dur) * 1000;
    }
    timeDisp.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  }

  function updateSpeedUI() {
    if (!activeVideo) return;
    const r = _get(activeVideo, 'playbackRate') || 1;
    speedBadge.textContent = `${r.toFixed(2)}×`;
    q('#vc-presets-row').querySelectorAll('.vc-preset-btn').forEach((btn) => {
      btn.classList.toggle('vc-preset-active', parseFloat(btn.dataset.speed) === r);
    });
  }

  function updateVolumeUI() {
    if (!activeVideo) return;
    const muted = _get(activeVideo, 'muted');
    const vol   = _get(activeVideo, 'volume') ?? 1;
    const eff   = muted ? 0 : vol;
    muteBtn.textContent  = eff === 0 ? '🔇' : eff < 0.5 ? '🔉' : '🔊';
    volSlider.value      = eff;
    volDisp.textContent  = `${Math.round(eff * 100)}%`;
  }

  function updateLoopBtn() {
    if (!activeVideo) return;
    const looping = _get(activeVideo, 'loop');
    loopBtn.classList.toggle('vc-btn-active', looping);
    loopBtn.title = `Loop: ${looping ? 'ON' : 'OFF'} (L)`;
  }

  function updateFullscreenBtn() {
    const fsBtn = q('#vc-fullscreen-btn');
    const inFs  = !!document.fullscreenElement;
    fsBtn.textContent = inFs ? '⊡ Exit FS' : '⛶ Full';
    fsBtn.title       = `${inFs ? 'Exit' : 'Toggle'} Fullscreen (F)`;
  }

  function updatePipBtn() {
    const pipBtn = q('#vc-pip-btn');
    const inPip  = document.pictureInPictureElement === activeVideo;
    pipBtn.classList.toggle('vc-btn-active', inPip);
    pipBtn.title = `${inPip ? 'Exit' : 'Enter'} Picture in Picture (P)`;
  }

  function syncAll() {
    updatePlayBtn();
    updateProgress();
    updateSpeedUI();
    updateVolumeUI();
    updateLoopBtn();
    updateFullscreenBtn();
    updatePipBtn();
  }

  /* rAF-based polling so the progress bar stays smooth even for live streams */
  function startPolling() {
    stopPolling();
    const tick = () => { updateProgress(); rafId = requestAnimationFrame(tick); };
    rafId = requestAnimationFrame(tick);
  }

  function stopPolling() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO SELECTOR
  // ══════════════════════════════════════════════════════════════════════════
  function refreshVideoSelector() {
    const videos = [...knownVideos].filter((v) => v.isConnected);
    if (videos.length <= 1) {
      selectorRow.style.display = 'none';
      return;
    }
    selectorRow.style.display = 'flex';
    /* Build <option> elements with DOM APIs to avoid XSS via untrusted
       video metadata (title, aria-label, currentSrc). */
    while (videoSel.firstChild) videoSel.removeChild(videoSel.firstChild);
    videos.forEach((v, i) => {
      const rawLabel =
        v.title ||
        v.getAttribute('aria-label') ||
        (v.currentSrc || '').split('/').pop().split('?')[0] ||
        `Video ${i + 1}`;
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = rawLabel.slice(0, 40); /* textContent is XSS-safe */
      videoSel.appendChild(opt);
    });
    const idx = videos.indexOf(activeVideo);
    videoSel.value = idx >= 0 ? idx : 0;
  }

  videoSel.addEventListener('change', () => {
    const videos = [...knownVideos].filter((v) => v.isConnected);
    const v = videos[parseInt(videoSel.value, 10)];
    if (v) attachVideo(v);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ATTACH / DETACH A VIDEO
  // ══════════════════════════════════════════════════════════════════════════
  function detachListeners() {
    if (!activeVideo) return;
    for (const [type, fn] of videoEventListeners) {
      activeVideo.removeEventListener(type, fn);
    }
    videoEventListeners = [];
  }

  function attachVideo(video) {
    detachListeners();
    stopPolling();

    activeVideo = video;

    const on = (type, fn) => {
      video.addEventListener(type, fn);
      videoEventListeners.push([type, fn]);
    };

    on('play',                updatePlayBtn);
    on('pause',               updatePlayBtn);
    on('volumechange',        updateVolumeUI);
    on('ratechange',          updateSpeedUI);
    on('durationchange',      updateProgress);
    on('seeked',              updateProgress);
    on('enterpictureinpicture', updatePipBtn);
    on('leavepictureinpicture', updatePipBtn);

    startPolling();
    syncAll();
    refreshVideoSelector();
    showPanel();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PANEL VISIBILITY & DRAG
  // ══════════════════════════════════════════════════════════════════════════
  function showPanel() {
    panel.style.display = 'block';
    if (!panel.dataset.positioned) {
      /* Default position: top-right, safe from most site navbars */
      panel.style.top   = '16px';
      panel.style.right = '16px';
      panel.dataset.positioned = '1';
    }
  }

  function hidePanel() {
    panel.style.display = 'none';
    stopPolling();
    detachListeners();
    activeVideo = null;
  }

  closeBtn.addEventListener('click', hidePanel);

  /* Pin toggle – when pinned the panel is not draggable */
  let isPinned = false;
  pinBtn.addEventListener('click', () => {
    isPinned = !isPinned;
    pinBtn.classList.toggle('vc-btn-active', isPinned);
    pinBtn.title = isPinned ? 'Unpin panel (drag enabled when unpinned)' : 'Pin panel';
  });

  /* Drag-to-move via the header */
  const header = q('#vc-header');
  header.addEventListener('mousedown', (e) => {
    if (isPinned || e.target.closest('button')) return;
    dragState = {
      startX:   e.clientX,
      startY:   e.clientY,
      origLeft: panel.offsetLeft,
      origTop:  panel.offsetTop,
    };
    panel.classList.add('vc-dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    panel.style.left  = `${dragState.origLeft + dx}px`;
    panel.style.top   = `${dragState.origTop  + dy}px`;
    panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (!dragState) return;
    dragState = null;
    panel.classList.remove('vc-dragging');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // BUTTON WIRING
  // ══════════════════════════════════════════════════════════════════════════
  playBtn.addEventListener('click', togglePlay);

  q('#vc-back-large').addEventListener('click', () => seek(-SEEK_LARGE));
  q('#vc-back-small').addEventListener('click', () => seek(-SEEK_SMALL));
  q('#vc-fwd-small').addEventListener('click',  () => seek(+SEEK_SMALL));
  q('#vc-fwd-large').addEventListener('click',  () => seek(+SEEK_LARGE));

  q('#vc-spd-m-c').addEventListener('click', () => changeSpeed(-SPEED_COARSE));
  q('#vc-spd-m-f').addEventListener('click', () => changeSpeed(-SPEED_FINE));
  q('#vc-spd-rst').addEventListener('click', () => setSpeed(1));
  q('#vc-spd-p-f').addEventListener('click', () => changeSpeed(+SPEED_FINE));
  q('#vc-spd-p-c').addEventListener('click', () => changeSpeed(+SPEED_COARSE));

  q('#vc-presets-row').querySelectorAll('.vc-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => setSpeed(parseFloat(btn.dataset.speed)));
  });

  muteBtn.addEventListener('click', toggleMute);

  volSlider.addEventListener('input', () => {
    setVolume(parseFloat(volSlider.value));
    updateVolumeUI();
  });

  progressBar.addEventListener('input', () => {
    seekTo(progressBar.value / 1000);
  });

  q('#vc-fullscreen-btn').addEventListener('click', toggleFullscreen);
  q('#vc-pip-btn').addEventListener('click',        togglePiP);
  loopBtn.addEventListener('click',                 toggleLoop);

  document.addEventListener('fullscreenchange',       updateFullscreenBtn);
  document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

  // ══════════════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS (active only while the panel is open)
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('keydown', (e) => {
    if (panel.style.display === 'none' || !activeVideo) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seek(e.shiftKey ? -SEEK_LARGE : -SEEK_SMALL);
        break;
      case 'ArrowRight':
        e.preventDefault();
        seek(e.shiftKey ? +SEEK_LARGE : +SEEK_SMALL);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setVolume((_get(activeVideo, 'volume') || 0) + 0.1);
        updateVolumeUI();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setVolume((_get(activeVideo, 'volume') || 0) - 0.1);
        updateVolumeUI();
        break;
      case '>':
        e.preventDefault();
        changeSpeed(+SPEED_FINE);
        break;
      case '<':
        e.preventDefault();
        changeSpeed(-SPEED_FINE);
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'p':
        e.preventDefault();
        togglePiP();
        break;
      case 'l':
        e.preventDefault();
        toggleLoop();
        break;
      case 'Escape':
        hidePanel();
        break;
    }
  }, true);

  // ══════════════════════════════════════════════════════════════════════════
  // HOVER INDICATOR
  // ══════════════════════════════════════════════════════════════════════════
  function positionIndicator(video) {
    const r = video.getBoundingClientRect();
    indicator.style.left = `${r.left + window.scrollX + 8}px`;
    indicator.style.top  = `${r.top  + window.scrollY + 8}px`;
  }

  document.addEventListener('mouseover', (e) => {
    const video = e.target.closest('video');
    if (!video) return;
    hoveredVideo = video;
    clearTimeout(indicatorHideTimer);
    positionIndicator(video);
    indicator.style.display = 'flex';
  }, true);

  document.addEventListener('mouseout', (e) => {
    const leavingVideo = e.target.closest('video');
    if (!leavingVideo) return;
    indicatorHideTimer = setTimeout(() => {
      if (!indicator.matches(':hover')) {
        indicator.style.display = 'none';
        hoveredVideo = null;
      }
    }, 350);
  }, true);

  indicator.addEventListener('mouseenter', () => clearTimeout(indicatorHideTimer));
  indicator.addEventListener('mouseleave', () => {
    indicatorHideTimer = setTimeout(() => {
      indicator.style.display = 'none';
    }, 350);
  });

  indicator.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hoveredVideo) {
      attachVideo(hoveredVideo);
      indicator.style.display = 'none';
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO DETECTION (existing + dynamically inserted)
  // ══════════════════════════════════════════════════════════════════════════
  function registerVideo(video) {
    if (!knownVideos.has(video)) {
      knownVideos.add(video);
    }
  }

  function scanVideos() {
    document.querySelectorAll('video').forEach(registerVideo);
  }

  const mutObs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.tagName === 'VIDEO') registerVideo(node);
        node.querySelectorAll('video').forEach(registerVideo);
      }
    }
  });

  mutObs.observe(document.documentElement, { childList: true, subtree: true });
  scanVideos();

  // ══════════════════════════════════════════════════════════════════════════
  // EXTENSION MESSAGE HANDLER  (for popup.js)
  // ══════════════════════════════════════════════════════════════════════════
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_VIDEOS') {
      const videos = [...knownVideos]
        .filter((v) => v.isConnected)
        .map((v, i) => ({
          index:    i,
          src:      (v.currentSrc || '').split('/').pop().split('?')[0].slice(0, 60),
          title:    (v.title || v.getAttribute('aria-label') || '').slice(0, 60),
          duration: _get(v, 'duration') || 0,
          paused:   _get(v, 'paused'),
        }));
      sendResponse({ videos });
      return true;
    }

    if (msg.type === 'OPEN_VIDEO') {
      const videos = [...knownVideos].filter((v) => v.isConnected);
      const v = videos[msg.index];
      if (v) attachVideo(v);
      sendResponse({ ok: !!v });
      return true;
    }
  });
})();
