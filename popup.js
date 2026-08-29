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
;(function () {
  'use strict'

  const PORT_FLUSH_DELAY_MS = 80
  const FRAME_REPORT_DELAY_MS = 400

  const list = document.getElementById('video-list')
  const found = new Map() /* "frameToken:id" -> video info */
  let port = null

  document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`

  /* Master enable/disable switch, persisted in chrome.storage.local.
     Toggling here is broadcast to every content-script frame via onChanged. */
  const toggle = document.getElementById('enabled-toggle')
  const toggleLabel = document.getElementById('enabled-label')

  function reflectEnabled(enabled) {
    toggle.checked = enabled
    toggleLabel.textContent = enabled ? 'On' : 'Off'
    document.body.classList.toggle('vc-off', !enabled)
  }

  chrome.storage.local.get({ vcEnabled: true }, (res) => {
    reflectEnabled(res.vcEnabled !== false)
  })

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked
    reflectEnabled(enabled)
    chrome.storage.local.set({ vcEnabled: enabled })
  })

  /* Delegates to the shared util (scripts/utils.js, loaded by popup.html);
     keeps the old falsy semantics: 0/NaN/Infinity -> '' ("Duration unknown") */
  function formatDuration(s) {
    return s ? window.formatDuration(s, '') : ''
  }

  function showMessage(text) {
    while (list.firstChild) list.removeChild(list.firstChild)
    const p = document.createElement('p')
    p.id = 'no-videos'
    p.textContent = text
    list.appendChild(p)
  }

  function createElement(tag, className, textContent) {
    const el = document.createElement(tag)
    if (className) el.className = className
    if (textContent !== undefined) el.textContent = textContent
    return el
  }

  function bindVideoCardEvents(card, btn, v) {
    // Clear old listeners by replacing elements with clones if needed, or simply handle it.
    // Instead of replacing the whole element, we'll store a reference to the current video object on the element.
    card._vcVideo = v
    if (!card._vcBound) {
      card._vcBound = true
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openVideo(card._vcVideo)
      })
      card.addEventListener('click', () => openVideo(card._vcVideo))
    }
  }

  function createVideoCard(v, i) {
    const name = v.title || v.src || `Video ${i + 1}`
    const dur = formatDuration(v.duration)
    const state = v.paused ? '⏸' : '▶'

    /* Build card with DOM APIs to avoid XSS from untrusted video metadata */
    const card = createElement('div', 'video-card')
    const thumb = createElement('span', 'vc-thumb', state)
    const info = createElement('div', 'vc-info')

    const nameEl = createElement('div', 'vc-name', name)
    nameEl.title = name /* textContent is XSS-safe */

    const metaEl = createElement('div', 'vc-meta', dur ? `Duration: ${dur}` : 'Duration unknown')

    const btn = createElement('button', 'vc-open-btn', 'Control')

    bindVideoCardEvents(card, btn, v)

    info.appendChild(nameEl)
    info.appendChild(metaEl)
    card.appendChild(thumb)
    card.appendChild(info)
    card.appendChild(btn)

    card.dataset.id = `${v.frameToken}:${v.id}`
    return card
  }

  function updateVideoCard(card, v, i) {
    const name = v.title || v.src || `Video ${i + 1}`
    const dur = formatDuration(v.duration)
    const state = v.paused ? '⏸' : '▶'

    card.children[0].textContent = state

    const info = card.children[1]
    info.children[0].textContent = name
    info.children[0].title = name
    info.children[1].textContent = dur ? `Duration: ${dur}` : 'Duration unknown'

    // Update the video reference for events
    card._vcVideo = v
  }

  function renderVideos() {
    const videos = [...found.values()]

    if (videos.length === 0) {
      showMessage('No videos found on this page. Navigate to a page with a <video> element.')
      return
    }

    // ensure no-videos message is removed if we are about to render videos
    const noVideos = list.querySelector('#no-videos')
    if (noVideos) {
      list.removeChild(noVideos)
    }

    const existingMap = new Map()
    for (const child of list.children) {
      if (child.dataset.id) {
        existingMap.set(child.dataset.id, child)
      }
    }

    const newOrder = []

    videos.forEach((v, i) => {
      const id = `${v.frameToken}:${v.id}`
      let node = existingMap.get(id)

      if (node) {
        updateVideoCard(node, v, i)
        existingMap.delete(id)
      } else {
        node = createVideoCard(v, i)
      }
      newOrder.push(node)
    })

    /* Remove elements no longer present */
    for (const child of existingMap.values()) {
      list.removeChild(child)
    }

    /* Reorder and append new ones */
    newOrder.forEach((node, idx) => {
      if (list.children[idx] !== node) {
        list.insertBefore(node, list.children[idx] || null)
      }
    })
  }

  function openVideo(v) {
    if (!port) return
    port.postMessage({
      type: 'OPEN_VIDEO',
      frameToken: v.frameToken,
      id: v.id,
    })
    /* give the port a moment to flush before the popup context dies */
    setTimeout(() => window.close(), PORT_FLUSH_DELAY_MS)
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      showMessage('No videos found on this page.')
      return
    }

    port = chrome.tabs.connect(tabs[0].id, { name: 'vc-popup' })

    port.onMessage.addListener((msg) => {
      if (msg.type !== 'VIDEOS') return
      msg.videos.forEach((v) => found.set(`${v.frameToken}:${v.id}`, v))
      renderVideos()
    })

    /* Fires immediately when no content script is listening in the tab */
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError
      if (found.size === 0) {
        showMessage(
          `Could not connect to the page. Try refreshing the tab. (${err ? err.message : 'disconnected'})`,
        )
      }
    })

    /* Give frames a moment to report before declaring none found */
    setTimeout(() => {
      if (found.size === 0 && list.querySelector('.spinner')) renderVideos()
    }, FRAME_REPORT_DELAY_MS)
  })

  /* Export for testing */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      formatDuration,
      reflectEnabled,
      createVideoCard,
      showMessage,
      openVideo,
      _setPort: (p) => {
        port = p
      },
    }
  }
})()
