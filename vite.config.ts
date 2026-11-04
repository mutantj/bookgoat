import { defineConfig, loadEnv } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// `npm run build` → dist/ for GitHub Pages (relative paths work under /bookgoat/).
// `npm run build:single` → one self-contained HTML file (used for the claude.ai preview).
//
// Feature flags (see src/features.ts) use the default here unless the env var says on/off, e.g.
// `VITE_FEATURE_ADVENTURE=off npm run build`, a line in .env.local, or for the live site a repository
// variable on GitHub (Settings → Secrets and variables → Actions → Variables).
const flag = (value: string | undefined, fallback: boolean) => (!value ? fallback : !/^(off|false|0|no)$/i.test(value.trim()));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_FEATURE_');
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __FEATURE_ADVENTURE__: JSON.stringify(flag(env.VITE_FEATURE_ADVENTURE, true)),
    },
    plugins: mode === 'single' ? [viteSingleFile()] : [],
    build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 4000 },
  };
});
