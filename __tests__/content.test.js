const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');

// Extract the formatTime function dynamically from content.js
const contentJs = fs.readFileSync('./content.js', 'utf8');
const match = contentJs.match(/function formatTime[\s\S]*?^  \}/m);

if (!match) {
  throw new Error("Could not find formatTime function in content.js");
}

const formatTime = new Function(`
  ${match[0]}
  return formatTime;
`)();

test('formatTime - Standard minute/second formatting', async (t) => {
  await t.test('formats 0 seconds as 0:00', () => {
    assert.strictEqual(formatTime(0), '0:00');
  });

  await t.test('formats values under 10 seconds with a leading zero for seconds', () => {
    assert.strictEqual(formatTime(9), '0:09');
  });

  await t.test('formats exactly 1 minute', () => {
    assert.strictEqual(formatTime(60), '1:00');
  });

  await t.test('formats standard minute/second combinations', () => {
    assert.strictEqual(formatTime(65), '1:05');
    assert.strictEqual(formatTime(3599), '59:59');
  });
});

test('formatTime - Hours formatting', async (t) => {
  await t.test('formats exactly 1 hour', () => {
    assert.strictEqual(formatTime(3600), '1:00:00');
  });

  await t.test('formats values over an hour with padding for minutes and seconds', () => {
    assert.strictEqual(formatTime(3661), '1:01:01');
    assert.strictEqual(formatTime(7200), '2:00:00');
    assert.strictEqual(formatTime(36000), '10:00:00');
  });
});

test('formatTime - Edge cases and invalid inputs', async (t) => {
  await t.test('handles NaN gracefully', () => {
    assert.strictEqual(formatTime(NaN), '–:––');
  });

  await t.test('handles Infinity gracefully', () => {
    assert.strictEqual(formatTime(Infinity), '–:––');
    assert.strictEqual(formatTime(-Infinity), '–:––');
  });

  await t.test('handles undefined and missing arguments', () => {
    assert.strictEqual(formatTime(undefined), '–:––');
    assert.strictEqual(formatTime(), '–:––');
  });

  await t.test('handles null (treats as 0)', () => {
    assert.strictEqual(formatTime(null), '0:00');
  });

  await t.test('clamps negative values to 0', () => {
    assert.strictEqual(formatTime(-5), '0:00');
    assert.strictEqual(formatTime(-3600), '0:00');
  });

  await t.test('floors fractional seconds', () => {
    assert.strictEqual(formatTime(5.9), '0:05');
    assert.strictEqual(formatTime(60.1), '1:00');
  });

  await t.test('handles string inputs that can be parsed as numbers', () => {
    assert.strictEqual(formatTime('65'), '1:05');
  });

  await t.test('handles string inputs that cannot be parsed as numbers', () => {
    assert.strictEqual(formatTime('abc'), '–:––');
  });
});
