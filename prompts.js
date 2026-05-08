//This file handles helping a player get a random prompt to draw. 
// It can also return a prompt from a specific category and will exclude previously given prompts for that game.

const path = require('path');
const fs = require('fs');

const DATA = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'prompts.json'), 'utf8')
);

function getCategories() {
    return Object.keys(DATA);
}

function getRandomPrompt(category = null, excluded = []) {
    let pool;
    if (category) {
        if (!DATA[category]) return null;
        pool = DATA[category].map((text) => ({ text, category }));
    } else {
        pool = [];
        for (const [cat, items] of Object.entries(DATA)) {
            for (const text of items) pool.push({ text, category: cat });
        }
    }
    const excludedSet = new Set(excluded);
    const filtered = pool.filter((p) => !excludedSet.has(p.text));
    if (filtered.length === 0) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
}

module.exports = { getRandomPrompt, getCategories };
