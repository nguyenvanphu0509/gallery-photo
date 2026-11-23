import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function fixtureBuffers() {
  const source = () => sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#5096b8' } });
  const jpeg = await source().jpeg().toBuffer();
  const png = await source().png().toBuffer();
  const exif = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#e3a445' } })
    .composite([{ input: Buffer.from('<svg width="1200" height="800"><rect x="0" y="0" width="300" height="800" fill="#235999"/><circle cx="900" cy="200" r="130" fill="#ffffff"/></svg>') }])
    .withMetadata({ orientation: 6 }).withExifMerge({ IFD3: {
      GPSLatitudeRef: 'N', GPSLatitude: '10/1 0/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '20/1 0/1 0/1',
    } }).jpeg().toBuffer();
  const overPixels = await sharp({ create: { width: 8000, height: 5001, channels: 3, background: 'white' } }).png().toBuffer();
  return { 'valid.jpg': jpeg, 'valid.png': png, 'orientation-gps.jpg': exif,
    'fake.jpg': Buffer.from('This is text, not an image.'),
    'truncated.jpg': jpeg.subarray(0, Math.floor(jpeg.length * .6)),
    'over-10MiB.jpg': Buffer.concat([jpeg, Buffer.alloc(10 * 1024 * 1024 + 1 - jpeg.length)]),
    'over-40MP.png': overPixels,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dir = resolve('.data/fixtures');
  await mkdir(dir, { recursive: true });
  for (const [name, buffer] of Object.entries(await fixtureBuffers())) await writeFile(resolve(dir, name), buffer);
  console.log(`Fixtures (dữ liệu tổng hợp, GPS giả): ${dir}`);
}
