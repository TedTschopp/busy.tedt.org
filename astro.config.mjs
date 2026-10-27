import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://busy.tedt.org',
  trailingSlash: 'always',
  vite: { plugins: [tailwindcss()] },
});
