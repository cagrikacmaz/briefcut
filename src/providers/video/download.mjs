import fs from 'node:fs';

// Download a URL to a file (no auth, or the given headers), following redirects.
export async function fetchToFile(fetchImpl, url, dest, headers = {}) {
  const res = await fetchImpl(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`download ${new URL(url).host}: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
