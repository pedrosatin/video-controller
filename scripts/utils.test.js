/**
 * @jest-environment jsdom
 */

const { formatDuration } = require('./utils');

describe('formatDuration', () => {
  describe('Valid Durations', () => {
    it('formats seconds correctly', () => {
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(5)).toBe('0:05');
      expect(formatDuration(45)).toBe('0:45');
    });

    it('formats minutes correctly', () => {
      expect(formatDuration(60)).toBe('1:00');
      expect(formatDuration(65)).toBe('1:05');
      expect(formatDuration(75)).toBe('1:15');
      expect(formatDuration(3599)).toBe('59:59');
    });

    it('formats hours correctly', () => {
      expect(formatDuration(3600)).toBe('1:00:00');
      expect(formatDuration(3661)).toBe('1:01:01');
      expect(formatDuration(7200)).toBe('2:00:00');
      expect(formatDuration(7265)).toBe('2:01:05');
      expect(formatDuration(36000)).toBe('10:00:00');
    });
  });

  describe('Edge Cases', () => {
    it('floors fractional seconds', () => {
      expect(formatDuration(5.9)).toBe('0:05');
      expect(formatDuration(3600.5)).toBe('1:00:00');
    });

    it('treats negative numbers as 0', () => {
      expect(formatDuration(-10)).toBe('0:00');
      expect(formatDuration(-0.5)).toBe('0:00');
    });
  });

  describe('Invalid Inputs and Fallbacks', () => {
    it('returns empty string by default for invalid inputs', () => {
      expect(formatDuration(NaN)).toBe('');
      expect(formatDuration(null)).toBe('');
      expect(formatDuration(undefined)).toBe('');
      expect(formatDuration(Infinity)).toBe('');
      expect(formatDuration(-Infinity)).toBe('');
      expect(formatDuration('abc')).toBe('');
      expect(formatDuration({})).toBe('');
    });

    it('returns custom fallback for invalid inputs', () => {
      expect(formatDuration(NaN, 'N/A')).toBe('N/A');
      expect(formatDuration(null, 'Unknown')).toBe('Unknown');
      expect(formatDuration(undefined, '0:00')).toBe('0:00');
    });
  });
});
