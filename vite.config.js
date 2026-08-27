import tailwindcss from '@tailwindcss/vite';
import { privateDecrypt } from 'crypto';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        notes: path.resolve(__dirname, 'notes.html'),
        profile: path.resolve(__dirname, 'profile.html'),
        admin: path.resolve(__dirname, 'admin.html'),
        login: path.resolve(__dirname, 'login.html'),
        register: path.resolve(__dirname, 'register.html'),
        pdf: path.resolve(__dirname, 'pdf-viewer.html'),
        privacy: path.resolve(__dirname, 'privacy-policy.html'),
        terms: path.resolve(__dirname, 'terms.html'),
        forget: path.resolve(__dirname, 'forgot-password.html'),
      },
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
