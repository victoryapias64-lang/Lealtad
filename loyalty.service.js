const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('../utils/errors');

const CARD_SELECT = `
  SELECT c.serial, c.customer_id, c.auth_token, c.stamps, c.cashback_cents,
         c.pending_rewards, c.total_rewards, c.updated_at, u.name, u.email
  FROM cards c JOIN customers u ON u.id = c.customer_id`;

const getCardBySerial = (serial) => db.prepare(`${CARD_SELECT} WHERE c.serial = ?`).get(serial);
const getCardByCustomerId = (id) => db.prepare(`${CARD_SELECT} WHERE c.customer_id = ?`).get(id);

// Vista pública (sin token de autenticación).
const publicCard = (c) => ({
  serial: c.serial,
  customerId: c.customer_id,
  name: c.name,
  stamps: c.stamps,
  stampsRequired: config.program.stampsRequired,
  cashback: c.cashback_cents / 100,
  currency: config.program.currency,
  pendingRewards: c.pending_rewards,
  rewardDiscountPct: config.program.rewardDiscountPct,
  totalRewards: c.total_rewards,
});

function registerCustomer({ name, email, phone }) {
  const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
  if (existing) return { created: false, card: getCardByCustomerId(existing.id) };

  const id = crypto.randomUUID();
  const serial = crypto.randomUUID();
  const authToken = crypto.randomBytes(24).toString('hex');

  db.transaction(() => {
    db.prepare('INSERT INTO customers (id, name, email, phone) VALUES (?, ?, ?, ?)').run(id, name, email, phone ?? null);
    db.prepare('INSERT INTO cards (serial, customer_id, auth_token, updated_at) VALUES (?, ?, ?, ?)').run(
      serial, id, authToken, Date.now(),
    );
  })();

  return { created: true, card: getCardByCustomerId(id) };
}

// Suma sellos y cashback; si se completa la tarjeta, desbloquea descuento(s).
function applyScan({ serial, stamps = 1, amountCents = 0 }) {
  const tx = db.transaction(() => {
    const card = getCardBySerial(serial);
    if (!card) throw new HttpError(404, 'Tarjeta no encontrada');

    const need = config.program.stampsRequired;
    let total = card.stamps + stamps;
    let unlocked = 0;
    while (total >= need) {
      total -= need;
      unlocked += 1;
    }
    const cashback = Math.round(amountCents * config.program.cashbackRate);

    db.prepare(`
      UPDATE cards SET stamps = ?, cashback_cents = cashback_cents + ?,
        pending_rewards = pending_rewards + ?, total_rewards = total_rewards + ?, updated_at = ?
      WHERE serial = ?`).run(total, cashback, unlocked, unlocked, Date.now(), serial);

    db.prepare(`
      INSERT INTO transactions (serial, stamps_added, amount_cents, cashback_cents, rewards_unlocked)
      VALUES (?, ?, ?, ?, ?)`).run(serial, stamps, amountCents, cashback, unlocked);

    return { card: getCardBySerial(serial), unlocked, cashbackEarned: cashback };
  });
  return tx();
}

// Canjea un descuento disponible.
function redeemReward(serial) {
  const tx = db.transaction(() => {
    const card = getCardBySerial(serial);
    if (!card) throw new HttpError(404, 'Tarjeta no encontrada');
    if (card.pending_rewards < 1) throw new HttpError(409, 'No hay descuentos disponibles');
    db.prepare('UPDATE cards SET pending_rewards = pending_rewards - 1, updated_at = ? WHERE serial = ?').run(
      Date.now(), serial,
    );
    return getCardBySerial(serial);
  });
  return tx();
}

/* ---------- Registros de dispositivos Apple Wallet ---------- */

function registerDevice({ deviceId, serial, pushToken }) {
  const existed = db.prepare('SELECT 1 FROM apple_registrations WHERE device_id = ? AND serial = ?').get(deviceId, serial);
  db.prepare(`
    INSERT INTO apple_registrations (device_id, serial, push_token) VALUES (?, ?, ?)
    ON CONFLICT(device_id, serial) DO UPDATE SET push_token = excluded.push_token`).run(deviceId, serial, pushToken);
  return !existed; // true si es un registro nuevo
}

function unregisterDevice({ deviceId, serial }) {
  db.prepare('DELETE FROM apple_registrations WHERE device_id = ? AND serial = ?').run(deviceId, serial);
}

function getUpdatedSerials(deviceId, since = 0) {
  const rows = db.prepare(`
    SELECT c.serial, c.updated_at FROM apple_registrations r
    JOIN cards c ON c.serial = r.serial
    WHERE r.device_id = ? AND c.updated_at > ?`).all(deviceId, since);
  return {
    serialNumbers: rows.map((r) => r.serial),
    lastUpdated: String(rows.reduce((m, r) => Math.max(m, r.updated_at), since)),
  };
}

const getPushTokens = (serial) =>
  db.prepare('SELECT DISTINCT push_token FROM apple_registrations WHERE serial = ?').all(serial).map((r) => r.push_token);

const dropPushToken = (token) => db.prepare('DELETE FROM apple_registrations WHERE push_token = ?').run(token);

module.exports = {
  getCardBySerial, getCardByCustomerId, publicCard, registerCustomer, applyScan, redeemReward,
  registerDevice, unregisterDevice, getUpdatedSerials, getPushTokens, dropPushToken,
};
