function createPanelDOM() {
  const frag = document.createDocumentFragment()

  // Building #vc-header
  const header = document.createElement('div')
  header.id = 'vc-header'

  const title = document.createElement('span')
  title.id = 'vc-title'
  title.textContent = '🎬 Video Controller'

  const headerBtns = document.createElement('div')
  headerBtns.id = 'vc-header-btns'

  const pinBtn = document.createElement('button')
  pinBtn.id = 'vc-pin-btn'
  pinBtn.className = 'vc-icon-btn'
  pinBtn.title = 'Pin / unpin panel'
  pinBtn.textContent = '📌'

  const closeBtn = document.createElement('button')
  closeBtn.id = 'vc-close-btn'
  closeBtn.className = 'vc-icon-btn'
  closeBtn.title = 'Close panel'
  closeBtn.textContent = '✕'

  headerBtns.append(pinBtn, closeBtn)
  header.append(title, headerBtns)

  // Building #vc-body
  const body = document.createElement('div')
  body.id = 'vc-body'

  // Video selector
  const selectorRow = document.createElement('div')
  selectorRow.id = 'vc-selector-row'
  selectorRow.className = 'vc-row'
  selectorRow.style.display = 'none'

  const selectorLabel = document.createElement('label')
  selectorLabel.className = 'vc-label'
  selectorLabel.htmlFor = 'vc-video-sel'
  selectorLabel.textContent = 'Video'

  const videoSel = document.createElement('select')
  videoSel.id = 'vc-video-sel'

  selectorRow.append(selectorLabel, videoSel)

  // Time / speed info bar
  const infoRow = document.createElement('div')
  infoRow.id = 'vc-info-row'
  infoRow.className = 'vc-row'

  const timeDisplay = document.createElement('span')
  timeDisplay.id = 'vc-time-display'
  timeDisplay.textContent = '–:–– / –:––'

  const speedBadge = document.createElement('span')
  speedBadge.id = 'vc-speed-badge'
  speedBadge.title = 'Current playback speed'
  speedBadge.textContent = '1.00×'

  infoRow.append(timeDisplay, speedBadge)

  // Seek / progress bar
  const progressWrap = document.createElement('div')
  progressWrap.id = 'vc-progress-wrap'

  const progress = document.createElement('input')
  progress.type = 'range'
  progress.id = 'vc-progress'
  progress.min = '0'
  progress.max = '1000'
  progress.value = '0'
  progress.step = '1'
  progress.title = 'Seek — drag to jump'

  progressWrap.append(progress)

  // Playback controls
  const playbackRow = document.createElement('div')
  playbackRow.className = 'vc-row vc-center'

  const btnBackLarge = document.createElement('button')
  btnBackLarge.className = 'vc-btn'
  btnBackLarge.id = 'vc-back-large'

  const btnBackSmall = document.createElement('button')
  btnBackSmall.className = 'vc-btn'
  btnBackSmall.id = 'vc-back-small'

  const btnPlayPause = document.createElement('button')
  btnPlayPause.className = 'vc-btn vc-btn-main'
  btnPlayPause.id = 'vc-play-pause'
  btnPlayPause.title = 'Play / Pause (Space)'
  btnPlayPause.textContent = '▶'

  const btnFwdSmall = document.createElement('button')
  btnFwdSmall.className = 'vc-btn'
  btnFwdSmall.id = 'vc-fwd-small'

  const btnFwdLarge = document.createElement('button')
  btnFwdLarge.className = 'vc-btn'
  btnFwdLarge.id = 'vc-fwd-large'

  playbackRow.append(btnBackLarge, btnBackSmall, btnPlayPause, btnFwdSmall, btnFwdLarge)

  // Speed fine-tune
  const speedRow = document.createElement('div')
  speedRow.className = 'vc-row vc-center'

  const speedLabel = document.createElement('span')
  speedLabel.className = 'vc-label'
  speedLabel.textContent = 'Speed'

  const btnSpdMC = document.createElement('button')
  btnSpdMC.className = 'vc-btn'
  btnSpdMC.id = 'vc-spd-m-c'

  const btnSpdMF = document.createElement('button')
  btnSpdMF.className = 'vc-btn'
  btnSpdMF.id = 'vc-spd-m-f'

  const btnSpdRst = document.createElement('button')
  btnSpdRst.className = 'vc-btn'
  btnSpdRst.id = 'vc-spd-rst'
  btnSpdRst.title = 'Reset to 1×'
  btnSpdRst.textContent = '1×'

  const btnSpdPF = document.createElement('button')
  btnSpdPF.className = 'vc-btn'
  btnSpdPF.id = 'vc-spd-p-f'

  const btnSpdPC = document.createElement('button')
  btnSpdPC.className = 'vc-btn'
  btnSpdPC.id = 'vc-spd-p-c'

  speedRow.append(speedLabel, btnSpdMC, btnSpdMF, btnSpdRst, btnSpdPF, btnSpdPC)

  // Speed presets
  const presetsRow = document.createElement('div')
  presetsRow.className = 'vc-row vc-wrap'
  presetsRow.id = 'vc-presets-row'

  // Volume
  const volumeRow = document.createElement('div')
  volumeRow.className = 'vc-row vc-center'

  const btnMute = document.createElement('button')
  btnMute.className = 'vc-btn vc-icon-btn'
  btnMute.id = 'vc-mute-btn'
  btnMute.title = 'Mute / Unmute (M)'
  btnMute.textContent = '🔊'

  const volSlider = document.createElement('input')
  volSlider.type = 'range'
  volSlider.id = 'vc-vol-slider'
  volSlider.min = '0'
  volSlider.max = '1'
  volSlider.value = '1'
  volSlider.step = '0.02'
  volSlider.title = 'Volume'

  const volDisplay = document.createElement('span')
  volDisplay.id = 'vc-vol-display'
  volDisplay.textContent = '100%'

  volumeRow.append(btnMute, volSlider, volDisplay)

  // Extra controls
  const extraRow = document.createElement('div')
  extraRow.className = 'vc-row vc-center'

  const btnFullscreen = document.createElement('button')
  btnFullscreen.className = 'vc-btn'
  btnFullscreen.id = 'vc-fullscreen-btn'
  btnFullscreen.title = 'Toggle Fullscreen (F)'
  btnFullscreen.textContent = '⛶ Full'

  const btnPip = document.createElement('button')
  btnPip.className = 'vc-btn'
  btnPip.id = 'vc-pip-btn'
  btnPip.title = 'Picture in Picture (P)'
  btnPip.textContent = '⧉ PiP'

  const btnLoop = document.createElement('button')
  btnLoop.className = 'vc-btn'
  btnLoop.id = 'vc-loop-btn'
  btnLoop.title = 'Toggle Loop (L)'
  btnLoop.textContent = '↺ Loop'

  extraRow.append(btnFullscreen, btnPip, btnLoop)

  body.append(
    selectorRow,
    infoRow,
    progressWrap,
    playbackRow,
    speedRow,
    presetsRow,
    volumeRow,
    extraRow,
  )
  frag.append(header, body)

  return frag
}

if (typeof window !== 'undefined') {
  window.createPanelDOM = createPanelDOM
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createPanelDOM }
}
