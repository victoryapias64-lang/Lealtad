const fs = require('fs');
const { PKPass } = require('passkit-generator');
const config = require('../config');
const { HttpError } = require('../utils/errors');

function isConfigured() {
  const { passTypeIdentifier, teamIdentifier, certs } = config.apple;
  return Boolean(
    passTypeIdentifier && teamIdentifier &&
    [certs.wwdr, certs.signerCert, certs.signerKey].every((f) => f && fs.existsSync(f)),
  );
}

function loadCertificates() {
  if (!isConfigured()) {
    throw new HttpError(503, 'Apple Wallet no está configurado (revisa APPLE_* y los .pem en /certs)');
  }
  const { wwdr, signerCert, signerKey, signerKeyPassphrase } = config.apple.certs;
  return {
    wwdr: fs.readFileSync(wwdr),
    signerCert: fs.readFileSync(signerCert),
    signerKey: fs.readFileSync(signerKey),
    signerKeyPassphrase,
  };
}

// Genera el .pkpass (Buffer) con el estado actual de la tarjeta.
async function buildPkpass(card) {
  const { program, apple, baseUrl } = config;

  const pass = await PKPass.from(
    { model: apple.modelDir, certificates: loadCertificates() },
    {
      serialNumber: card.serial,
      authenticationToken: card.auth_token,
      webServiceURL: `${baseUrl}/apple`, // Wallet llamará a /apple/v1/...
      passTypeIdentifier: apple.passTypeIdentifier,
      teamIdentifier: apple.teamIdentifier,
      organizationName: program.name,
      description: `Tarjeta de fidelización ${program.name}`,
      logoText: program.name,
      backgroundColor: program.bg,
      foregroundColor: program.fg,
      labelColor: program.label,
    },
  );

  const need = program.stampsRequired;
  const rewardText = card.pending_rewards > 0
    ? `${program.rewardDiscountPct}% OFF x${card.pending_rewards}`
    : `Junta ${need} sellos`;

  // changeMessage con %@ => Wallet muestra la notificación en pantalla de bloqueo cuando cambia el valor.
  pass.headerFields.push({
    key: 'cashback', label: 'CASHBACK', value: card.cashback_cents / 100,
    currencyCode: program.currency, changeMessage: 'Tu cashback ahora es %@',
  });
  pass.primaryFields.push({
    key: 'stamps', label: 'SELLOS', value: `${card.stamps} / ${need}`,
    changeMessage: 'Llevas %@ sellos',
  });
  pass.secondaryFields.push(
    { key: 'reward', label: 'DESCUENTO', value: rewardText, changeMessage: 'Descuento: %@' },
    { key: 'member', label: 'MIEMBRO', value: card.name },
  );
  pass.backFields.push(
    { key: 'terms', label: 'Cómo funciona', value: `Cada compra suma sellos. Al juntar ${need} ganas ${program.rewardDiscountPct}% de descuento. Además acumulas ${(program.cashbackRate * 100).toFixed(0)}% de cashback.` },
    { key: 'id', label: 'ID de tarjeta', value: card.serial },
  );

  // El QR contiene el serial: es lo que lee el POS y envía a POST /api/scan
  pass.setBarcodes({ message: card.serial, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' });

  return pass.getAsBuffer();
}

module.exports = { isConfigured, buildPkpass };
