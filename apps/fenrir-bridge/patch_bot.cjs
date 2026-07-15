const fs = require('fs');
const file = 'workers/fenrir-stars-payments.js';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /function fallbackMind\(text, entitlement\) \{[\s\S]*?if \(setupIntent\(text\)\) \{/,
  `function fallbackMind(text, entitlement) {
  if (menuIntent(text)) return modularMenuText(text, entitlement);

  if (statusIntent(text)) {
    if (spanishIntent(text)) {
      return entitlement?.status === 'active'
        ? \`🟢 𝗙𝗘𝗡𝗥𝗜𝗥 𝗔𝗖𝗧𝗜𝗩𝗢\\n━━━━━━━━━━━━━━━━━━\\nEl Protocolo Fenrir está operando.\\n\\n🔹 Acceso: Desbloqueado\\n🔹 Stars: \${entitlement.stars_amount}\\n\\n📖 Wiki: wiki.myfenrir.com\`
        : \`🔴 𝗔𝗖𝗖𝗘𝗦𝗢 𝗗𝗘𝗡𝗘𝗚𝗔𝗗𝗢\\n━━━━━━━━━━━━━━━━━━\\nEl Protocolo requiere activación.\\n\\nUsa /subscribe para abrir la caja oficial de Telegram Stars.\\n\\n📖 Wiki: wiki.myfenrir.com\`;
    }
    return entitlement?.status === 'active'
      ? \`🟢 𝗙𝗘𝗡𝗥𝗜𝗥 𝗔𝗖𝗧𝗜𝗩𝗘\\n━━━━━━━━━━━━━━━━━━\\nFenrir Protocol is operating normally.\\n\\n🔹 Access: Unlocked\\n🔹 Stars: \${entitlement.stars_amount}\\n\\n📖 Wiki: wiki.myfenrir.com\`
      : \`🔴 𝗔𝗖𝗖𝗘𝗦𝗦 𝗗𝗘𝗡𝗜𝗘𝗗\\n━━━━━━━━━━━━━━━━━━\\nFenrir Protocol requires activation.\\n\\nUse /subscribe to open the official Telegram Stars payment box.\\n\\n📖 Wiki: wiki.myfenrir.com\`;
  }

  if (pricingIntent(text)) {
    return [
      '🟢 𝗙𝗘𝗡𝗥𝗜𝗥 𝗣𝗟𝗔𝗡𝗦',
      '━━━━━━━━━━━━━━━━━━',
      '⚪️ Free ($0): 1 Telegram Lock, 1 Subdomain',
      '🔵 Starter ($3/mo): 3 Locks, Subdomains',
      '🔴 Pro ($7/mo): 10 Locks, Custom Domain',
      '💎 Operator ($15/mo): Unlimited Locks, Audit Logs',
      '',
      '📖 Plan comparisons: wiki.myfenrir.com',
    ].join('\\n');
  }

  if (stripeIntent(text)) {
    return [
      '🔵 𝗗𝗜𝗥𝗘𝗖𝗧 𝗕𝗜𝗟𝗟𝗜𝗡𝗚',
      '━━━━━━━━━━━━━━━━━━',
      'Gateway: Stripe Secure',
      'Status: Pending backend activation',
      '',
      'Stripe Direct Billing is the professional card and invoice route for Pro and Operator users.',
      '',
      'For now, I can open the official Telegram Stars payment box to instantly activate your tier.',
      '',
      '📖 Read more: wiki.myfenrir.com',
    ].join('\\n');
  }

  if (setupIntent(text)) {`
);

fs.writeFileSync(file, code);
