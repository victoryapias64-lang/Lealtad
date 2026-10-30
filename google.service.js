const fs = require('fs');
const jwt = require('jsonwebtoken');
const { GoogleAuth } = require('google-auth-library');
const config = require('../config');
const { HttpError } = require('../utils/errors');

const BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';
const { program, google } = config;

let creds = null;
let auth = null;

function isConfigured() {
  return Boolean(google.issuerId && google.serviceAccountFile && fs.existsSync(google.serviceAccountFile));
}

function loadCreds() {
  if (!isConfigured()) {
    throw new HttpError(503, 'Google Wallet no está configurado (revisa GOOGLE_* y el JSON de la cuenta de servicio)');
  }
  if (!creds) creds = JSON.parse(fs.readFileSync(google.serviceAccountFile, 'utf8'));
  return creds;
}

function getClient() {
  if (!auth) {
    auth = new GoogleAuth({
      credentials: loadCreds(),
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
    });
  }
  return auth.getClient();
}

async function api(method, path, data) {
  const client = await getClient();
  try {
    const res = await client.request({ url: `${BASE}${path}`, method, data });
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    const detail = JSON.stringify(err.response?.data?.error || err.message);
    throw new Error(`Google Wallet ${method} ${path} -> ${err.response?.status || ''} ${detail}`);
  }
}

const classId = () => `${google.issuerId}.${google.classSuffix}`;
const objectId = (serial) => `${google.issuerId}.${serial}`;

function rewardText(card) {
  return card.pending_rewards > 0
    ? `${program.rewardDiscountPct}% de descuento x${card.pending_rewards}`
    : `Junta ${program.stampsRequired} sellos y gana ${program.rewardDiscountPct}% de descuento`;
}

function dynamicFields(card) {
  return {
    loyaltyPoints: { label: 'Sellos', balance: { string: `${card.stamps} / ${program.stampsRequired}` } },
    secondaryLoyaltyPoints: {
      label: 'Cashback',
      balance: { money: { micros: card.cashback_cents * 10000, currencyCode: program.currency } },
    },
    textModulesData: [{ id: 'reward', header: 'Descuento disponible', body: rewardText(card) }],
  };
}

function buildObject(card) {
  return {
    id: objectId(card.serial),
    classId: classId(),
    state: 'ACTIVE',
    accountId: card.customer_id,
    accountName: card.name,
    barcode: { type: 'QR_CODE', value: card.serial, alternateText: card.serial.slice(0, 8) },
    ...dynamicFields(card),
  };
}

// Crea la clase (plantilla) del programa si aún no existe. Ejecutar una vez: npm run setup:google
async function ensureLoyaltyClass() {
  const id = classId();
  if (await api('GET', `/loyaltyClass/${id}`)) return { id, created: false };
  await api('POST', '/loyaltyClass', {
    id,
    issuerName: program.name,
    programName: program.name,
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: program.hex,
    programLogo: {
      sourceUri: { uri: google.logoUrl },
      contentDescription: { defaultValue: { language: 'es', value: `Logo de ${program.name}` } },
    },
  });
  return { id, created: true };
}

// JWT firmado (RS256) con el objeto embebido -> enlace "Agregar a Google Wallet".
function createSaveUrl(card) {
  const { client_email: email, private_key: key } = loadCreds();
  const token = jwt.sign(
    {
      iss: email,
      aud: 'google',
      typ: 'savetowallet',
      origins: google.origins,
      iat: Math.floor(Date.now() / 1000),
      payload: { loyaltyObjects: [buildObject(card)] },
    },
    key,
    { algorithm: 'RS256' },
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}

// Actualiza el objeto ya guardado en la wallet y, opcionalmente, envía un mensaje con notificación.
async function syncObject(card, message) {
  const id = objectId(card.serial);
  const patched = await api('PATCH', `/loyaltyObject/${id}`, dynamicFields(card));
  if (!patched) return { updated: false, reason: 'El cliente aún no agregó la tarjeta a Google Wallet' };

  if (message) {
    await api('POST', `/loyaltyObject/${id}/addMessage`, {
      message: { header: program.name, body: message, messageType: 'TEXT_AND_NOTIFY' },
    });
  }
  return { updated: true, notified: Boolean(message) };
}

module.exports = { isConfigured, ensureLoyaltyClass, createSaveUrl, syncObject };
