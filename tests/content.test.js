const fs = require('fs');
const path = require('path');

// Read the content script
const contentPath = path.join(__dirname, '..', 'content.js');
const content = fs.readFileSync(contentPath, 'utf8');

// Extract the clamp function
const clampMatch = content.match(/function clamp\s*\([^)]*\)\s*{[^}]*}/);

if (!clampMatch) {
  throw new Error('Could not find clamp function in content.js');
}

// Evaluate the clamp function so it's available in this scope
eval(clampMatch[0]);

describe('clamp function', () => {
  test('returns the value when it is within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('returns the lower bound when value is below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  test('returns the upper bound when value is above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  test('handles boundary values correctly', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  test('handles negative boundaries', () => {
    expect(clamp(-15, -20, -10)).toBe(-15);
    expect(clamp(-25, -20, -10)).toBe(-20);
    expect(clamp(-5, -20, -10)).toBe(-10);
  });

  test('handles float/decimal boundaries', () => {
    expect(clamp(5.5, 0.5, 10.5)).toBe(5.5);
    expect(clamp(0.1, 0.5, 10.5)).toBe(0.5);
    expect(clamp(15.5, 0.5, 10.5)).toBe(10.5);
  });

  test('handles edge case when min equals max', () => {
    expect(clamp(5, 10, 10)).toBe(10);
    expect(clamp(15, 10, 10)).toBe(10);
  });

  test('handles Infinity', () => {
    expect(clamp(Infinity, 0, 10)).toBe(10);
    expect(clamp(-Infinity, 0, 10)).toBe(0);
  });

  test('handles NaN value', () => {
    expect(clamp(NaN, 0, 10)).toBeNaN();
  });
});
