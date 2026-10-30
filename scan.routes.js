const router = require('express').Router();
const { z } = require('zod');
const config = require('../config');
const loyalty = require('../services/loyalty.service');
const notifier = require('../services/notification.service');
const validate = require('../middlewares/validate');
const { staffAuth } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');

const { program } = config;

const scanSchema = z
  .object({
    code: z.string().min(8, 'code = serial leído del QR'),
    stamps: z.number().int().min(0).max(20).default(1),
    amount: z.number().nonnegative().optional(), // monto de la compra (para cashback)
  })
  .refine((v) => v.stamps > 0 || (v.amount ?? 0) > 0, { message: 'Envía stamps o amount' });

// POST /api/scan  -> suma sellos/cashback y notifica a Apple y Google Wallet
router.post('/scan', staffAuth, validate(scanSchema), asyncHandler(async (req, res) => {
  const { code, stamps, amount = 0 } = req.body;
  const { card, unlocked, cashbackEarned } = loyalty.applyScan({
    serial: code,
    stamps,
    amountCents: Math.round(amount * 100),
  });

  const message = unlocked > 0
    ? `¡Completaste tu tarjeta! Tienes ${program.rewardDiscountPct}% de descuento disponible.`
    : `+${stamps} sello(s). Llevas ${card.stamps}/${program.stampsRequired}.`;

  // No bloquea la respuesta al POS; el resultado queda en logs.
  notifier.notifyCardUpdated(card, message).catch((e) => console.error('[notify]', e));

  res.json({
    ok: true,
    stampsAdded: stamps,
    cashbackEarned: cashbackEarned / 100,
    rewardsUnlocked: unlocked,
    message,
    card: loyalty.publicCard(card),
  });
}));

// POST /api/redeem -> canjea un descuento disponible
router.post('/redeem', staffAuth, validate(z.object({ code: z.string().min(8) })), asyncHandler(async (req, res) => {
  const card = loyalty.redeemReward(req.body.code);
  const message = 'Descuento canjeado. ¡Gracias por tu visita!';
  notifier.notifyCardUpdated(card, message).catch((e) => console.error('[notify]', e));
  res.json({ ok: true, message, card: loyalty.publicCard(card) });
}));

module.exports = router;
