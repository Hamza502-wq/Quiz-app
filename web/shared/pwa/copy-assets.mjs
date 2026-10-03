// Copies the shared PWA files (service worker, icons) into an app's public/ folder.
// Runs automatically before `npm run dev` and `npm run build` of each web app.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(process.cwd(), 'public');
mkdirSync(publicDir, { recursive: true });
copyFileSync(path.join(here, 'sw.js'), path.join(publicDir, 'sw.js'));
for (const icon of readdirSync(path.join(here, 'icons'))) {
  copyFileSync(path.join(here, 'icons', icon), path.join(publicDir, icon));
}
