// Crea la clase de lealtad en Google Wallet (una sola vez).
const google = require('../src/services/google.service');

google.ensureLoyaltyClass()
  .then((r) => console.log(r.created ? 'Clase creada:' : 'La clase ya existía:', r.id))
  .catch((e) => { console.error(e.message); process.exit(1); });
