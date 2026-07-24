/**
 * Video Controller – content.js
 *
 * Injects a hover-activated indicator on every <video> element on the page.
 * Clicking the indicator opens a draggable floating mini-player that exposes
 * all HTMLVideoElement controls, including speed and seeking, bypassing
 * per-instance property overrides that player libraries may set.
 */
;(function () {
  'use strict'

  /* Guard against double-injection (e.g., in iframes) */
  if (window.__vcLoaded) return
  window.__vcLoaded = true

  /* Version marker so stale-script issues are diagnosable from the console.
     console.info, not .debug — debug is hidden by default in DevTools. */
  console.info(`[VideoController] content script v${chrome.runtime.getManifest().version} loaded`)

  // ══════════════════════════════════════════════════════════════════════════
  // NATIVE PROPERTY ACCESSORS
  //
  // Grabbing the original get/set from HTMLMediaElement.prototype lets us
  // bypass per-instance overrides that some players set via
  // Object.defineProperty(videoElement, 'playbackRate', { set: locked }).
  // ══════════════════════════════════════════════════════════════════════════
  const _proto = HTMLMediaElement.prototype
  const _desc = (prop) => Object.getOwnPropertyDescriptor(_proto, prop) || {}
  const _rawSet = (prop) => _desc(prop).set
  const _rawGet = (prop) => _desc(prop).get

  function _set(video, prop, value) {
    const setter = _rawSet(prop)
    try {
      if (setter) setter.call(video, value)
      else video[prop] = value
    } catch (_e) {
      /* silently ignore; the native API should always work */
    }
  }

  function _get(video, prop) {
    const getter = _rawGet(prop)
    try {
      return getter ? getter.call(video) : video[prop]
    } catch (_e) {
      return video[prop]
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ══════════════════════════════════════════════════════════════════════════
  const SEEK_SMALL = 5
  const SEEK_LARGE = 10
  const SPEED_FINE = 0.1
  const SPEED_COARSE = 0.25
  const MIN_RATE = 0.1
  /* 16× is the de-facto upper limit for HTMLMediaElement.playbackRate across
     browsers (Chrome supports up to 16, Firefox up to 20). Values above that
     are clamped silently by the engine anyway. */
  const MAX_RATE = 16

  const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4]

  // ══════════════════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════════════════
  let activeVideo = null
  let videoEventListeners = []
  let rafId = null
  let hoveredVideo = null
  let dragState = null
  let indicatorHideTimer = null
  let scrubbing = false
  /* Master on/off switch, persisted in chrome.storage.local (key: vcEnabled).
     When false the hover indicator and panel stay hidden across every frame. */
  let vcEnabled = true
  let userRate = null /* speed chosen via the panel; re-asserted if the site resets it */
  let rateFights = 0
  let rateFightWindowStart = 0

  const knownVideos = new Set()
  const visibleVideos = new Set()
  const videoIds = new WeakMap()
  let nextVideoId = 1

  /* IntersectionObserver may be absent (very old browsers, test envs) —
     fall back to hit-testing every known video in that case. */
  const visibilityObserver =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              visibleVideos.add(entry.target)
            } else {
              visibleVideos.delete(entry.target)
            }
          }
        })
      : null
  /* Random token identifying this frame, so the popup can address one frame
     among many (the content script runs with all_frames: true). */
  const FRAME_TOKEN = Array.from(crypto.getRandomValues(new Uint32Array(4)))
    .map((v) => v.toString(36))
    .join('')

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v))
  }

  function roundRate(r) {
    return Math.round(r * 100) / 100
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO ACTIONS  (all go through native prototype accessors)
  // ══════════════════════════════════════════════════════════════════════════
  function seek(delta) {
    if (!activeVideo) return
    /* duration is NaN before metadata loads and Infinity for live streams —
       only use it as an upper bound when it is a real number */
    const dur = _get(activeVideo, 'duration')
    const max = isFinite(dur) && dur > 0 ? dur : Infinity
    const cur = _get(activeVideo, 'currentTime') || 0
    _set(activeVideo, 'currentTime', clamp(cur + delta, 0, max))
  }

  function seekTo(fraction) {
    if (!activeVideo) return
    const dur = _get(activeVideo, 'duration')
    if (!isFinite(dur) || dur <= 0) return
    _set(activeVideo, 'currentTime', clamp(fraction * dur, 0, dur))
  }

  function changeSpeed(delta) {
    if (!activeVideo) return
    const cur = _get(activeVideo, 'playbackRate') || 1
    const next = roundRate(clamp(cur + delta, MIN_RATE, MAX_RATE))
    userRate = next
    _set(activeVideo, 'playbackRate', next)
  }

  function setSpeed(rate) {
    if (!activeVideo) return
    const next = clamp(roundRate(rate), MIN_RATE, MAX_RATE)
    userRate = next
    _set(activeVideo, 'playbackRate', next)
  }

  /* Some players listen for 'ratechange' and force the rate back. Re-assert
     the user's choice, but give up if the site keeps fighting within the same
     second so we never enter an endless set-loop. */
  function onRateChange() {
    updateSpeedUI()
    if (userRate === null || !activeVideo) return
    const cur = _get(activeVideo, 'playbackRate')
    if (cur === userRate) return
    const now = Date.now()
    if (now - rateFightWindowStart > 1000) {
      rateFightWindowStart = now
      rateFights = 0
    }
    if (++rateFights > 5) {
      userRate = null
      return
    }
    _set(activeVideo, 'playbackRate', userRate)
  }

  function togglePlay() {
    if (!activeVideo) return
    if (_get(activeVideo, 'paused')) activeVideo.play().catch(() => {})
    else activeVideo.pause()
  }

  function setVolume(v) {
    if (!activeVideo) return
    _set(activeVideo, 'volume', clamp(v, 0, 1))
    if (v > 0) _set(activeVideo, 'muted', false)
  }

  function toggleMute() {
    if (!activeVideo) return
    _set(activeVideo, 'muted', !_get(activeVideo, 'muted'))
  }

  function toggleFullscreen() {
    if (!activeVideo) return
    /* Try the closest player container first, then the video itself */
    const container =
      activeVideo.closest('[class*="player"]') ||
      activeVideo.closest('[class*="Player"]') ||
      activeVideo.parentElement
    if (!document.fullscreenElement) {
      ;(container || activeVideo)
        .requestFullscreen()
        .catch(() => activeVideo.requestFullscreen().catch(() => {}))
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  function togglePiP() {
    if (!activeVideo) return
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {})
    } else {
      activeVideo.requestPictureInPicture().catch(() => {})
    }
  }

  function toggleLoop() {
    if (!activeVideo) return
    _set(activeVideo, 'loop', !_get(activeVideo, 'loop'))
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUILD THE PANEL DOM
  // ══════════════════════════════════════════════════════════════════════════
  const panel = document.createElement('div')
  panel.id = 'vc-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', 'Video Controller')

  const speedPresetsHtml = SPEED_PRESETS.map(
    (s) => `<button class="vc-btn vc-preset-btn" data-speed="${s}" title="${s}×">${s}×</button>`,
  ).join('')

  panel.innerHTML = window.VC_PANEL_TEMPLATE.replaceAll('__SEEK_LARGE__', SEEK_LARGE)
    .replaceAll('__SEEK_SMALL__', SEEK_SMALL)
    .replaceAll('__SPEED_COARSE__', SPEED_COARSE)
    .replaceAll('__SPEED_FINE__', SPEED_FINE)
    .replace('__SPEED_PRESETS_HTML__', speedPresetsHtml)

  panel.style.display = 'none'
  /* document.body can be null in odd frames (XML documents, srcdoc timing) */
  const docRoot = () => document.body || document.documentElement
  docRoot().appendChild(panel)

  /* Hover indicator – a small button that appears over a hovered <video> */
  const indicator = document.createElement('div')
  indicator.id = 'vc-indicator'
  indicator.title = 'Open Video Controller'
  indicator.textContent = '🎬'
  indicator.style.display = 'none'
  docRoot().appendChild(indicator)

  /* Top-layer promotion: the Popover API paints above every z-index and even
     above open <dialog>s and fullscreen elements, so the panel is never
     buried by site UI. Falls back to plain max z-index where unsupported. */
  const POPOVER_OK = typeof panel.showPopover === 'function'
  if (POPOVER_OK) {
    panel.popover = 'manual' /* manual: no light-dismiss; Esc is handled by us */
    indicator.popover = 'manual'
  }

  function promoteToTopLayer(el) {
    if (!POPOVER_OK) return
    try {
      el.hidePopover()
    } catch (_e) {
      /* not open */
    }
    try {
      el.showPopover()
    } catch (_e) {
      /* disconnected */
    }
  }

  function dropFromTopLayer(el) {
    if (!POPOVER_OK) return
    try {
      el.hidePopover()
    } catch (_e) {
      /* not open */
    }
  }

  function showIndicatorEl() {
    indicator.style.display = 'flex'
    if (POPOVER_OK && !indicator.matches(':popover-open')) {
      try {
        indicator.showPopover()
      } catch (_e) {
        /* disconnected */
      }
    }
  }

  function hideIndicatorEl() {
    indicator.style.display = 'none'
    dropFromTopLayer(indicator)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PANEL DOM SHORTCUTS
  // ══════════════════════════════════════════════════════════════════════════
  const q = (sel) => panel.querySelector(sel)

  const closeBtn = q('#vc-close-btn')
  const pinBtn = q('#vc-pin-btn')
  const playBtn = q('#vc-play-pause')
  const progressBar = q('#vc-progress')
  const timeDisp = q('#vc-time-display')
  const speedBadge = q('#vc-speed-badge')
  const muteBtn = q('#vc-mute-btn')
  const volSlider = q('#vc-vol-slider')
  const volDisp = q('#vc-vol-display')
  const loopBtn = q('#vc-loop-btn')
  const selectorRow = q('#vc-selector-row')
  const videoSel = q('#vc-video-sel')

  // ══════════════════════════════════════════════════════════════════════════
  // UI UPDATE FUNCTIONS
  // ══════════════════════════════════════════════════════════════════════════
  function updatePlayBtn() {
    if (!activeVideo) return
    const paused = _get(activeVideo, 'paused')
    playBtn.textContent = paused ? '▶' : '⏸'
    playBtn.title = paused ? 'Play (Space)' : 'Pause (Space)'
  }

  function updateProgress() {
    if (!activeVideo) return
    const cur = _get(activeVideo, 'currentTime') || 0
    const dur = _get(activeVideo, 'duration') || 0
    /* don't fight the user's thumb while they are dragging the slider */
    if (dur > 0 && isFinite(dur) && !scrubbing) {
      progressBar.value = (cur / dur) * 1000
    }
    timeDisp.textContent = `${window.formatDuration(cur, '–:––')} / ${window.formatDuration(dur, '–:––')}`
  }

  function updateSpeedUI() {
    if (!activeVideo) return
    const r = _get(activeVideo, 'playbackRate') || 1
    speedBadge.textContent = `${r.toFixed(2)}×`
    q('#vc-presets-row')
      .querySelectorAll('.vc-preset-btn')
      .forEach((btn) => {
        btn.classList.toggle('vc-preset-active', parseFloat(btn.dataset.speed) === r)
      })
  }

  function updateVolumeUI() {
    if (!activeVideo) return
    const muted = _get(activeVideo, 'muted')
    const vol = _get(activeVideo, 'volume') ?? 1
    const eff = muted ? 0 : vol
    muteBtn.textContent = eff === 0 ? '🔇' : eff < 0.5 ? '🔉' : '🔊'
    volSlider.value = eff
    volDisp.textContent = `${Math.round(eff * 100)}%`
  }

  function updateLoopBtn() {
    if (!activeVideo) return
    const looping = _get(activeVideo, 'loop')
    loopBtn.classList.toggle('vc-btn-active', looping)
    loopBtn.title = `Loop: ${looping ? 'ON' : 'OFF'} (L)`
  }

  function updateFullscreenBtn() {
    const fsBtn = q('#vc-fullscreen-btn')
    const inFs = !!document.fullscreenElement
    fsBtn.textContent = inFs ? '⊡ Exit FS' : '⛶ Full'
    fsBtn.title = `${inFs ? 'Exit' : 'Toggle'} Fullscreen (F)`
  }

  function updatePipBtn() {
    const pipBtn = q('#vc-pip-btn')
    const inPip = document.pictureInPictureElement === activeVideo
    pipBtn.classList.toggle('vc-btn-active', inPip)
    pipBtn.title = `${inPip ? 'Exit' : 'Enter'} Picture in Picture (P)`
  }

  function syncAll() {
    updatePlayBtn()
    updateProgress()
    updateSpeedUI()
    updateVolumeUI()
    updateLoopBtn()
    updateFullscreenBtn()
    updatePipBtn()
  }

  /* rAF-based polling so the progress bar stays smooth even for live streams */
  function startPolling() {
    stopPolling()
    const tick = () => {
      updateProgress()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  function stopPolling() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO REGISTRY
  // ══════════════════════════════════════════════════════════════════════════
  function pruneVideos() {
    for (const v of knownVideos) {
      if (!v.isConnected) {
        knownVideos.delete(v)
        visibleVideos.delete(v)
        if (visibilityObserver) visibilityObserver.unobserve(v)
      }
    }
  }

  function connectedVideos() {
    pruneVideos()
    return [...knownVideos]
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO SELECTOR
  // ══════════════════════════════════════════════════════════════════════════
  /* ids of the videos currently listed — skip DOM rebuilds when unchanged */
  let selectorSnapshot = ''

  function createVideoOption(v, i) {
    const rawLabel =
      v.title ||
      v.getAttribute('aria-label') ||
      (v.currentSrc || '').split('/').pop().split('?')[0] ||
      `Video ${i + 1}`
    const opt = document.createElement('option')
    opt.value = i
    opt.textContent = rawLabel.slice(0, 40) /* textContent is XSS-safe */
    return opt
  }

  function refreshVideoSelector() {
    const videos = connectedVideos()
    if (videos.length <= 1) {
      selectorRow.style.display = 'none'
      selectorSnapshot = ''
      return
    }
    selectorRow.style.display = 'flex'

    const snapshot = videos.map((v) => videoIds.get(v)).join(',')
    if (snapshot !== selectorSnapshot) {
      selectorSnapshot = snapshot
      /* Build <option> elements with DOM APIs to avoid XSS via untrusted
         video metadata (title, aria-label, currentSrc). */
      while (videoSel.firstChild) videoSel.removeChild(videoSel.firstChild)
      const fragment = document.createDocumentFragment()
      videos.forEach((v, i) => {
        fragment.appendChild(createVideoOption(v, i))
      })
      videoSel.appendChild(fragment)
    }

    const idx = videos.indexOf(activeVideo)
    videoSel.value = idx >= 0 ? idx : 0
  }

  videoSel.addEventListener('change', () => {
    const v = connectedVideos()[parseInt(videoSel.value, 10)]
    if (v) attachVideo(v)
  })

  // ══════════════════════════════════════════════════════════════════════════
  // ATTACH / DETACH A VIDEO
  // ══════════════════════════════════════════════════════════════════════════
  function detachListeners() {
    if (!activeVideo) return
    for (const [type, fn] of videoEventListeners) {
      activeVideo.removeEventListener(type, fn)
    }
    videoEventListeners = []
  }

  function attachVideo(video) {
    if (!vcEnabled) return
    detachListeners()
    stopPolling()

    activeVideo = video
    userRate = null

    const on = (type, fn) => {
      video.addEventListener(type, fn)
      videoEventListeners.push([type, fn])
    }

    on('play', updatePlayBtn)
    on('pause', updatePlayBtn)
    on('volumechange', updateVolumeUI)
    on('ratechange', onRateChange)
    on('durationchange', updateProgress)
    on('seeked', updateProgress)
    on('enterpictureinpicture', updatePipBtn)
    on('leavepictureinpicture', updatePipBtn)

    startPolling()
    syncAll()
    refreshVideoSelector()
    showPanel()
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PANEL VISIBILITY & DRAG
  // ══════════════════════════════════════════════════════════════════════════
  /* Inline styles must win the cascade against both our stylesheet and any
     page rule targeting #vc-panel, hence setProperty with 'important'. */
  function placePanel(left, top) {
    panel.style.setProperty('left', `${left}px`, 'important')
    panel.style.setProperty('top', `${top}px`, 'important')
  }

  function showPanel() {
    /* re-append last so the panel wins z-index ties against late site nodes */
    docRoot().appendChild(panel)
    panel.style.display = 'block'
    promoteToTopLayer(panel)
    if (!panel.dataset.positioned) {
      /* Default position: top-right, safe from most site navbars */
      placePanel(Math.max(8, window.innerWidth - panel.offsetWidth - 16), 16)
      panel.dataset.positioned = '1'
    }
    /* diagnostics for "panel buried under site UI" reports */
    if (POPOVER_OK && !panel.matches(':popover-open')) {
      console.warn('[VideoController] top-layer promotion failed; falling back to z-index stacking')
    }
    if (window.self !== window.top) {
      console.info('[VideoController] panel lives inside an iframe and cannot escape its bounds')
    }
  }

  function hidePanel() {
    panel.style.display = 'none'
    dropFromTopLayer(panel)
    stopPolling()
    detachListeners()
    activeVideo = null
    userRate = null
  }

  /* Tear down all visible UI when the extension is switched off. */
  function disableUI() {
    clearTimeout(indicatorHideTimer)
    indicatorHideTimer = null
    hoveredVideo = null
    hideIndicatorEl()
    if (panel.style.display !== 'none') hidePanel()
  }

  closeBtn.addEventListener('click', hidePanel)

  /* Pin toggle – when pinned the panel is not draggable */
  let isPinned = false
  pinBtn.addEventListener('click', () => {
    isPinned = !isPinned
    pinBtn.classList.toggle('vc-btn-active', isPinned)
    pinBtn.title = isPinned ? 'Unpin panel (drag enabled when unpinned)' : 'Pin panel'
  })

  /* Drag-to-move via the header */
  const header = q('#vc-header')
  header.addEventListener('mousedown', (e) => {
    if (isPinned || e.target.closest('button')) return
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: panel.offsetLeft,
      origTop: panel.offsetTop,
    }
    panel.classList.add('vc-dragging')
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!dragState) return
    const dx = e.clientX - dragState.startX
    const dy = e.clientY - dragState.startY
    /* keep at least part of the header on-screen so the panel stays reachable */
    const left = clamp(dragState.origLeft + dx, 60 - panel.offsetWidth, window.innerWidth - 60)
    const top = clamp(dragState.origTop + dy, 0, window.innerHeight - 36)
    placePanel(left, top)
  })

  document.addEventListener('mouseup', () => {
    if (!dragState) return
    dragState = null
    panel.classList.remove('vc-dragging')
  })

  // ══════════════════════════════════════════════════════════════════════════
  // BUTTON WIRING
  // ══════════════════════════════════════════════════════════════════════════
  playBtn.addEventListener('click', togglePlay)

  q('#vc-back-large').addEventListener('click', () => seek(-SEEK_LARGE))
  q('#vc-back-small').addEventListener('click', () => seek(-SEEK_SMALL))
  q('#vc-fwd-small').addEventListener('click', () => seek(+SEEK_SMALL))
  q('#vc-fwd-large').addEventListener('click', () => seek(+SEEK_LARGE))

  q('#vc-spd-m-c').addEventListener('click', () => changeSpeed(-SPEED_COARSE))
  q('#vc-spd-m-f').addEventListener('click', () => changeSpeed(-SPEED_FINE))
  q('#vc-spd-rst').addEventListener('click', () => setSpeed(1))
  q('#vc-spd-p-f').addEventListener('click', () => changeSpeed(+SPEED_FINE))
  q('#vc-spd-p-c').addEventListener('click', () => changeSpeed(+SPEED_COARSE))

  q('#vc-presets-row')
    .querySelectorAll('.vc-preset-btn')
    .forEach((btn) => {
      btn.addEventListener('click', () => setSpeed(parseFloat(btn.dataset.speed)))
    })

  muteBtn.addEventListener('click', toggleMute)

  volSlider.addEventListener('input', () => {
    setVolume(parseFloat(volSlider.value))
    updateVolumeUI()
  })

  progressBar.addEventListener('pointerdown', () => {
    scrubbing = true
  })
  document.addEventListener('pointerup', () => {
    scrubbing = false
  })

  progressBar.addEventListener('input', () => {
    seekTo(progressBar.value / 1000)
  })

  q('#vc-fullscreen-btn').addEventListener('click', toggleFullscreen)
  q('#vc-pip-btn').addEventListener('click', togglePiP)
  loopBtn.addEventListener('click', toggleLoop)

  document.addEventListener('fullscreenchange', () => {
    updateFullscreenBtn()
    if (POPOVER_OK) {
      /* the fullscreen element joins the top layer above us — re-promote */
      if (panel.style.display !== 'none') promoteToTopLayer(panel)
      return
    }
    /* Fallback without Popover API: the top layer only renders children of
       the fullscreen element, so re-parent the panel into it. Skip when the
       video itself is fullscreen — <video> children are not rendered. */
    const fsEl = document.fullscreenElement
    if (fsEl && fsEl !== activeVideo && fsEl.tagName !== 'VIDEO') {
      fsEl.appendChild(panel)
      fsEl.appendChild(indicator)
    } else if (!fsEl) {
      docRoot().appendChild(panel)
      docRoot().appendChild(indicator)
    }
  })
  document.addEventListener('webkitfullscreenchange', updateFullscreenBtn)

  /* If the site opens its own popover after ours, it stacks above us in the
     top layer. ToggleEvents don't bubble but are visible to a capturing
     listener; re-promote so the panel stays on top. Our own toggles are
     filtered out to avoid recursion. */
  document.addEventListener(
    'toggle',
    (e) => {
      if (e.target === panel || e.target === indicator) return
      if (panel.style.display !== 'none') promoteToTopLayer(panel)
    },
    true,
  )

  // ══════════════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS (active only while the panel is open)
  // ══════════════════════════════════════════════════════════════════════════
  const IGNORED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

  document.addEventListener(
    'keydown',
    (e) => {
      if (panel.style.display === 'none' || !activeVideo) return
      if (IGNORED_TAGS.has(e.target.tagName)) return
      if (e.target.isContentEditable) return
      /* keep native Space/Enter activation on focused panel buttons */
      if (panel.contains(e.target) && (e.key === ' ' || e.key === 'Enter')) return

      const keyHandlers = {
        ' ': () => togglePlay(),
        k: () => togglePlay(),
        ArrowLeft: () => seek(e.shiftKey ? -SEEK_LARGE : -SEEK_SMALL),
        ArrowRight: () => seek(e.shiftKey ? +SEEK_LARGE : +SEEK_SMALL),
        ArrowUp: () => {
          setVolume((_get(activeVideo, 'volume') || 0) + 0.1)
          updateVolumeUI()
        },
        ArrowDown: () => {
          setVolume((_get(activeVideo, 'volume') || 0) - 0.1)
          updateVolumeUI()
        },
        '>': () => changeSpeed(+SPEED_FINE),
        '<': () => changeSpeed(-SPEED_FINE),
        m: () => toggleMute(),
        f: () => toggleFullscreen(),
        p: () => togglePiP(),
        l: () => toggleLoop(),
        Escape: () => hidePanel(),
      }

      const handler = keyHandlers[e.key]
      if (handler) {
        if (e.key !== 'Escape') {
          e.preventDefault()
        }
        handler()
      }
    },
    true,
  )

  // ══════════════════════════════════════════════════════════════════════════
  // HOVER INDICATOR
  //
  // Players usually cover the <video> with overlay divs, so mouseover on the
  // video itself never fires. Instead the pointer is hit-tested against the
  // rects of all known videos, throttled to one check per animation frame.
  // The same check re-runs on scroll so the indicator tracks the video.
  // ══════════════════════════════════════════════════════════════════════════
  function positionIndicator(video) {
    /* viewport coords — the indicator is position: fixed */
    const r = video.getBoundingClientRect()
    indicator.style.setProperty('left', `${r.left + 8}px`, 'important')
    indicator.style.setProperty('top', `${r.top + 8}px`, 'important')
  }

  function pointInRect(x, y, r) {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }

  function videoAtPoint(x, y) {
    let match = null
    for (const v of visibilityObserver ? visibleVideos : knownVideos) {
      if (!v.isConnected) continue
      const r = v.getBoundingClientRect()
      if (r.width < 48 || r.height < 48) continue /* skip tracking pixels / thumbnails */
      if (pointInRect(x, y, r)) match = v
    }
    return match
  }

  function updateIndicator(x, y) {
    if (!vcEnabled) return
    const overPanel =
      panel.style.display !== 'none' && pointInRect(x, y, panel.getBoundingClientRect())
    const overInd =
      indicator.style.display !== 'none' && pointInRect(x, y, indicator.getBoundingClientRect())
    const video = overPanel ? null : videoAtPoint(x, y)

    if (video || overInd) {
      if (video) {
        hoveredVideo = video
        positionIndicator(video)
      }
      clearTimeout(indicatorHideTimer)
      indicatorHideTimer = null
      showIndicatorEl()
    } else if (indicator.style.display !== 'none' && !indicatorHideTimer) {
      indicatorHideTimer = setTimeout(() => {
        indicatorHideTimer = null
        hideIndicatorEl()
        hoveredVideo = null
      }, 350)
    }
  }

  let lastMouseX = -1
  let lastMouseY = -1
  let indUpdatePending = false

  function scheduleIndicatorUpdate() {
    if (indUpdatePending || lastMouseX < 0) return
    indUpdatePending = true
    requestAnimationFrame(() => {
      indUpdatePending = false
      updateIndicator(lastMouseX, lastMouseY)
    })
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      lastMouseX = e.clientX
      lastMouseY = e.clientY
      scheduleIndicatorUpdate()
    },
    true,
  )

  /* capture: also fires for scrollable containers, not just the window —
     keeps the indicator glued to the video while the page scrolls under
     the pointer, and hides it once the video scrolls away */
  window.addEventListener('scroll', scheduleIndicatorUpdate, {
    capture: true,
    passive: true,
  })

  indicator.addEventListener('click', (e) => {
    e.stopPropagation()
    if (hoveredVideo) {
      attachVideo(hoveredVideo)
      hideIndicatorEl()
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // VIDEO DETECTION (existing + dynamically inserted)
  // ══════════════════════════════════════════════════════════════════════════
  function registerVideo(video) {
    if (knownVideos.has(video)) return
    knownVideos.add(video)
    if (visibilityObserver) visibilityObserver.observe(video)
    videoIds.set(video, nextVideoId++)
    if (panel.style.display !== 'none') refreshVideoSelector()
  }

  function scanVideos() {
    document.querySelectorAll('video').forEach(registerVideo)
  }

  const mutObs = new MutationObserver((mutations) => {
    let checkRemovals = false
    for (const m of mutations) {
      /* Ignore mutations of our own UI: rebuilding the selector options
         mutates the panel, which would re-trigger this observer and
         re-rebuild the selector — an infinite loop that freezes the page. */
      if (m.target === panel || panel.contains(m.target)) continue
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        if (node === panel || node === indicator) continue
        if (node.tagName === 'VIDEO') registerVideo(node)
        node.querySelectorAll('video').forEach(registerVideo)
      }
      if (m.removedNodes.length > 0) checkRemovals = true
    }

    if (checkRemovals) {
      let removed = false
      for (const v of knownVideos) {
        if (!v.isConnected) {
          removed = true
          break
        }
      }
      if (removed) {
        pruneVideos()
        if (activeVideo && !activeVideo.isConnected) hidePanel()
        else if (panel.style.display !== 'none') refreshVideoSelector()
      }
    }
  })

  mutObs.observe(document.documentElement, { childList: true, subtree: true })
  scanVideos()

  // ══════════════════════════════════════════════════════════════════════════
  // POPUP CONNECTION (for popup.js)
  //
  // The popup opens a Port to every frame in the tab (tabs.connect without a
  // frameId). Each frame reports its videos over the port as soon as the
  // popup connects; OPEN_VIDEO is broadcast to all frames and filtered by
  // FRAME_TOKEN so exactly one frame acts on it.
  // ══════════════════════════════════════════════════════════════════════════
  function videoSummaries() {
    return connectedVideos().map((v) => ({
      id: videoIds.get(v),
      frameToken: FRAME_TOKEN,
      src: (v.currentSrc || '').split('/').pop().split('?')[0].slice(0, 60),
      title: (v.title || v.getAttribute('aria-label') || '').slice(0, 60),
      duration: _get(v, 'duration') || 0,
      paused: _get(v, 'paused'),
    }))
  }

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'vc-popup') return

    const videos = videoSummaries()
    console.info(`[VideoController] popup connected; reporting ${videos.length} video(s)`)
    if (videos.length) port.postMessage({ type: 'VIDEOS', videos })

    port.onMessage.addListener((msg) => {
      if (msg.type !== 'OPEN_VIDEO' || msg.frameToken !== FRAME_TOKEN) return
      const v = connectedVideos().find((x) => videoIds.get(x) === msg.id)
      if (v) attachVideo(v)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // ENABLE / DISABLE SWITCH
  //
  // State lives in chrome.storage.local so it is shared across all tabs and
  // frames and survives reloads. The popup writes it; every frame reacts live
  // via onChanged, so toggling takes effect without a page refresh.
  // ══════════════════════════════════════════════════════════════════════════
  function applyEnabled(enabled) {
    vcEnabled = enabled !== false
    if (!vcEnabled) disableUI()
  }

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({ vcEnabled: true }, (res) => {
      if (chrome.runtime.lastError) return
      applyEnabled(res.vcEnabled)
    })
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.vcEnabled) applyEnabled(changes.vcEnabled.newValue)
    })
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { _get, _set, clamp, roundRate }
  }
})()
