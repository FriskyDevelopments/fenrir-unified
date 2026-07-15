const fs = require('fs');
const file = 'workers/fenrir-stars-payments.js';
let code = fs.readFileSync(file, 'utf8');

const constants = `// ==========================================
// 🎨 CUSTOM ANIMATED EMOJI CONFIGURATION
// Replace these with your Premium Emoji IDs
// E.g., '<tg-emoji emoji-id="5368324170671202286">🔵</tg-emoji>'
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
  code = code.replace(/import \{.*?\} from '.*?';/s, (match) => match + '\n\n' + constants);
}

// 1. Inject HTML parse_mode into telegramApi
code = code.replace(
  /async function telegramApi\(env, channel, method, body\) \{[\s\S]*?const response = await fetch/m,
  `async function telegramApi(env, channel, method, body) {
  const token = botToken(env, channel);
  if (!token) throw new Error("missing_telegram_token");
  
  if ((method === "sendMessage" || method === "sendVideo" || method === "sendPhoto") && !body.parse_mode) {
    body.parse_mode = "HTML";
  }

  const response = await fetch`
);

// 2. Refactor fallbackMind to use HTML and EMOJI
code = code.replace(
  /function fallbackMind\(text, entitlement\) \{[\s\S]*?return modularMenuText\(text, entitlement\);\n\}/m,
  `function fallbackMind(text, entitlement) {
  if (menuIntent(text)) return modularMenuText(text, entitlement);

  if (statusIntent(text)) {
    if (spanishIntent(text)) {
      return entitlement?.status === 'active'
        ? \`\${EMOJI.GREEN} <b>𝗙𝗘𝗡𝗥𝗜𝗥 𝗔𝗖𝗧𝗜𝗩𝗢</b>\\n━━━━━━━━━━━━━━━━━━\\nEl Protocolo Fenrir está operando.\\n\\n🔹 Acceso: Desbloqueado\\n🔹 Stars: \${entitlement.stars_amount}\\n\\n📖 <a href="https://wiki.myfenrir.com">Explora la documentación</a>\`
        : \`\${EMOJI.RED} <b>𝗔𝗖𝗖𝗘𝗦𝗢 𝗗𝗘𝗡𝗘𝗚𝗔𝗗𝗢</b>\\n━━━━━━━━━━━━━━━━━━\\nEl Protocolo Fenrir requiere activación.\\n\\nUsa /subscribe para abrir la caja oficial de Telegram Stars.\\n\\n📖 <a href="https://wiki.myfenrir.com">Explora la documentación</a>\`;
    }
    return entitlement?.status === 'active'
      ? \`\${EMOJI.GREEN} <b>𝗙𝗘𝗡𝗥𝗜𝗥 𝗔𝗖𝗧𝗜𝗩𝗘</b>\\n━━━━━━━━━━━━━━━━━━\\nFenrir Protocol is operating normally.\\n\\n🔹 Access: Unlocked\\n🔹 Stars: \${entitlement.stars_amount}\\n\\n📖 <a href="https://wiki.myfenrir.com">Explore docs</a>\`
      : \`\${EMOJI.RED} <b>𝗔𝗖𝗖𝗘𝗦𝗦 𝗗𝗘𝗡𝗜𝗘𝗗</b>\\n━━━━━━━━━━━━━━━━━━\\nFenrir Protocol requires activation.\\n\\nUse /subscribe to open the official Telegram Stars payment box.\\n\\n📖 <a href="https://wiki.myfenrir.com">Explore docs</a>\`;
  }

  if (pricingIntent(text)) {
    return [
      \`\${EMOJI.GREEN} <b>𝗙𝗘𝗡𝗥𝗜𝗥 𝗣𝗟𝗔𝗡𝗦</b>\`,
      '━━━━━━━━━━━━━━━━━━',
      \`\${EMOJI.WHITE} Free ($0): 1 Telegram Lock, 1 Subdomain\`,
      \`\${EMOJI.BLUE} Starter ($3/mo): 3 Locks, Subdomains\`,
      \`\${EMOJI.RED} Pro ($7/mo): 10 Locks, Custom Domain\`,
      \`\${EMOJI.DIAMOND} Operator ($15/mo): Unlimited Locks, Audit Logs\`,
      '',
      '📖 <a href="https://wiki.myfenrir.com">Plan comparisons</a>',
    ].join('\\n');
  }

  if (stripeIntent(text)) {
    return [
      \`\${EMOJI.BLUE} <b>𝗗𝗜𝗥𝗘𝗖𝗧 𝗕𝗜𝗟𝗟𝗜𝗡𝗚</b>\`,
      '━━━━━━━━━━━━━━━━━━',
      'Gateway: Stripe Secure',
      'Status: Pending backend activation',
      '',
      'Stripe Direct Billing is the professional card and invoice route for Pro and Operator users.',
      '',
      'For now, I can open the official Telegram Stars payment box to instantly activate your tier.',
      '',
      '📖 <a href="https://wiki.myfenrir.com">Read more</a>',
    ].join('\\n');
  }

  if (setupIntent(text)) {
    if (spanishIntent(text)) {
      return [
        \`\${EMOJI.BLUE} <b>𝗦𝗬𝗦𝗧𝗘𝗠 𝗦𝗘𝗧𝗨𝗣</b>\`,
        '━━━━━━━━━━━━━━━━━━',
        'Para conectar tu dominio y grupos:',
        '1. Mapea DNS (CNAME join -> bridge.myfenrir.com)',
        '2. Agrega el bot Fenrir a tu grupo como Admin',
        '3. Genera un Bridge slug seguro',
        '',
        '📖 <a href="https://wiki.myfenrir.com">Guía completa</a>',
      ].join('\\n');
    }
    return [
      \`\${EMOJI.BLUE} <b>𝗦𝗬𝗦𝗧𝗘𝗠 𝗦𝗘𝗧𝗨𝗣</b>\`,
      '━━━━━━━━━━━━━━━━━━',
      'To securely link your domain and groups:',
      '1. Map DNS (CNAME join -> bridge.myfenrir.com)',
      '2. Add Fenrir bot to your Telegram group as Admin',
      '3. Generate a secure Bridge slug',
      '',
      '📖 <a href="https://wiki.myfenrir.com">Full setup guide</a>',
    ].join('\\n');
  }

  return modularMenuText(text, entitlement);
}`
);

fs.writeFileSync(file, code);
