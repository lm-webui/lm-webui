import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

// Read version from repo root package.json (graceful fallback if not found)
let appVersion = "0.0.0";
try {
  const pkgPath = path.resolve(__dirname, "../package.json");
  if (fs.existsSync(pkgPath)) {
    appVersion = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version;
  }
} catch {
  // package.json not available (e.g. installed via install.sh without root pkg)
}

/// <reference types="vitest" />

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 5177,
    proxy: {
      '/api': {
        target: 'http://localhost:7070',
        changeOrigin: true,
        secure: false,
        credentials: true
      },
      '/auth': {
        target: 'http://localhost:7070',
        changeOrigin: true,
        secure: false,
        credentials: true
      },
      '/ws': {
        target: 'ws://localhost:7070',
        ws: true
      },
      '/generated': {
        target: 'http://localhost:7070'
      }
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: "dist",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.d.ts',
        'src/**/*.stories.{js,jsx,ts,tsx}',
        'src/**/*.config.{js,ts}',
        'src/main.tsx',
      ],
    },
  },
}));
