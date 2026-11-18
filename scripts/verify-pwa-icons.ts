import fs from 'node:fs';
import path from 'node:path';

interface IconCheckResult {
  file: string;
  exists: boolean;
  valid: boolean;
  bytes: number;
  details: string;
}

function readPngInfo(buffer: Buffer): {
  isPng: boolean;
  width?: number;
  height?: number;
  colorType?: number;
  hasAlphaChannel?: boolean;
} {
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 26 || !buffer.subarray(0, 8).equals(pngSig)) {
    return { isPng: false };
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  const hasAlphaChannel = colorType === 4 || colorType === 6;
  return { isPng: true, width, height, colorType, hasAlphaChannel };
}

function verifyPublicIcons(): { ok: boolean; results: IconCheckResult[] } {
  const publicDir = path.resolve('public');
  const results: IconCheckResult[] = [];

  const checkFile = (
    filename: string,
    validator: (buf: Buffer) => { valid: boolean; details: string }
  ) => {
    const fullPath = path.join(publicDir, filename);
    if (!fs.existsSync(fullPath)) {
      results.push({
        file: filename,
        exists: false,
        valid: false,
        bytes: 0,
        details: 'Arquivo não encontrado em public/',
      });
      return;
    }
    const buf = fs.readFileSync(fullPath);
    if (buf.length === 0) {
      results.push({
        file: filename,
        exists: true,
        valid: false,
        bytes: 0,
        details: 'Arquivo vazio (0 bytes)',
      });
      return;
    }
    const { valid, details } = validator(buf);
    results.push({
      file: filename,
      exists: true,
      valid,
      bytes: buf.length,
      details,
    });
  };

  checkFile('favicon.svg', (buf) => {
    const text = buf.toString('utf8');
    const valid = text.includes('<svg') && text.includes('</svg>');
    return {
      valid,
      details: valid ? 'SVG vetorial válido' : 'Conteúdo SVG inválido',
    };
  });

  checkFile('favicon-32x32.png', (buf) => {
    const info = readPngInfo(buf);
    const valid = Boolean(info.isPng && info.width === 32 && info.height === 32);
    return {
      valid,
      details: info.isPng ? `PNG ${info.width}×${info.height}px` : 'Assinatura PNG inválida',
    };
  });

  checkFile('favicon-16x16.png', (buf) => {
    const info = readPngInfo(buf);
    const valid = Boolean(info.isPng && info.width === 16 && info.height === 16);
    return {
      valid,
      details: info.isPng ? `PNG ${info.width}×${info.height}px` : 'Assinatura PNG inválida',
    };
  });

  checkFile('favicon.ico', (buf) => {
    const isIco = buf.length >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1;
    const count = isIco ? buf.readUInt16LE(4) : 0;
    return {
      valid: isIco && count > 0,
      details: isIco ? `ICO multi-resolução (${count} imagens)` : 'Cabeçalho ICO inválido',
    };
  });

  checkFile('apple-touch-icon.png', (buf) => {
    const info = readPngInfo(buf);
    const dimsOk = Boolean(info.isPng && info.width === 180 && info.height === 180);
    const opaque = !info.hasAlphaChannel;
    return {
      valid: dimsOk && opaque,
      details: info.isPng
        ? `PNG ${info.width}×${info.height}px · ${
            opaque ? 'Fundo opaco iOS (OK)' : 'Contém canal alfa (pode ficar preto no iOS)'
          }`
        : 'Assinatura PNG inválida',
    };
  });

  checkFile('pwa-192x192.png', (buf) => {
    const info = readPngInfo(buf);
    const valid = Boolean(info.isPng && info.width === 192 && info.height === 192);
    return {
      valid,
      details: info.isPng ? `PNG ${info.width}×${info.height}px` : 'Assinatura PNG inválida',
    };
  });

  checkFile('pwa-512x512.png', (buf) => {
    const info = readPngInfo(buf);
    const valid = Boolean(info.isPng && info.width === 512 && info.height === 512);
    return {
      valid,
      details: info.isPng ? `PNG ${info.width}×${info.height}px` : 'Assinatura PNG inválida',
    };
  });

  checkFile('pwa-maskable-512x512.png', (buf) => {
    const info = readPngInfo(buf);
    const valid = Boolean(info.isPng && info.width === 512 && info.height === 512 && !info.hasAlphaChannel);
    return {
      valid,
      details: info.isPng
        ? `PNG ${info.width}×${info.height}px · Safe-zone opaca Android`
        : 'Assinatura PNG inválida',
    };
  });

  checkFile('manifest.json', (buf) => {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      const missingFields: string[] = [];
      if (!json.name) missingFields.push('name');
      if (!json.short_name) missingFields.push('short_name');
      if (json.display !== 'standalone') missingFields.push('display=standalone');
      if (!Array.isArray(json.icons) || json.icons.length === 0) missingFields.push('icons');

      const missingRefs: string[] = [];
      for (const icon of json.icons || []) {
        const rel = String(icon.src || '').replace(/^\.\//, '').replace(/^\//, '');
        if (rel && !fs.existsSync(path.join(publicDir, rel))) {
          missingRefs.push(rel);
        }
      }

      const valid = missingFields.length === 0 && missingRefs.length === 0;
      return {
        valid,
        details: valid
          ? `Válido · "${json.short_name}" (${json.icons.length} ícones, ${(json.shortcuts || []).length} atalhos)`
          : `Pendências: ${[...missingFields, ...missingRefs.map((r) => `ausente:${r}`)].join(', ')}`,
      };
    } catch {
      return { valid: false, details: 'JSON inválido' };
    }
  });

  const ok = results.every((r) => r.exists && r.valid);
  return { ok, results };
}

const report = verifyPublicIcons();
console.log('=== Verificação de Ícones PWA & iOS (public/) ===');
for (const item of report.results) {
  const badge = item.exists && item.valid ? '[OK]' : '[ERRO]';
  console.log(`${badge} ${item.file.padEnd(26)} ${String(item.bytes).padStart(7)} bytes · ${item.details}`);
}
if (!report.ok) {
  process.exitCode = 1;
}
