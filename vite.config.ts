import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function resolveModuleDir(pkgName: string): string {
  try {
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`, { paths: [__dirname] });
    return path.dirname(pkgJsonPath);
  } catch {
    const fallback = path.resolve(__dirname, 'node_modules', pkgName);
    return fs.existsSync(fallback) ? fallback : pkgName;
  }
}

const reactIsPath = resolveModuleDir('react-is');
const rechartsPath = resolveModuleDir('recharts');

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom', 'react-is', 'recharts'],
      alias: {
        '@': path.resolve(__dirname, '.'),
        'react-is': reactIsPath,
        recharts: rechartsPath,
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-is', 'recharts'],
    },
    build: {
      chunkSizeWarningLimit: 3000,
      commonjsOptions: {
        include: [/react-is/, /recharts/, /node_modules/],
        transformMixedEsModules: true,
      },
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('recharts') || id.includes('react-is') || id.includes('d3-')) {
                return 'vendor-charts';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('xlsx')) {
                return 'vendor-xlsx';
              }
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

