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
const {
  formatDuration,
  reflectEnabled,
  createVideoCard,
  updateVideoCard,
  showMessage,
  openVideo,
  _setPort,
} = require('./popup.js')

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

  it('should return empty string without delegating for falsy values', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(false)).toBe('')
    expect(formatDuration('')).toBe('')

    expect(window.formatDuration).not.toHaveBeenCalled()
  })

  it('should delegate to window.formatDuration with empty string fallback for truthy values', () => {
    window.formatDuration.mockReturnValue('1:00')

    expect(formatDuration(60)).toBe('1:00')
    expect(window.formatDuration).toHaveBeenCalledWith(60, '')

    window.formatDuration.mockReturnValue('0:45')
    expect(formatDuration('45')).toBe('0:45')
    expect(window.formatDuration).toHaveBeenCalledWith('45', '')
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
    const video = {
      title: 'My Video',
      src: 'http://example.com/vid.mp4',
      duration: 120,
      paused: true,
    }
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
      id: 'vid1',
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
      id: 'vid2',
    })

    jest.advanceTimersByTime(80)
    expect(closeSpy).toHaveBeenCalled()

    jest.useRealTimers()
  })
})

describe('openVideo', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(window, 'close').mockImplementation(() => {})
    global.mockPostMessage.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    _setPort(null) // Reset state
  })

  it('should return early if port is null', () => {
    const video = { frameToken: 'frame-test', id: 'video-test' }
    _setPort(null)

    openVideo(video)

    expect(global.mockPostMessage).not.toHaveBeenCalled()
    expect(window.close).not.toHaveBeenCalled()
  })

  it('should post message and close window after delay', () => {
    const video = { frameToken: 'frame-123', id: 'vid-abc' }
    const mockPort = {
      postMessage: jest.fn()
    }
    _setPort(mockPort)

    openVideo(video)

    expect(mockPort.postMessage).toHaveBeenCalledWith({
      type: 'OPEN_VIDEO',
      frameToken: 'frame-123',
      id: 'vid-abc',
    })

    // The delay shouldn't have passed yet
    expect(window.close).not.toHaveBeenCalled()

    // Advance time by PORT_FLUSH_DELAY_MS (80ms)
    jest.advanceTimersByTime(80)

    expect(window.close).toHaveBeenCalled()
  })
})

describe('updateVideoCard', () => {
  let card
  let originalVideo

  beforeEach(() => {
    jest.spyOn(window, 'formatDuration').mockImplementation((s) => (s ? `Duration: ${s}` : ''))

    // Create a base card to update
    originalVideo = {
      title: 'Old Title',
      duration: 100,
      paused: false,
      frameToken: 'frame1',
      id: 'vid1',
    }
    window.formatDuration.mockReturnValue('1:40')
    card = createVideoCard(originalVideo, 0)

    // Clear mock so we can track calls from updateVideoCard
    window.formatDuration.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should update card with new title if present', () => {
    const video = {
      title: 'New Title',
      src: 'http://example.com/vid.mp4',
      duration: 120,
      paused: true,
    }
    window.formatDuration.mockReturnValue('2:00')

    updateVideoCard(card, video, 1)

    expect(card.querySelector('.vc-name').textContent).toBe('New Title')
    expect(card.querySelector('.vc-name').title).toBe('New Title')
  })

  it('should fall back to src if title is not present', () => {
    const video = { src: 'http://example.com/new.mp4', duration: 120, paused: true }
    window.formatDuration.mockReturnValue('2:00')

    updateVideoCard(card, video, 1)

    expect(card.querySelector('.vc-name').textContent).toBe('http://example.com/new.mp4')
    expect(card.querySelector('.vc-name').title).toBe('http://example.com/new.mp4')
  })

  it('should fall back to Video {i+1} if neither title nor src is present', () => {
    const video = { duration: 120, paused: true }
    window.formatDuration.mockReturnValue('2:00')

    updateVideoCard(card, video, 1) // index 1 -> Video 2

    expect(card.querySelector('.vc-name').textContent).toBe('Video 2')
    expect(card.querySelector('.vc-name').title).toBe('Video 2')
  })

  it('should update state to ⏸ for paused video', () => {
    const video = { title: 'Vid', paused: true }

    updateVideoCard(card, video, 0)

    expect(card.querySelector('.vc-thumb').textContent).toBe('⏸')
  })

  it('should update state to ▶ for playing video', () => {
    // Modify initial card to be paused to verify transition
    card.querySelector('.vc-thumb').textContent = '⏸'

    const video = { title: 'Vid', paused: false }

    updateVideoCard(card, video, 0)

    expect(card.querySelector('.vc-thumb').textContent).toBe('▶')
  })

  it('should update duration properly', () => {
    const video = { title: 'Vid', duration: 65, paused: true }
    window.formatDuration.mockReturnValue('1:05')

    updateVideoCard(card, video, 0)

    expect(card.querySelector('.vc-meta').textContent).toBe('Duration: 1:05')
  })

  it('should show "Duration unknown" when duration is falsy', () => {
    const video = { title: 'Vid', paused: true } // no duration
    window.formatDuration.mockReturnValue('')

    updateVideoCard(card, video, 0)

    expect(card.querySelector('.vc-meta').textContent).toBe('Duration unknown')
  })

  it('should update the _vcVideo reference on the card', () => {
    const video = { title: 'New Vid', duration: 50, paused: true, frameToken: 'frame2', id: 'vid2' }

    updateVideoCard(card, video, 0)

    expect(card._vcVideo).toBe(video)
  })
})
