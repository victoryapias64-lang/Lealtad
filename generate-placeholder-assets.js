// Genera pass.json + imágenes PLACEHOLDER para el modelo del pase de Apple.
// Reemplaza los PNG por tu branding real antes de producción.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = path.join(__dirname, '../assets/apple/loyalty.pass');
fs.mkdirSync(dir, { recursive: true });

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) { raw[o + 1 + x * 3] = r; raw[o + 2 + x * 3] = g; raw[o + 3 + x * 3] = b; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const color = [99, 102, 241];
const files = {
  'icon.png': png(29, 29, color), 'icon@2x.png': png(58, 58, color), 'icon@3x.png': png(87, 87, color),
  'logo.png': png(160, 50, color), 'logo@2x.png': png(320, 100, color),
};
for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), buf);

// El tipo de pase (storeCard) se declara aquí; los campos y colores se agregan en apple.service.js
fs.writeFileSync(path.join(dir, 'pass.json'), JSON.stringify({ formatVersion: 1, storeCard: {} }, null, 2));
console.log('Assets generados en', dir);
