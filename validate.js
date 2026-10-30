const { HttpError } = require('../utils/errors');

module.exports = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return next(new HttpError(400, 'Datos inválidos', parsed.error.flatten().fieldErrors));
  }
  req.body = parsed.data;
  next();
};
