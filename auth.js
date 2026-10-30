const config = require('../config');
const loyalty = require('../services/loyalty.service');
const safeEqual = require('../utils/safeEqual');
const { HttpError } = require('../utils/errors');

// Personal / POS: header x-api-key
function staffAuth(req, _res, next) {
  if (!safeEqual(req.get('x-api-key'), config.staffApiKey)) {
    return next(new HttpError(401, 'API key inválida'));
  }
  next();
}

// Apple Wallet web service: Authorization: ApplePass <authenticationToken>
function applePassAuth(req, _res, next) {
  const { passTypeId, serial } = req.params;
  if (passTypeId && passTypeId !== config.apple.passTypeIdentifier) {
    return next(new HttpError(401, 'passTypeIdentifier inválido'));
  }
  const token = (req.get('authorization') || '').replace(/^ApplePass\s+/i, '');
  const card = loyalty.getCardBySerial(serial);
  if (!card || !safeEqual(token, card.auth_token)) {
    return next(new HttpError(401, 'No autorizado'));
  }
  req.card = card;
  next();
}

module.exports = { staffAuth, applePassAuth };
