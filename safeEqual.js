const crypto = require('crypto');

// Comparación en tiempo constante para claves y tokens.
module.exports = function safeEqual(a, b) {
  const A = Buffer.from(String(a ?? ''));
  const B = Buffer.from(String(b ?? ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};
