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
const { formatDuration, reflectEnabled } = require('./popup.js')

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

  it('should handle negative numbers by treating them as 0', () => {
    expect(formatDuration(-1)).toBe('0:00')
    expect(formatDuration(-45)).toBe('0:00')
    expect(formatDuration(-3600)).toBe('0:00')
  })

  it('should handle string numbers by parsing them correctly', () => {
    expect(formatDuration('45')).toBe('0:45')
    expect(formatDuration('3600')).toBe('1:00:00')
    expect(formatDuration('60.1')).toBe('1:00')
  })

  it('should return empty string for non-numeric strings', () => {
    expect(formatDuration('abc')).toBe('')
    expect(formatDuration('100abc')).toBe('')
  })

  it('should handle very large numbers correctly', () => {
    expect(formatDuration(1000000)).toBe('277:46:40')
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
