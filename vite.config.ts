/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { experienceConfig } from './src/config/experience.config';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * Fills index.html from the central config (single source of truth for URLs and texts) and, for
 * production builds, injects the Content-Security-Policy (ARCHITECTURE.md §10).
 */
function experienceHtml(): Plugin {
  const portfolioOrigin = new URL(experienceConfig.portfolioUrl).origin;
  const csp = [
    `default-src 'self' ${portfolioOrigin}`,
    `script-src 'self' 'inline-speculation-rules'`,
    `style-src 'self'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self' ${portfolioOrigin}`,
    `worker-src 'self' blob:`,
    `media-src 'self' blob:`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'none'`,
  ].join('; ');
  const values: Record<string, string> = {
    DR_PORTFOLIO_URL: experienceConfig.portfolioUrl,
    DR_ENTRY_URL: experienceConfig.experienceEntryUrl,
    DR_TEXT_LOADING: experienceConfig.text.loading,
    DR_TEXT_ENDING1: experienceConfig.text.endingLine1,
    DR_TEXT_ENDING2: experienceConfig.text.endingLine2,
  };
  let isBuild = false;
  return {
    name: 'dr-experience-html',
    configResolved(c) {
      isBuild = c.command === 'build';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let out = html.replace(/%(DR_[A-Z0-9_]+)%/g, (m, key: string) => {
          const v = values[key];
          if (v === undefined) throw new Error(`Unknown HTML placeholder ${m}`);
          return escapeHtml(v);
        });
        // dev server injects inline styles for HMR, so the CSP is applied to builds only
        out = out.replace('<!--DR_CSP-->', isBuild ? `<meta http-equiv="Content-Security-Policy" content="${csp}">` : '');
        return out;
      },
    },
  };
}

export default defineConfig({
  base: '/developers-room/',
  plugins: [experienceHtml()],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/gsap')) return 'gsap';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
