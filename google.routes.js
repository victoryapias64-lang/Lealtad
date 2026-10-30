const router = require('express').Router();
const loyalty = require('../services/loyalty.service');
const google = require('../services/google.service');
const { staffAuth } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/errors');

// Fuerza la sincronización del objeto de Google Wallet con el estado actual (solo personal).
router.post('/sync/:serial', staffAuth, asyncHandler(async (req, res) => {
  const card = loyalty.getCardBySerial(req.params.serial);
  if (!card) throw new HttpError(404, 'Tarjeta no encontrada');
  res.json(await google.syncObject(card, req.body?.message));
}));

module.exports = router;
