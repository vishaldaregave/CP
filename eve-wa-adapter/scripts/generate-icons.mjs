import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

/**
 * Generates an uncompressed/deflated raw RGBA PNG image buffer.
 */
function createPng(width, height, drawPixel) {
  const rowSize = width * 4 + 1; // +1 for filter byte (0 = None)
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawPixel(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdr = makeChunk("IHDR", ihdrData);
  const idat = makeChunk("IDAT", deflated);
  const iend = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Draws a sleek shield icon with cyan/blue gradient.
 */
function drawShield(x, y, w, h) {
  const nx = x / (w - 1);
  const ny = y / (h - 1);
  const cx = 0.5;
  const cy = 0.5;

  const dx = Math.abs(nx - cx) * 2;
  const inShield = dx <= (1 - Math.pow(Math.max(0, ny - 0.3) * 1.4, 2)) && ny >= 0.1 && ny <= 0.9;

  if (inShield) {
    // Shield gradient from Sky Blue (#38bdf8) to Cyan (#0284c7)
    const r = Math.round(2 + ny * 50);
    const g = Math.round(132 + (1 - ny) * 50);
    const b = Math.round(199 + (1 - ny) * 45);
    return [r, g, b, 255];
  }

  // Transparent background
  return [0, 0, 0, 0];
}

const iconsDir = path.resolve(process.cwd(), "extension/icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach((size) => {
  const pngBuf = createPng(size, size, drawShield);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), pngBuf);
  console.log(`Generated icon: extension/icons/icon${size}.png (${size}x${size})`);
});
