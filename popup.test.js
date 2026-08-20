/**
 * @jest-environment jsdom
 */

// Mock chrome API and required DOM elements before requiring popup.js
global.chrome = {
  runtime: {
    getManifest: () => ({ version: '1.0.0' }),
    lastError: null,
  },
  tabs: {
    query: (queryInfo, callback) => callback([{ id: 1 }]),
    connect: () => ({
      onMessage: { addListener: () => {} },
      onDisconnect: { addListener: () => {} },
      postMessage: global.mockPostMessage,
    }),
  },
  storage: {
    local: {
      get: (defaults, callback) => callback(defaults),
      set: () => {},
    },
  },
}

document.body.innerHTML = `
  <div id="video-list"></div>
  <input type="checkbox" id="enabled-toggle">
  <span id="enabled-label"></span>
  <div id="version"></div>
`

require('./scripts/utils.js')
global.mockPostMessage = jest.fn()
const { formatDuration, reflectEnabled, createVideoCard, showMessage } = require('./popup.js')

describe('showMessage', () => {
  let list

  beforeEach(() => {
    list = document.getElementById('video-list')
    list.innerHTML = '<div>Old content</div>'
  })

  it('should clear existing content and append a paragraph with the message', () => {
    showMessage('No videos found')

    expect(list.children.length).toBe(1)

    const p = list.firstElementChild
    expect(p.tagName).toBe('P')
    expect(p.id).toBe('no-videos')
    expect(p.textContent).toBe('No videos found')
  })

  it('should safely render special characters preventing XSS', () => {
    showMessage('<img src="x" onerror="alert(1)">')

    expect(list.children.length).toBe(1)

    const p = list.firstElementChild
    expect(p.tagName).toBe('P')
    expect(p.id).toBe('no-videos')
    expect(p.textContent).toBe('<img src="x" onerror="alert(1)">')
    expect(p.innerHTML).toBe('&lt;img src="x" onerror="alert(1)"&gt;')
  })
})

describe('formatDuration (wrapper)', () => {
  beforeEach(() => {
    jest.spyOn(window, 'formatDuration').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should delegate to window.formatDuration for all values with an empty string fallback', () => {
    window.formatDuration.mockReturnValue('')
    expect(formatDuration(null)).toBe('')
    expect(window.formatDuration).toHaveBeenCalledWith(null, '')

    window.formatDuration.mockReturnValue('1:00')
    expect(formatDuration(60)).toBe('1:00')
    expect(window.formatDuration).toHaveBeenCalledWith(60, '')
  })
})

describe('reflectEnabled', () => {
  let toggle
  let toggleLabel

  beforeEach(() => {
    toggle = document.getElementById('enabled-toggle')
    toggleLabel = document.getElementById('enabled-label')
    // Reset body classes
    document.body.className = ''
  })

  it('should set toggle and label to On and remove vc-off class when true', () => {
    reflectEnabled(true)

    expect(toggle.checked).toBe(true)
    expect(toggleLabel.textContent).toBe('On')
    expect(document.body.classList.contains('vc-off')).toBe(false)
  })

  it('should set toggle and label to Off and add vc-off class when false', () => {
    reflectEnabled(false)

    expect(toggle.checked).toBe(false)
    expect(toggleLabel.textContent).toBe('Off')
    expect(document.body.classList.contains('vc-off')).toBe(true)
  })
})

describe('createVideoCard', () => {
  beforeEach(() => {
    jest.spyOn(window, 'formatDuration').mockImplementation((s) => (s ? `Duration: ${s}` : ''))
    global.mockPostMessage.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should create a card with video title if present', () => {
    const video = { title: 'My Video', src: 'http://example.com/vid.mp4', duration: 120, paused: true }
    window.formatDuration.mockReturnValue('2:00')
    const card = createVideoCard(video, 0)

    expect(card.className).toBe('video-card')
    expect(card.querySelector('.vc-name').textContent).toBe('My Video')
    expect(card.querySelector('.vc-name').title).toBe('My Video')
  })

  it('should fall back to src if title is not present', () => {
    const video = { src: 'http://example.com/vid.mp4', duration: 120, paused: true }
    window.formatDuration.mockReturnValue('2:00')
    const card = createVideoCard(video, 0)

    expect(card.querySelector('.vc-name').textContent).toBe('http://example.com/vid.mp4')
  })

  it('should fall back to Video {i+1} if neither title nor src is present', () => {
    const video = { duration: 120, paused: true }
    window.formatDuration.mockReturnValue('2:00')
    const card = createVideoCard(video, 1) // index 1 -> Video 2

    expect(card.querySelector('.vc-name').textContent).toBe('Video 2')
  })

  it('should render ⏸ for paused video', () => {
    const video = { title: 'Vid', paused: true }
    const card = createVideoCard(video, 0)
    expect(card.querySelector('.vc-thumb').textContent).toBe('⏸')
  })

  it('should render ▶ for playing video', () => {
    const video = { title: 'Vid', paused: false }
    const card = createVideoCard(video, 0)
    expect(card.querySelector('.vc-thumb').textContent).toBe('▶')
  })

  it('should format duration properly', () => {
    const video = { title: 'Vid', duration: 65, paused: true }
    window.formatDuration.mockReturnValue('1:05')
    const card = createVideoCard(video, 0)

    expect(card.querySelector('.vc-meta').textContent).toBe('Duration: 1:05')
  })

  it('should show "Duration unknown" when duration is falsy', () => {
    const video = { title: 'Vid', paused: true } // no duration
    window.formatDuration.mockReturnValue('')
    const card = createVideoCard(video, 0)

    expect(card.querySelector('.vc-meta').textContent).toBe('Duration unknown')
  })

  it('should open video when the card is clicked', () => {
    jest.useFakeTimers()
    const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {})
    const video = { frameToken: 'frame1', id: 'vid1', title: 'Vid', paused: false }
    const card = createVideoCard(video, 0)

    card.click()

    expect(global.mockPostMessage).toHaveBeenCalledWith({
      type: 'OPEN_VIDEO',
      frameToken: 'frame1',
      id: 'vid1'
    })

    jest.advanceTimersByTime(80)
    expect(closeSpy).toHaveBeenCalled()

    jest.useRealTimers()
  })

  it('should open video when the Control button is clicked', () => {
    jest.useFakeTimers()
    const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {})
    const video = { frameToken: 'frame2', id: 'vid2', title: 'Vid', paused: false }
    const card = createVideoCard(video, 0)

    const btn = card.querySelector('.vc-open-btn')
    btn.click()

    expect(global.mockPostMessage).toHaveBeenCalledWith({
      type: 'OPEN_VIDEO',
      frameToken: 'frame2',
      id: 'vid2'
    })

    jest.advanceTimersByTime(80)
    expect(closeSpy).toHaveBeenCalled()

    jest.useRealTimers()
  })
})
