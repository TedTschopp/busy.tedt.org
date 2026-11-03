import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function routeHeaderAssets(page) {
  if (!process.env.SHARED_HEADER_ASSETS) return;
  await page.route('https://tedt.org/assets/global-header/v1/**', async route => {
    const file = new URL(route.request().url()).pathname.split('/').pop();
    await route.fulfill({ body: await readFile(join(process.env.SHARED_HEADER_ASSETS, file)), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'image/svg+xml' });
  });
}
