const fs = require('fs');
const http2 = require('http2');
const config = require('../config');

let session = null;

function getSession() {
  if (session && !session.closed && !session.destroyed) return session;
  const { signerCert, signerKey, signerKeyPassphrase } = config.apple.certs;
  const s = http2.connect(`https://${config.apple.apnsHost}`, {
    cert: fs.readFileSync(signerCert), // el certificado Pass Type ID sirve también para APNs
    key: fs.readFileSync(signerKey),
    passphrase: signerKeyPassphrase,
  });
  const reset = () => { if (session === s) session = null; };
  s.on('error', reset);
  s.on('close', reset);
  s.on('goaway', reset);
  s.unref();
  session = s;
  return s;
}

// Push vacío: Wallet responde descargando el pase actualizado desde nuestro web service.
function push(pushToken) {
  return new Promise((resolve) => {
    let req;
    try {
      req = getSession().request({
        ':method': 'POST',
        ':path': `/3/device/${pushToken}`,
        'apns-topic': config.apple.passTypeIdentifier,
      });
    } catch (e) {
      return resolve({ pushToken, status: 0, error: e.message });
    }
    let status = 0;
    let body = '';
    req.setEncoding('utf8');
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', (c) => { body += c; });
    req.on('end', () => resolve({ pushToken, status, body }));
    req.on('error', (e) => resolve({ pushToken, status: 0, error: e.message }));
    req.setTimeout(10000, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.end('{}');
  });
}

module.exports = { push };
