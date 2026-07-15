const fs = require('fs');
const file = 'workers/fenrir-stars-payments.js';
let code = fs.readFileSync(file, 'utf8');

const constants = `
// ==========================================
// 🎨 CUSTOM ANIMATED EMOJI CONFIGURATION
// Replace these with your Premium Emoji IDs
// E.g., '5368324170671202286'
// ==========================================
const EMOJI = {
  BLUE: '<tg-emoji emoji-id="5422955523995583563">🔵</tg-emoji>',
  GREEN: '<tg-emoji emoji-id="5422955523995583564">🟢</tg-emoji>',
  RED: '<tg-emoji emoji-id="5422955523995583565">🔴</tg-emoji>',
  DIAMOND: '<tg-emoji emoji-id="5422955523995583566">💎</tg-emoji>',
  WHITE: '<tg-emoji emoji-id="5422955523995583567">⚪️</tg-emoji>'
};
`;

if (!code.includes('const EMOJI = {')) {
  code = code.replace(/import \{.*?\} from '.*?';/s, (match) => match + '\n' + constants);
}

// Modify fallbackMind to use the constants
code = code.replace(/🔵/g, '${EMOJI.BLUE}');
code = code.replace(/🟢/g, '${EMOJI.GREEN}');
code = code.replace(/🔴/g, '${EMOJI.RED}');
code = code.replace(/💎/g, '${EMOJI.DIAMOND}');
code = code.replace(/⚪️/g, '${EMOJI.WHITE}');

// Fix the single quotes to backticks in fallbackMind to evaluate variables, wait, it's safer to do this manually.
