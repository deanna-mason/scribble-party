const { test } = require('node:test');
const assert = require('node:assert');
const { getRandomPrompt, getCategories } = require('../prompts');

test('getCategories returns a non-empty array of strings', () => {
    const cats = getCategories();
    assert.ok(Array.isArray(cats));
    assert.ok(cats.length > 0);
    for (const c of cats) assert.strictEqual(typeof c, 'string');
});

test('getRandomPrompt with no args returns {text, category}', () => {
    const result = getRandomPrompt();
    assert.strictEqual(typeof result.text, 'string');
    assert.strictEqual(typeof result.category, 'string');
    assert.ok(result.text.length > 0);
});

test('getRandomPrompt honors category filter', () => {
    const result = getRandomPrompt('silly');
    assert.strictEqual(result.category, 'silly');
});

test('getRandomPrompt excludes already-used prompts', () => {
    const categories = getCategories();
    const allPrompts = [];
    // Collect all prompts
    for (let i = 0; i < 1000; i++) {
        allPrompts.push(getRandomPrompt().text);
    }
    const unique = new Set(allPrompts);
    // Exclude all but one unique prompt and verify the last one comes back
    const remaining = Array.from(unique).slice(0, unique.size - 1);
    const last = Array.from(unique)[unique.size - 1];
    for (let i = 0; i < 100; i++) {
        const result = getRandomPrompt(null, remaining);
        assert.strictEqual(result.text, last);
    }
});

test('getRandomPrompt with unknown category returns null', () => {
    const result = getRandomPrompt('zzz-unknown');
    assert.strictEqual(result, null);
});
