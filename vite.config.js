import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const buildTime = new Date().toISOString();

export default defineConfig({
  base: '/notfortnite/',
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    {
      name: 'stamp-sw',
      writeBundle() {
        const src = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');
        const stamped = src.replace(
          "'notfortnite-v1'",
          `'notfortnite-${buildTime}'`
        );
        fs.writeFileSync(path.resolve('dist/sw.js'), stamped);
      },
    },
  ],
});
