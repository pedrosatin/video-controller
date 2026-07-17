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

const { _get, _set } = require('./content');

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
