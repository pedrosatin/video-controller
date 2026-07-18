const VC_PANEL_TEMPLATE = `
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
        <button class="vc-btn" id="vc-back-large" title="Back __SEEK_LARGE__ s">−__SEEK_LARGE__s</button>
        <button class="vc-btn" id="vc-back-small" title="Back __SEEK_SMALL__ s">−__SEEK_SMALL__s</button>
        <button class="vc-btn vc-btn-main" id="vc-play-pause" title="Play / Pause (Space)">▶</button>
        <button class="vc-btn" id="vc-fwd-small"  title="Forward __SEEK_SMALL__ s">+__SEEK_SMALL__s</button>
        <button class="vc-btn" id="vc-fwd-large"  title="Forward __SEEK_LARGE__ s">+__SEEK_LARGE__s</button>
      </div>

      <!-- Speed fine-tune -->
      <div class="vc-row vc-center">
        <span class="vc-label">Speed</span>
        <button class="vc-btn" id="vc-spd-m-c" title="−__SPEED_COARSE__×">−0.25</button>
        <button class="vc-btn" id="vc-spd-m-f" title="−__SPEED_FINE__×">−0.1</button>
        <button class="vc-btn" id="vc-spd-rst" title="Reset to 1×">1×</button>
        <button class="vc-btn" id="vc-spd-p-f" title="+__SPEED_FINE__×">+0.1</button>
        <button class="vc-btn" id="vc-spd-p-c" title="+__SPEED_COARSE__×">+0.25</button>
      </div>

      <!-- Speed presets -->
      <div class="vc-row vc-wrap" id="vc-presets-row">
        __SPEED_PRESETS_HTML__
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

// Expose to content.js (and to tests under module systems)
if (typeof window !== "undefined") {
  window.VC_PANEL_TEMPLATE = VC_PANEL_TEMPLATE;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { VC_PANEL_TEMPLATE };
}
