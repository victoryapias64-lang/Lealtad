const apple = require('./apple.service');
const apns = require('./apns.service');
const google = require('./google.service');
const loyalty = require('./loyalty.service');

async function pushApple(card) {
  if (!apple.isConfigured()) return { skipped: 'Apple Wallet no configurado' };
  const tokens = loyalty.getPushTokens(card.serial);
  if (!tokens.length) return { sent: 0, note: 'Sin dispositivos registrados' };

  const results = await Promise.all(tokens.map((t) => apns.push(t)));
  // 410 = token ya no válido (pase eliminado del dispositivo)
  results.filter((r) => r.status === 410).forEach((r) => loyalty.dropPushToken(r.pushToken));
  return { sent: results.filter((r) => r.status === 200).length, total: tokens.length };
}

async function pushGoogle(card, message) {
  if (!google.isConfigured()) return { skipped: 'Google Wallet no configurado' };
  return google.syncObject(card, message);
}

const summarize = (r) => (r.status === 'fulfilled' ? r.value : { error: r.reason?.message || String(r.reason) });

// Actualiza ambas wallets en paralelo; un fallo en una no afecta a la otra.
async function notifyCardUpdated(card, message) {
  const [a, g] = await Promise.allSettled([pushApple(card), pushGoogle(card, message)]);
  const out = { apple: summarize(a), google: summarize(g) };
  console.log(`[notify] ${card.serial}`, JSON.stringify(out));
  return out;
}

module.exports = { notifyCardUpdated };
