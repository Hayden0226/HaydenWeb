// Extract a representative glow color from a game cover at build time.
// Used to tint the hover halo on game cards to match each game's own artwork.

import sharp from 'sharp';
import { FileCache } from './cache';
import { createLogger } from './logger';
import { pLimit } from './concurrency';

const log = createLogger('CoverColor');

interface CoverColorData {
  colors: Record<string, string>;
  timestamp: number;
}

const cache = new FileCache<CoverColorData>('cover-colors', {
  ttl: 30 * 24 * 60 * 60 * 1000,
});

const limit = pLimit(4);

/**
 * Download a cover image and compute its average color, brightened slightly so
 * the glow reads clearly on dark artwork. Returns a hex string like "#66c0f4".
 */
export async function getCoverGlowColor(imageUrl: string): Promise<string | null> {
  return limit(async () => {
    const cached = await cache.get();
    if (cached?.colors?.[imageUrl]) {
      return cached.colors[imageUrl];
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        log.error(`Failed to fetch ${imageUrl}: ${response.status}`);
        return null;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const { data } = await sharp(buffer)
        .resize(48, 48, { fit: 'inside' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixelCount = data.length / 3;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < data.length; i += 3) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      r = Math.round((r / pixelCount) + (255 - r / pixelCount) * 0.12);
      g = Math.round((g / pixelCount) + (255 - g / pixelCount) * 0.12);
      b = Math.round((b / pixelCount) + (255 - b / pixelCount) * 0.12);

      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const all: CoverColorData = {
        ...(cached ?? { colors: {} }),
        colors: { ...(cached?.colors ?? {}), [imageUrl]: hex },
        timestamp: Date.now(),
      };
      await cache.set(all);
      return hex;
    } catch (error) {
      log.error(`Failed to extract color from ${imageUrl}`, error);
      return null;
    }
  });
}
