/**
 * @jest-environment jsdom
 */

// Mock chrome API before requiring content.js
global.chrome = {
  runtime: {
    getManifest: () => ({ version: '1.0.0' }),
    onMessage: {
      addListener: jest.fn(),
    },
    onConnect: {
      addListener: jest.fn(),
    }
  }
};

const { _get, _set, formatTime, roundRate } = require('./content');

describe('roundRate', () => {
  it('rounds strictly to 2 decimal places', () => {
    expect(roundRate(1.234)).toBe(1.23);
    expect(roundRate(1.235)).toBe(1.24);
    expect(roundRate(1.239)).toBe(1.24);
  });

  it('preserves exact 2 decimal places', () => {
    expect(roundRate(1.23)).toBe(1.23);
    expect(roundRate(2)).toBe(2);
    expect(roundRate(0)).toBe(0);
  });

  it('handles negative values correctly', () => {
    expect(roundRate(-1.234)).toBe(-1.23);
    expect(roundRate(-1.236)).toBe(-1.24);
  });

  it('handles edge cases', () => {
    expect(Number.isNaN(roundRate(NaN))).toBe(true);
    expect(roundRate(Infinity)).toBe(Infinity);
    expect(roundRate(-Infinity)).toBe(-Infinity);
  });
});

describe('formatTime', () => {
  describe('standard minute/second formatting', () => {
    it('formats 0 seconds as 0:00', () => {
      expect(formatTime(0)).toBe('0:00');
    });
    it('formats values under 10 seconds with a leading zero for seconds', () => {
      expect(formatTime(9)).toBe('0:09');
    });
    it('formats exactly 1 minute', () => {
      expect(formatTime(60)).toBe('1:00');
    });
    it('formats standard minute/second combinations', () => {
      expect(formatTime(65)).toBe('1:05');
      expect(formatTime(3599)).toBe('59:59');
    });
  });

  describe('hours formatting', () => {
    it('formats exactly 1 hour', () => {
      expect(formatTime(3600)).toBe('1:00:00');
    });
    it('formats values over an hour with padding for minutes and seconds', () => {
      expect(formatTime(3661)).toBe('1:01:01');
      expect(formatTime(7200)).toBe('2:00:00');
      expect(formatTime(36000)).toBe('10:00:00');
    });
  });

  describe('edge cases and invalid inputs', () => {
    it('handles NaN gracefully', () => {
      expect(formatTime(NaN)).toBe('–:––');
    });
    it('handles Infinity gracefully', () => {
      expect(formatTime(Infinity)).toBe('–:––');
      expect(formatTime(-Infinity)).toBe('–:––');
    });
    it('handles undefined and missing arguments', () => {
      expect(formatTime(undefined)).toBe('–:––');
      expect(formatTime()).toBe('–:––');
    });
    it('handles null (treats as 0)', () => {
      expect(formatTime(null)).toBe('0:00');
    });
    it('clamps negative values to 0', () => {
      expect(formatTime(-5)).toBe('0:00');
      expect(formatTime(-3600)).toBe('0:00');
    });
    it('floors fractional seconds', () => {
      expect(formatTime(5.9)).toBe('0:05');
      expect(formatTime(60.1)).toBe('1:00');
    });
    it('handles string inputs that can be parsed as numbers', () => {
      expect(formatTime('65')).toBe('1:05');
    });
    it('handles string inputs that cannot be parsed as numbers', () => {
      expect(formatTime('abc')).toBe('–:––');
    });
  });
});

describe('_get helper error path', () => {
  it('should fall back to direct property access when the prototype getter throws', () => {
    // Setup a mock video element
    const video = document.createElement('video');
    const propertyName = 'mockProperty';
    const expectedValue = 'fallbackValue';

    // Set the property directly on the object to simulate fallback value
    video[propertyName] = expectedValue;

    // Define a getter on HTMLMediaElement.prototype that will throw
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, propertyName);

    Object.defineProperty(HTMLMediaElement.prototype, propertyName, {
      get: function() {
        throw new Error('Simulated getter error');
      },
      configurable: true
    });

    try {
      // Act
      const result = _get(video, propertyName);

      // Assert
      expect(result).toBe(expectedValue);
    } finally {
      // Cleanup: restore the original property if it existed, or remove it
      if (originalDescriptor) {
        Object.defineProperty(HTMLMediaElement.prototype, propertyName, originalDescriptor);
      } else {
        delete HTMLMediaElement.prototype[propertyName];
      }
    }
  });
});
