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
const { formatDuration } = require('./popup.js')

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
