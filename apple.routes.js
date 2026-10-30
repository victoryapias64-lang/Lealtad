// Apple Wallet Web Service (PassKit). Wallet lo consume vía webServiceURL = BASE_URL/apple
const router = require('express').Router();
const loyalty = require('../services/loyalty.service');
const apple = require('../services/apple.service');
const { applePassAuth } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/errors');

// Registrar dispositivo para recibir push
router.post('/v1/devices/:deviceId/registrations/:passTypeId/:serial', applePassAuth, (req, res, next) => {
  const pushToken = req.body?.pushToken;
  if (!pushToken) return next(new HttpError(400, 'Falta pushToken'));
  const isNew = loyalty.registerDevice({ deviceId: req.params.deviceId, serial: req.params.serial, pushToken });
  res.sendStatus(isNew ? 201 : 200);
});

// Quitar registro (el usuario eliminó el pase)
router.delete('/v1/devices/:deviceId/registrations/:passTypeId/:serial', applePassAuth, (req, res) => {
  loyalty.unregisterDevice({ deviceId: req.params.deviceId, serial: req.params.serial });
  res.sendStatus(200);
});

// Serials actualizados desde passesUpdatedSince (Wallet llama esto tras recibir el push)
router.get('/v1/devices/:deviceId/registrations/:passTypeId', (req, res) => {
  if (req.params.passTypeId !== require('../config').apple.passTypeIdentifier) return res.sendStatus(401);
  const since = Number(req.query.passesUpdatedSince) || 0;
  const { serialNumbers, lastUpdated } = loyalty.getUpdatedSerials(req.params.deviceId, since);
  if (!serialNumbers.length) return res.sendStatus(204);
  res.json({ serialNumbers, lastUpdated });
});

// Descargar la última versión del pase
router.get('/v1/passes/:passTypeId/:serial', applePassAuth, asyncHandler(async (req, res) => {
  const card = loyalty.getCardBySerial(req.params.serial);
  const lastModified = Math.floor(card.updated_at / 1000);
  const ims = req.get('if-modified-since');
  if (ims && lastModified <= Math.floor(Date.parse(ims) / 1000)) return res.sendStatus(304);

  const buffer = await apple.buildPkpass(card);
  res
    .set('Content-Type', 'application/vnd.apple.pkpass')
    .set('Last-Modified', new Date(lastModified * 1000).toUTCString())
    .send(buffer);
}));

// Logs de errores que envía Wallet
router.post('/v1/log', (req, res) => {
  console.log('[apple-log]', JSON.stringify(req.body?.logs ?? req.body));
  res.sendStatus(200);
});

module.exports = router;
