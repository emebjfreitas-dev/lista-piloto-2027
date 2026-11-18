import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

async function generateFavicons() {
  const publicDir = path.resolve('public');
  const svgPath = path.join(publicDir, 'favicon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  console.log('Generating favicon & PWA PNG sizes...');

  const sizes = [16, 32, 48, 192, 512];
  const pngBuffers: Record<number, Buffer> = {};

  for (const size of sizes) {
    const png = await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    pngBuffers[size] = png;

    if (size === 16) {
      fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), png);
    } else if (size === 32) {
      fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), png);
    } else if (size === 192) {
      fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), png);
    } else if (size === 512) {
      fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), png);
    }
  }

  // Apple Touch Icon (180x180) — iOS requires opaque background (no transparency, otherwise renders black) + safe padding
  const iosInnerSize = 148;
  const iosCrest = await sharp(svgBuffer)
    .resize(iosInnerSize, iosInnerSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  const appleTouchIcon = await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: iosCrest, gravity: 'center' }])
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleTouchIcon);

  // Android Maskable Icon (512x512) — Safe zone ~76% inner area on opaque white background
  const maskableInnerSize = 388;
  const maskableCrest = await sharp(svgBuffer)
    .resize(maskableInnerSize, maskableInnerSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();

  const pwaMaskableIcon = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: maskableCrest, gravity: 'center' }])
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pwaMaskableIcon);

  console.log('Building binary multi-resolution favicon.ico (16x16, 32x32, 48x48)...');
  const icoSizes = [16, 32, 48];
  const count = icoSizes.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + dirEntrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4); // Count

  const dirEntries: Buffer[] = [];
  const imageBuffers: Buffer[] = [];

  for (const s of icoSizes) {
    const buf = pngBuffers[s];
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(s === 256 ? 0 : s, 0); // Width
    entry.writeUInt8(s === 256 ? 0 : s, 1); // Height
    entry.writeUInt8(0, 2); // Color palette count
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(buf.length, 8); // Image data size
    entry.writeUInt32LE(offset, 12); // Offset of image data
    dirEntries.push(entry);
    imageBuffers.push(buf);
    offset += buf.length;
  }

  const icoBuffer = Buffer.concat([header, ...dirEntries, ...imageBuffers]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);

  console.log('Favicon & iOS/PWA icon generation completed successfully!');
  console.log('Generated:');
  console.log(' - public/favicon.svg');
  console.log(' - public/favicon.ico (' + icoBuffer.length + ' bytes)');
  console.log(' - public/favicon-16x16.png');
  console.log(' - public/favicon-32x32.png');
  console.log(' - public/apple-touch-icon.png (180x180 opaque iOS-ready)');
  console.log(' - public/pwa-192x192.png');
  console.log(' - public/pwa-512x512.png');
  console.log(' - public/pwa-maskable-512x512.png (512x512 opaque safe-zone)');
}

generateFavicons().catch((err) => {
  console.error('Error generating favicons:', err);
  process.exit(1);
});
