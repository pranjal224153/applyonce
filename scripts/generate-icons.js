import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function generatePng(size) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawRows = [];
  const radius = size * 0.22;
  const center = size / 2;

  for (let y = 0; y < size; y++) {
    const row = [0]; // filter byte 0
    for (let x = 0; x < size; x++) {
      // Rounded rectangle test
      const dx = Math.max(0, Math.abs(x - center + 0.5) - (center - radius));
      const dy = Math.max(0, Math.abs(y - center + 0.5) - (center - radius));
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Vibrant modern indigo-to-blue gradient (#4F46E5 to #2563EB)
        const t = (x + y) / (size * 2);
        const r = Math.round(79 * (1 - t) + 37 * t);
        const g = Math.round(70 * (1 - t) + 99 * t);
        const b = Math.round(229 * (1 - t) + 235 * t);
        
        // Inner stylized 'A' checkmark/chevron for larger sizes
        const isChevron = size >= 32 && (
          (Math.abs(y - (center + 2)) <= 2 && Math.abs(x - center) <= size * 0.18) ||
          (Math.abs(x - (center - (y - center * 0.4) * 0.5)) <= 1.5 && y >= center * 0.4 && y <= center * 1.5) ||
          (Math.abs(x - (center + (y - center * 0.4) * 0.5)) <= 1.5 && y >= center * 0.4 && y <= center * 1.5)
        );

        if (isChevron) {
          row.push(255, 255, 255, 255);
        } else {
          row.push(r, g, b, 255);
        }
      } else {
        // Transparent outside rounded corners
        row.push(0, 0, 0, 0);
      }
    }
    rawRows.push(Buffer.from(row));
  }

  const rawData = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(rawData);

  return Buffer.concat([
    header,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = path.resolve('public/icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

[16, 48, 128].forEach((s) => {
  const png = generatePng(s);
  fs.writeFileSync(path.join(outDir, `icon${s}.png`), png);
  console.log(`Generated icon${s}.png (${png.length} bytes)`);
});
