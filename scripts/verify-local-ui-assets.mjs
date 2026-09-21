const base = process.env.UI_VERIFY_BASE_URL || "http://127.0.0.1:3000";
const url = new URL(base);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') {
  throw new Error('Local UI only');
}

const page = await fetch(url, { cache: 'no-store' });
if (!page.ok) throw new Error(`Homepage returned HTTP ${page.status}`);
const html = await page.text();
const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^\"]*)?"/g)].map(match => match[1]))];
if (assets.length === 0) throw new Error('Homepage contains no Next.js static assets');

const failures = [];
for (const path of assets) {
  const response = await fetch(new URL(path, url), { cache: 'no-store' });
  if (!response.ok) failures.push(`${path}: HTTP ${response.status}`);
}
if (failures.length) throw new Error(`Broken UI assets:\n${failures.join('\n')}`);
console.log(`Local UI assets healthy: ${assets.length} files`);
