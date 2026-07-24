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

describe('formatDuration', () => {
  it('should return empty string for falsy values', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(false)).toBe('')
    expect(formatDuration('')).toBe('')
  })

  it('should return empty string for non-finite values', () => {
    expect(formatDuration(Infinity)).toBe('')
    expect(formatDuration(-Infinity)).toBe('')
    expect(formatDuration(NaN)).toBe('')
  })

  it('should format seconds correctly', () => {
    expect(formatDuration(45)).toBe('0:45')
    expect(formatDuration(59)).toBe('0:59')
  })

  it('should format minutes and seconds correctly', () => {
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(125)).toBe('2:05')
    expect(formatDuration(3599)).toBe('59:59')
  })

  it('should format hours, minutes, and seconds correctly', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3665)).toBe('1:01:05')
    expect(formatDuration(7325)).toBe('2:02:05')
  })

  it('should handle decimals correctly by rounding down', () => {
    expect(formatDuration(45.9)).toBe('0:45')
    expect(formatDuration(60.1)).toBe('1:00')
    expect(formatDuration(3600.99)).toBe('1:00:00')
  })
})
