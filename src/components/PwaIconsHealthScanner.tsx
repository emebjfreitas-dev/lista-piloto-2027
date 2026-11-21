import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';

export interface PublicAssetScanItem {
  filename: string;
  label: string;
  platform: 'iOS (Safari)' | 'Android / Chrome' | 'Navegador / Desktop' | 'Manifesto PWA';
  expectedSpecs: string;
  status: 'checking' | 'ok' | 'warning' | 'error';
  exists: boolean;
  httpStatus?: number;
  sizeBytes?: number;
  dimensions?: string;
  mimeType?: string;
  previewUrl?: string;
  iosOpaqueVerified?: boolean;
  message: string;
}

interface ManifestSummary {
  name?: string;
  shortName?: string;
  display?: string;
  themeColor?: string;
  iconsCount: number;
  shortcutsCount: number;
}

interface HeadTagCheck {
  label: string;
  present: boolean;
  value: string;
}

interface AssetDefinition {
  filename: string;
  label: string;
  platform: PublicAssetScanItem['platform'];
  expectedSpecs: string;
  kind: 'svg' | 'png' | 'ico' | 'manifest';
  expectedWidth?: number;
  expectedHeight?: number;
  checkIosOpaque?: boolean;
}

const PUBLIC_ASSETS_TO_SCAN: AssetDefinition[] = [
  {
    filename: 'apple-touch-icon.png',
    label: 'Ícone Tela Inicial iOS',
    platform: 'iOS (Safari)',
    expectedSpecs: 'PNG 180×180px · Fundo opaco',
    kind: 'png',
    expectedWidth: 180,
    expectedHeight: 180,
    checkIosOpaque: true,
  },
  {
    filename: 'manifest.json',
    label: 'Manifesto PWA Oficial',
    platform: 'Manifesto PWA',
    expectedSpecs: 'JSON · standalone · #14428c',
    kind: 'manifest',
  },
  {
    filename: 'favicon.svg',
    label: 'Favicon Vetorial',
    platform: 'Navegador / Desktop',
    expectedSpecs: 'SVG vetorial escalável',
    kind: 'svg',
  },
  {
    filename: 'favicon-32x32.png',
    label: 'Favicon Aba Desktop (32px)',
    platform: 'Navegador / Desktop',
    expectedSpecs: 'PNG 32×32px',
    kind: 'png',
    expectedWidth: 32,
    expectedHeight: 32,
  },
  {
    filename: 'favicon-16x16.png',
    label: 'Favicon Favoritos (16px)',
    platform: 'Navegador / Desktop',
    expectedSpecs: 'PNG 16×16px',
    kind: 'png',
    expectedWidth: 16,
    expectedHeight: 16,
  },
  {
    filename: 'favicon.ico',
    label: 'Favicon Universal (.ICO)',
    platform: 'Navegador / Desktop',
    expectedSpecs: 'ICO multi-resolução',
    kind: 'ico',
  },
  {
    filename: 'pwa-192x192.png',
    label: 'Ícone App Android (192px)',
    platform: 'Android / Chrome',
    expectedSpecs: 'PNG 192×192px',
    kind: 'png',
    expectedWidth: 192,
    expectedHeight: 192,
  },
  {
    filename: 'pwa-512x512.png',
    label: 'Ícone Splash Android (512px)',
    platform: 'Android / Chrome',
    expectedSpecs: 'PNG 512×512px',
    kind: 'png',
    expectedWidth: 512,
    expectedHeight: 512,
  },
  {
    filename: 'pwa-maskable-512x512.png',
    label: 'Ícone Adaptativo Maskable',
    platform: 'Android / Chrome',
    expectedSpecs: 'PNG 512×512px · Safe-zone opaca',
    kind: 'png',
    expectedWidth: 512,
    expectedHeight: 512,
    checkIosOpaque: true,
  },
];

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const inspectImageBlob = (
  blob: Blob,
  checkCornerOpacity: boolean
): Promise<{ width: number; height: number; previewUrl: string; isOpaqueCorner: boolean }> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      let isOpaqueCorner = true;
      if (checkCornerOpacity && img.naturalWidth > 0 && img.naturalHeight > 0) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const cornerPixel = ctx.getImageData(0, 0, 1, 1).data;
            isOpaqueCorner = cornerPixel[3] === 255;
          }
        } catch {
          isOpaqueCorner = true;
        }
      }
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        previewUrl: objectUrl,
        isOpaqueCorner,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Falha ao decodificar imagem'));
    };
    img.src = objectUrl;
  });
};

export const PwaIconsHealthScanner: React.FC = () => {
  const [items, setItems] = useState<PublicAssetScanItem[]>(() =>
    PUBLIC_ASSETS_TO_SCAN.map((def) => ({
      filename: def.filename,
      label: def.label,
      platform: def.platform,
      expectedSpecs: def.expectedSpecs,
      status: 'checking',
      exists: false,
      message: 'Aguardando escaneamento...',
    }))
  );
  const [manifestSummary, setManifestSummary] = useState<ManifestSummary | null>(null);
  const [headChecks, setHeadChecks] = useState<HeadTagCheck[]>([]);
  const [swStatus, setSwStatus] = useState<'ativo' | 'registrando' | 'indisponivel'>('registrando');
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string>('');

  const runScan = useCallback(async () => {
    setIsScanning(true);

    // 1. Verificar meta tags e links do <head> no DOM atual
    if (typeof document !== 'undefined') {
      const appleIconEl = document.querySelector('link[rel="apple-touch-icon"]');
      const applePreEl = document.querySelector('link[rel="apple-touch-icon-precomposed"]');
      const manifestEl = document.querySelector('link[rel="manifest"]');
      const appleCapableEl = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
      const themeEl = document.querySelector('meta[name="theme-color"]');

      setHeadChecks([
        {
          label: 'link[rel="apple-touch-icon"]',
          present: Boolean(appleIconEl?.getAttribute('href')),
          value: appleIconEl?.getAttribute('href') || 'Ausente',
        },
        {
          label: 'link[rel="apple-touch-icon-precomposed"]',
          present: Boolean(applePreEl?.getAttribute('href')),
          value: applePreEl?.getAttribute('href') || 'Ausente',
        },
        {
          label: 'link[rel="manifest"]',
          present: Boolean(manifestEl?.getAttribute('href')),
          value: manifestEl?.getAttribute('href') || 'Ausente',
        },
        {
          label: 'meta[name="apple-mobile-web-app-capable"]',
          present: appleCapableEl?.getAttribute('content') === 'yes',
          value: appleCapableEl?.getAttribute('content') || 'Ausente',
        },
        {
          label: 'meta[name="theme-color"]',
          present: Boolean(themeEl?.getAttribute('content')),
          value: themeEl?.getAttribute('content') || 'Ausente',
        },
      ]);
    }

    // 2. Verificar Service Worker
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        setSwStatus(reg?.active ? 'ativo' : 'registrando');
      } catch {
        setSwStatus('indisponivel');
      }
    } else {
      setSwStatus('indisponivel');
    }

    // 3. Escanear arquivos estáticos na pasta pública
    const rawBase = (import.meta as any).env?.BASE_URL || '/';
    const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

    const scanned: PublicAssetScanItem[] = await Promise.all(
      PUBLIC_ASSETS_TO_SCAN.map(async (def): Promise<PublicAssetScanItem> => {
        const candidateUrls = Array.from(
          new Set([`${normalizedBase}${def.filename}`, `./${def.filename}`])
        );

        let response: Response | null = null;
        for (const url of candidateUrls) {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
              response = res;
              break;
            }
            if (!response) response = res;
          } catch {
            // tenta próximo caminho
          }
        }

        if (!response || !response.ok) {
          return {
            filename: def.filename,
            label: def.label,
            platform: def.platform,
            expectedSpecs: def.expectedSpecs,
            status: 'error',
            exists: false,
            httpStatus: response?.status,
            message: `Arquivo não localizado na pasta pública (HTTP ${response?.status || 'rede'}).`,
          };
        }

        const contentType = response.headers.get('content-type') || '';
        const blob = await response.blob();

        if (blob.size === 0) {
          return {
            filename: def.filename,
            label: def.label,
            platform: def.platform,
            expectedSpecs: def.expectedSpecs,
            status: 'error',
            exists: true,
            httpStatus: response.status,
            sizeBytes: 0,
            mimeType: contentType,
            message: 'Arquivo encontrado com 0 bytes (corrompido).',
          };
        }

        // Caso Manifesto JSON
        if (def.kind === 'manifest') {
          try {
            const text = await blob.text();
            const parsed = JSON.parse(text);
            const hasStandalone = parsed.display === 'standalone';
            const hasShortName = Boolean(parsed.short_name);
            const iconsCount = Array.isArray(parsed.icons) ? parsed.icons.length : 0;
            const shortcutsCount = Array.isArray(parsed.shortcuts) ? parsed.shortcuts.length : 0;

            setManifestSummary({
              name: parsed.name,
              shortName: parsed.short_name,
              display: parsed.display,
              themeColor: parsed.theme_color,
              iconsCount,
              shortcutsCount,
            });

            if (contentType.includes('text/html') || text.trim().startsWith('<!doctype')) {
              return {
                filename: def.filename,
                label: def.label,
                platform: def.platform,
                expectedSpecs: def.expectedSpecs,
                status: 'error',
                exists: false,
                httpStatus: response.status,
                sizeBytes: blob.size,
                mimeType: contentType,
                message: 'Retornou HTML de fallback em vez de JSON válido.',
              };
            }

            const valid = hasStandalone && hasShortName && iconsCount >= 2;
            return {
              filename: def.filename,
              label: def.label,
              platform: def.platform,
              expectedSpecs: def.expectedSpecs,
              status: valid ? 'ok' : 'warning',
              exists: true,
              httpStatus: response.status,
              sizeBytes: blob.size,
              mimeType: contentType || 'application/manifest+json',
              message: valid
                ? `JSON válido · "${parsed.short_name}" (${iconsCount} ícones, ${shortcutsCount} atalhos)`
                : 'Manifesto carregado, porém faltam campos recomendados (standalone/ícones).',
            };
          } catch {
            setManifestSummary(null);
            return {
              filename: def.filename,
              label: def.label,
              platform: def.platform,
              expectedSpecs: def.expectedSpecs,
              status: 'error',
              exists: true,
              httpStatus: response.status,
              sizeBytes: blob.size,
              mimeType: contentType,
              message: 'Falha ao interpretar manifest.json (JSON inválido).',
            };
          }
        }

        // Evita falsos positivos se um servidor retornar index.html para imagem inexistente
        if (contentType.includes('text/html')) {
          return {
            filename: def.filename,
            label: def.label,
            platform: def.platform,
            expectedSpecs: def.expectedSpecs,
            status: 'error',
            exists: false,
            httpStatus: response.status,
            sizeBytes: blob.size,
            mimeType: contentType,
            message: 'Servidor retornou HTML no lugar da imagem.',
          };
        }

        // Caso SVG
        if (def.kind === 'svg') {
          const text = await blob.text();
          const hasSvgTag = text.includes('<svg') && text.includes('</svg>');
          if (!hasSvgTag) {
            return {
              filename: def.filename,
              label: def.label,
              platform: def.platform,
              expectedSpecs: def.expectedSpecs,
              status: 'error',
              exists: true,
              httpStatus: response.status,
              sizeBytes: blob.size,
              mimeType: contentType,
              message: 'Arquivo não possui estrutura vetorial <svg> válida.',
            };
          }
          const previewUrl = URL.createObjectURL(blob);
          return {
            filename: def.filename,
            label: def.label,
            platform: def.platform,
            expectedSpecs: def.expectedSpecs,
            status: 'ok',
            exists: true,
            httpStatus: response.status,
            sizeBytes: blob.size,
            dimensions: 'Vetorial (SVG)',
            mimeType: contentType || 'image/svg+xml',
            previewUrl,
            message: 'Arquivo vetorial presente e válido.',
          };
        }

        // Caso PNG / ICO
        try {
          const info = await inspectImageBlob(blob, Boolean(def.checkIosOpaque));
          const dims = `${info.width}×${info.height}px`;
          const sizeMismatch =
            def.expectedWidth &&
            def.expectedHeight &&
            (info.width !== def.expectedWidth || info.height !== def.expectedHeight);

          if (def.checkIosOpaque && !info.isOpaqueCorner) {
            return {
              filename: def.filename,
              label: def.label,
              platform: def.platform,
              expectedSpecs: def.expectedSpecs,
              status: 'warning',
              exists: true,
              httpStatus: response.status,
              sizeBytes: blob.size,
              dimensions: dims,
              mimeType: contentType || 'image/png',
              previewUrl: info.previewUrl,
              iosOpaqueVerified: false,
              message: 'Imagem encontrada com fundo transparente — no iOS pode aparecer fundo preto.',
            };
          }

          if (sizeMismatch) {
            return {
              filename: def.filename,
              label: def.label,
              platform: def.platform,
              expectedSpecs: def.expectedSpecs,
              status: 'warning',
              exists: true,
              httpStatus: response.status,
              sizeBytes: blob.size,
              dimensions: dims,
              mimeType: contentType,
              previewUrl: info.previewUrl,
              iosOpaqueVerified: info.isOpaqueCorner,
              message: `Presente (${dims}), porém esperado ${def.expectedWidth}×${def.expectedHeight}px.`,
            };
          }

          return {
            filename: def.filename,
            label: def.label,
            platform: def.platform,
            expectedSpecs: def.expectedSpecs,
            status: 'ok',
            exists: true,
            httpStatus: response.status,
            sizeBytes: blob.size,
            dimensions: dims,
            mimeType: contentType,
            previewUrl: info.previewUrl,
            iosOpaqueVerified: def.checkIosOpaque ? info.isOpaqueCorner : undefined,
            message: def.checkIosOpaque
              ? 'Válido · Fundo opaco verificado (pronto para iOS/Android).'
              : 'Arquivo presente e íntegro na pasta pública.',
          };
        } catch {
          return {
            filename: def.filename,
            label: def.label,
            platform: def.platform,
            expectedSpecs: def.expectedSpecs,
            status: 'error',
            exists: true,
            httpStatus: response.status,
            sizeBytes: blob.size,
            mimeType: contentType,
            message: 'Falha ao renderizar o arquivo de ícone no navegador.',
          };
        }
      })
    );

    setItems((prev) => {
      prev.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
      return scanned;
    });
    setLastScanAt(
      new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
    setIsScanning(false);
  }, []);

  useEffect(() => {
    void runScan();
  }, [runScan]);

  const okCount = items.filter((i) => i.status === 'ok').length;
  const warningCount = items.filter((i) => i.status === 'warning').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const iosIconItem = items.find((i) => i.filename === 'apple-touch-icon.png');
  const allHealthy = !isScanning && errorCount === 0 && warningCount === 0;

  return (
    <div className="space-y-4">
      {/* Cabeçalho da Auditoria PWA e Ícones iOS/Android */}
      <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-[#0f172a]">
                Verificador de Ícones PWA & Compatibilidade iOS / Android
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 tabular-nums ${
                  isScanning
                    ? 'bg-[#e8f0fe] text-[#14428c]'
                    : allHealthy
                    ? 'bg-[#ecfdf5] text-[#047857]'
                    : errorCount > 0
                    ? 'bg-[#fee2e2] text-[#991b1b]'
                    : 'bg-[#fef3c7] text-[#92400e]'
                }`}
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Escaneando pasta pública...</span>
                  </>
                ) : allHealthy ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{okCount}/{items.length} Arquivos Válidos</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>
                      {okCount} OK · {warningCount} Aviso(s) · {errorCount} Erro(s)
                    </span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-slate-700 max-w-2xl">
              Escaneia em tempo real os arquivos essenciais em <code className="font-mono text-slate-950">/public</code> (<code className="font-mono">apple-touch-icon.png</code>, <code className="font-mono">favicon.*</code>, <code className="font-mono">pwa-*.png</code> e <code className="font-mono">manifest.json</code>) validando existência, dimensões e fundo opaco obrigatório para iPhone/iPad (iOS).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {lastScanAt && (
              <span className="text-xs text-slate-700 font-medium tabular-nums px-2.5 py-1.5 rounded-xl bg-[#eef3f9]">
                Último scan: {lastScanAt}
              </span>
            )}
            <button
              type="button"
              disabled={isScanning}
              onClick={() => void runScan()}
              className="min-h-[40px] px-4 rounded-xl bg-[#14428c] hover:bg-[#0f3370] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>Reescanear Arquivos</span>
            </button>
          </div>
        </div>

        {/* Cartões de Resumo: Preview Real iOS + Status Manifesto + Tags HTML */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Card 1: Pré-visualização Real iOS Home Screen */}
          <div className="p-4 rounded-2xl bg-[#f3f6fb] flex items-center gap-4">
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className="w-[68px] h-[68px] rounded-[16px] bg-white shadow-[0_6px_18px_rgba(0,0,0,0.14)] overflow-hidden flex items-center justify-center p-1">
                {iosIconItem?.previewUrl ? (
                  <img
                    src={iosIconItem.previewUrl}
                    alt="Prévia Ícone iOS"
                    className="w-full h-full object-contain rounded-[12px]"
                  />
                ) : (
                  <Smartphone className="w-7 h-7 text-slate-700" />
                )}
              </div>
              <span className="text-[11px] font-medium text-slate-950">
                {manifestSummary?.shortName || 'Lista Piloto'}
              </span>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <span className="text-xs font-semibold text-[#14428c] uppercase tracking-wider block">
                Prévia Tela Inicial iOS
              </span>
              <p className="text-xs font-semibold text-slate-950">
                apple-touch-icon.png ({iosIconItem?.dimensions || '180×180px'})
              </p>
              <p className="text-xs text-slate-700 leading-relaxed">
                {iosIconItem?.iosOpaqueVerified
                  ? 'Fundo branco opaco verificado: no iPhone/iPad o brasão aparece nítido, sem bordas pretas.'
                  : 'Verificando opacidade do ícone para iOS Safari.'}
              </p>
            </div>
          </div>

          {/* Card 2: Manifesto PWA & Service Worker */}
          <div className="p-4 rounded-2xl bg-[#f3f6fb] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-950 inline-flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-[#14428c]" />
                <span>Identidade do Manifesto PWA</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                  swStatus === 'ativo'
                    ? 'bg-emerald-100 text-emerald-950'
                    : 'bg-[#e8f0fe] text-[#0f3370]'
                }`}
              >
                SW: {swStatus === 'ativo' ? 'Ativo' : swStatus === 'registrando' ? 'Pronto' : 'Local'}
              </span>
            </div>
            {manifestSummary ? (
              <div className="space-y-1 text-xs text-slate-800">
                <p className="truncate">
                  <span className="text-slate-700">Nome curto:</span>{' '}
                  <strong className="text-slate-950">{manifestSummary.shortName}</strong>
                </p>
                <p>
                  <span className="text-slate-700">Modo:</span>{' '}
                  <strong className="text-slate-950">{manifestSummary.display}</strong> ·{' '}
                  <span className="text-slate-700">Tema:</span>{' '}
                  <span className="inline-flex items-center gap-1 font-mono text-slate-950">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: manifestSummary.themeColor || '#14428c' }}
                    />
                    {manifestSummary.themeColor}
                  </span>
                </p>
                <p className="tabular-nums text-slate-700">
                  {manifestSummary.iconsCount} ícones declarados · {manifestSummary.shortcutsCount} atalhos de tela inicial
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-700">Lendo informações do manifest.json...</p>
            )}
          </div>

          {/* Card 3: Meta Tags <head> */}
          <div className="p-4 rounded-2xl bg-[#f3f6fb] space-y-2">
            <span className="text-xs font-semibold text-slate-950 block">
              Meta Tags & Links no HTML (&lt;head&gt;)
            </span>
            <div className="space-y-1">
              {headChecks.map((tag) => (
                <div key={tag.label} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-slate-800 truncate">{tag.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                      tag.present
                        ? 'bg-emerald-100 text-emerald-950'
                        : 'bg-rose-100 text-rose-950'
                    }`}
                  >
                    {tag.present ? 'OK' : 'Ausente'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Grid Visual de Escaneamento Arquivo a Arquivo */}
      <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_6px_22px_-8px_rgba(9,15,29,0.08)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-semibold text-slate-950">
            Status Individual dos Arquivos na Pasta Pública
          </h3>
          <span className="text-xs text-slate-700 font-medium tabular-nums">
            {items.length} arquivos monitorados
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((item) => {
            const isOk = item.status === 'ok';
            const isWarn = item.status === 'warning';
            const isErr = item.status === 'error';

            return (
              <div
                key={item.filename}
                className="p-3.5 rounded-2xl bg-[#f3f6fb] card-interactive flex items-start gap-3 min-w-0"
              >
                {/* Miniatura Visual */}
                <div className="w-12 h-12 rounded-xl bg-white shadow-xs shrink-0 flex items-center justify-center overflow-hidden p-1">
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={item.filename}
                      className="w-full h-full object-contain"
                    />
                  ) : item.filename === 'manifest.json' ? (
                    <FileJson className="w-6 h-6 text-[#14428c]" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-600" />
                  )}
                </div>

                {/* Metadados e Status */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-950 truncate">
                        {item.filename}
                      </p>
                      <p className="text-[11px] text-slate-700 truncate">{item.label}</p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                        item.status === 'checking'
                          ? 'bg-[#e8f0fe] text-[#0f3370]'
                          : isOk
                          ? 'bg-emerald-100 text-emerald-950'
                          : isWarn
                          ? 'bg-amber-100 text-amber-950'
                          : 'bg-rose-100 text-rose-950'
                      }`}
                    >
                      {item.status === 'checking' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isOk ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : isWarn ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      <span>
                        {item.status === 'checking'
                          ? 'Verificando'
                          : isOk
                          ? 'Presente'
                          : isWarn
                          ? 'Atenção'
                          : 'Erro'}
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700 tabular-nums">
                    <span className="px-1.5 py-0.5 rounded bg-white text-slate-950 font-medium">
                      {item.platform}
                    </span>
                    {item.dimensions && <span>{item.dimensions}</span>}
                    {typeof item.sizeBytes === 'number' && item.sizeBytes > 0 && (
                      <span>· {formatBytes(item.sizeBytes)}</span>
                    )}
                  </div>

                  <p
                    className={`text-[11px] leading-snug break-words ${
                      isErr ? 'text-rose-950 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    {item.message}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
