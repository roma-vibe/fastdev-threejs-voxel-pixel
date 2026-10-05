import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { projectEnv, port } from './scripts/env.mjs';
const env = projectEnv();
const appName = env.APP_NAME || 'Voxel Game';
export default defineConfig({
  plugins: [vue(), htmlAppName(appName)],
  define: {
    __APP_NAME__: JSON.stringify(appName),
    __APP_SLUG__: JSON.stringify(env.APP_SLUG || 'voxel-game'),
  },
  server: { port: port(env.WEB_PORT), strictPort: true },
  // World generation and meshing tests take seconds; leave room for slow machines and containers.
  test: { include: ['tests/**/*.test.js'], environment: 'node', testTimeout: 60000 },
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/node_modules/pixi.js/')) return 'pixi';
          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/@vue/')) return 'vue';
        },
      },
    },
  },
});

/** Replaces %APP_NAME% in index.html with the HTML-escaped project name. */
function htmlAppName(name) {
  const escaped = name.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return {
    name: 'html-app-name',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%APP_NAME%', () => escaped),
    },
  };
}
