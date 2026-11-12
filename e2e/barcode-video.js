// Writes a short Y4M video of an EAN-13 barcode, to feed Chromium's fake camera in tests.
const fs = require('fs');

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Adds the check digit to 12 digits. */
function ean13(first12) {
  const d = first12.split('').map(Number);
  const sum = d.reduce((acc, x, i) => acc + x * (i % 2 === 0 ? 1 : 3), 0);
  return first12 + String((10 - (sum % 10)) % 10);
}

function modules(code) {
  const d = code.split('').map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + '101';
}

function writeBarcodeVideo(file, code, { width = 640, height = 480, frames = 10 } = {}) {
  const bits = modules(code);
  const unit = 5; // pixels per module
  const left = Math.floor((width - bits.length * unit) / 2);
  const top = 140;
  const bottom = 340;
  const y = Buffer.alloc(width * height, 235); // white
  for (let row = top; row < bottom; row++)
    for (let i = 0; i < bits.length; i++)
      if (bits[i] === '1') y.fill(16, row * width + left + i * unit, row * width + left + (i + 1) * unit);
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from('FRAME\n'), y, chroma, chroma);
  fs.writeFileSync(file, Buffer.concat(parts));
}

module.exports = { ean13, writeBarcodeVideo };
