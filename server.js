const config = require('./config');
const db = require('./db');
const app = require('./app');
const apple = require('./services/apple.service');
const google = require('./services/google.service');

const server = app.listen(config.port, () => {
  console.log(`Fidelidad Wallet API en ${config.baseUrl} (puerto ${config.port})`);
  console.log(`  Apple Wallet : ${apple.isConfigured() ? 'configurado' : 'SIN configurar'}`);
  console.log(`  Google Wallet: ${google.isConfigured() ? 'configurado' : 'SIN configurar'}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
