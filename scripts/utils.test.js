/**
 * @jest-environment jsdom
 */

const { formatDuration } = require('./utils.js')

describe('formatDuration (utils)', () => {
  it('should return fallback string for null or undefined', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')

    expect(formatDuration(null, 'unknown')).toBe('unknown')
  })

  it('should format empty string and false as 0 (due to implicit cast)', () => {
    expect(formatDuration(false)).toBe('0:00')
    expect(formatDuration('')).toBe('0:00')
  })

  it('should handle zero correctly', () => {
    expect(formatDuration(0)).toBe('0:00')
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
