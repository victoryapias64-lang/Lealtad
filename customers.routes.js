const router = require('express').Router();
const { z } = require('zod');
const config = require('../config');
const loyalty = require('../services/loyalty.service');
const apple = require('../services/apple.service');
const google = require('../services/google.service');
const validate = require('../middlewares/validate');
const { staffAuth } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/errors');

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).optional(),
});

function findCard(req) {
  const card = loyalty.getCardByCustomerId(req.params.id);
  if (!card) throw new HttpError(404, 'Cliente no encontrado');
  return card;
}

// Registrar cliente (idempotente por email) -> devuelve enlaces para agregar a cada wallet.
router.post('/', validate(registerSchema), asyncHandler(async (req, res) => {
  const { created, card } = loyalty.registerCustomer(req.body);
  const base = `${config.baseUrl}/api/customers/${card.customer_id}`;
  res.status(created ? 201 : 200).json({
    created,
    customerId: card.customer_id,
    serial: card.serial,
    links: { apple: `${base}/apple`, google: `${base}/google` },
    card: loyalty.publicCard(card),
  });
}));

// Estado de la tarjeta (solo personal)
router.get('/:id', staffAuth, asyncHandler(async (req, res) => {
  res.json(loyalty.publicCard(findCard(req)));
}));

// Descargar .pkpass de Apple Wallet
router.get('/:id/apple', asyncHandler(async (req, res) => {
  const card = findCard(req);
  const buffer = await apple.buildPkpass(card);
  res
    .set('Content-Type', 'application/vnd.apple.pkpass')
    .set('Content-Disposition', 'attachment; filename="fidelidad.pkpass"')
    .send(buffer);
}));

// Enlace "Agregar a Google Wallet" (JWT firmado). ?redirect=1 redirige directamente.
router.get('/:id/google', asyncHandler(async (req, res) => {
  const card = findCard(req);
  const saveUrl = google.createSaveUrl(card);
  if (req.query.redirect === '1') return res.redirect(saveUrl);
  res.json({ saveUrl });
}));

module.exports = router;
