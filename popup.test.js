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
      postMessage: () => {},
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
const { formatDuration, reflectEnabled, showMessage } = require('./popup.js')

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
