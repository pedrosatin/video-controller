const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');

test('roundRate function', async (t) => {
  // Extract the function from content.js
  const code = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');

  // Find the function definition
  const match = code.match(/function roundRate\([^)]*\)\s*\{[^}]*\}/);
  if (!match) {
    throw new Error('Could not find roundRate function in content.js');
  }

  // Create a callable function from the matched string
  // It looks like: function roundRate(r) { return Math.round(r * 100) / 100; }
  const roundRate = new Function(`return ${match[0]}`)();

  await t.test('rounds strictly to 2 decimal places', () => {
    assert.strictEqual(roundRate(1.234), 1.23);
    assert.strictEqual(roundRate(1.235), 1.24);
    assert.strictEqual(roundRate(1.239), 1.24);
  });

  await t.test('preserves exact 2 decimal places', () => {
    assert.strictEqual(roundRate(1.23), 1.23);
    assert.strictEqual(roundRate(2), 2);
    assert.strictEqual(roundRate(0), 0);
  });

  await t.test('handles negative values correctly', () => {
    assert.strictEqual(roundRate(-1.234), -1.23);
    assert.strictEqual(roundRate(-1.236), -1.24);
  });

  await t.test('handles edge cases', () => {
    assert.ok(Number.isNaN(roundRate(NaN)));
    assert.strictEqual(roundRate(Infinity), Infinity);
    assert.strictEqual(roundRate(-Infinity), -Infinity);
  });
});
