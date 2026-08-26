// Last.fm API integration
// Free public API for reading listening stats, no OAuth required.
// Docs: https://www.last.fm/api

import { fetchWithRetry } from './retry';
import { FileCache } from './cache';
import { createLogger } from './logger';

const log = createLogger('LastFM');

const LASTFM_API_KEY = import.meta.env.LASTFM_API_KEY;
const LASTFM_USERNAME = import.meta.env.LASTFM_USERNAME;
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

export interface LastfmTrack {
  name: string;
  artist: string;
  album: string;
  url: string;
  image: string;
  playcount?: number;
  nowPlaying?: boolean;
  date?: number; // Unix timestamp (seconds)
}

export interface LastfmArtist {
  name: string;
  url: string;
  image: string;
  playcount: number;
  tags: string[];
}

export interface LastfmAlbum {
  name: string;
  artist: string;
  url: string;
  image: string;
  playcount: number;
}

export interface LastfmStats {
  totalScrobbles: number;
  recentTracks: LastfmTrack[];
  topArtists: LastfmArtist[];
  topTracks: LastfmTrack[];
  topAlbums: LastfmAlbum[];
  topGenres: string[];
}

interface LastfmData {
  stats: LastfmStats;
  timestamp: number;
}

const cache = new FileCache<LastfmData>('lastfm-data', { ttl: 6 * 60 * 60 * 1000 });

// Tags that describe habits rather than genres, keep them out of the genre chips
const NON_GENRE_TAGS = new Set([
  'seen live',
  'favorites',
  'favourite',
  'all time favorites',
  'albums i own',
  'loved',
  '0-9',
]);

function pickImage(images?: Array<{ size: string; '#text'?: string }>): string {
  if (!images || images.length === 0) return '';
  const preferred = ['mega', 'extralarge', 'large', 'medium', 'small'];
  for (const size of preferred) {
    const found = images.find(img => img.size === size && img['#text']);
    if (found) return found['#text'];
  }
  return images.find(img => img['#text'])?.['#text'] || '';
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function lastfmFetch<T>(method: string, params: Record<string, string>): Promise<T | null> {
  if (!LASTFM_API_KEY || !LASTFM_USERNAME) {
    log.error('Last.fm API key or username not configured');
    return null;
  }

  const query = new URLSearchParams({
    method,
    api_key: LASTFM_API_KEY,
    format: 'json',
    ...params,
  });

  try {
    const response = await fetchWithRetry(`${BASE_URL}?${query.toString()}`, undefined, {
      maxRetries: 2,
      initialDelayMs: 1000,
      onRetry: (error, attempt) => {
        log.info(`Last.fm ${method} retry ${attempt}: ${error.message}`);
      },
    });
    const data = await response.json();

    if (data.error) {
      log.error(`Last.fm API error ${data.error}: ${data.message}`);
      return null;
    }
    return data as T;
  } catch (error) {
    log.error(`Error fetching Last.fm ${method}:`, error);
    return null;
  }
}

async function getRecentTracks(limit: number): Promise<LastfmTrack[]> {
  const data = await lastfmFetch<{ recenttracks?: { track?: unknown } }>('user.getRecentTracks', {
    user: LASTFM_USERNAME,
    limit: String(limit),
  });
  return asArray(data?.recenttracks?.track).map((raw: any) => ({
    name: raw.name || 'Unknown',
    artist: raw.artist?.['#text'] || 'Unknown Artist',
    album: raw.album?.['#text'] || '',
    url: raw.url || '',
    image: pickImage(raw.image),
    nowPlaying: raw['@attr']?.nowplaying === 'true',
    date: raw.date ? Number(raw.date.uts) : undefined,
  }));
}

async function getTopArtists(period: string, limit: number): Promise<LastfmArtist[]> {
  const data = await lastfmFetch<{ topartists?: { artist?: unknown } }>('user.getTopArtists', {
    user: LASTFM_USERNAME,
    period,
    limit: String(limit),
  });
  return asArray(data?.topartists?.artist).map((raw: any) => ({
    name: raw.name || 'Unknown',
    url: raw.url || '',
    image: pickImage(raw.image),
    playcount: Number(raw.playcount) || 0,
    tags: [],
  }));
}

async function getTopTracks(period: string, limit: number): Promise<LastfmTrack[]> {
  const data = await lastfmFetch<{ toptracks?: { track?: unknown } }>('user.getTopTracks', {
    user: LASTFM_USERNAME,
    period,
    limit: String(limit),
  });
  return asArray(data?.toptracks?.track).map((raw: any) => ({
    name: raw.name || 'Unknown',
    artist: raw.artist?.name || 'Unknown Artist',
    album: '',
    url: raw.url || '',
    image: pickImage(raw.image),
    playcount: Number(raw.playcount) || 0,
  }));
}

async function getTopAlbums(period: string, limit: number): Promise<LastfmAlbum[]> {
  const data = await lastfmFetch<{ topalbums?: { album?: unknown } }>('user.getTopAlbums', {
    user: LASTFM_USERNAME,
    period,
    limit: String(limit),
  });
  return asArray(data?.topalbums?.album).map((raw: any) => ({
    name: raw.name || 'Unknown',
    artist: raw.artist?.name || 'Unknown Artist',
    url: raw.url || '',
    image: pickImage(raw.image),
    playcount: Number(raw.playcount) || 0,
  }));
}

async function getTotalScrobbles(): Promise<number | null> {
  const data = await lastfmFetch<{ user?: { playcount?: string } }>('user.getInfo', {
    user: LASTFM_USERNAME,
  });
  if (!data?.user) return null;
  return Number(data.user.playcount) || 0;
}

async function getArtistTags(artistName: string): Promise<string[]> {
  const data = await lastfmFetch<{ toptags?: { tag?: Array<{ name: string }> } }>('artist.getTopTags', {
    artist: artistName,
  });
  return asArray(data?.toptags?.tag)
    .map(tag => tag.name?.trim())
    .filter((name): name is string => !!name && !NON_GENRE_TAGS.has(name.toLowerCase()))
    .slice(0, 3);
}


function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 4
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

interface iTunesCacheData {
  covers: Record<string, string>;
  timestamp: number;
}

const iTunesCoverCache = new FileCache<iTunesCacheData>('itunes-covers', { ttl: 7 * 24 * 60 * 60 * 1000 });
let iTunesCoverMap: Record<string, string> | null = null;

function cleanSearchTerm(term: string): string {
  return term.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function loadITunesCoverMap(): Promise<Record<string, string>> {
  if (!iTunesCoverMap) {
    const cached = await iTunesCoverCache.get();
    iTunesCoverMap = cached?.covers ?? {};
  }
  return iTunesCoverMap;
}

async function saveITunesCoverMap(): Promise<void> {
  if (!iTunesCoverMap) return;
  await iTunesCoverCache.set({ covers: iTunesCoverMap, timestamp: Date.now() });
}

/**
 * Look up real cover art via the iTunes Search API. Last.fm's cover images are
 * served from Fastly, which is unreachable in some networks (e.g. mainland
 * China); iTunes artwork lives on mzstatic.com, which is broadly accessible.
 * Results are cached (7 days) and transient 403s are retried.
 */
async function searchITunesCover(term: string, entity: 'song' | 'album' | 'musicArtist'): Promise<string> {
  const map = await loadITunesCoverMap();
  const cleaned = cleanSearchTerm(term);
  if (!cleaned) return '';
  const key = `${entity}::${cleaned.toLowerCase()}`;
  if (key in map) return map[key];

  let artwork = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt === 0 ? 300 : 3000);
    try {
      const query = new URLSearchParams({ term: cleaned, entity, limit: '1' });
      const response = await fetch(`https://itunes.apple.com/search?${query.toString()}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });
      const text = await response.text();
      // iTunes replies with a plain-text "Rate limit..." body when throttled
      if (!text.trim().startsWith('{')) {
        await sleep(3000);
        continue;
      }
      const data = JSON.parse(text);
      const found = data.results?.[0]?.artworkUrl100;
      artwork = found ? found.replace('100x100bb', '300x300bb') : '';
      map[key] = artwork; // definitive hit or clean miss — safe to cache
      return artwork;
    } catch {
      // transient network failure — retry without caching the miss
    }
  }
  return '';
}
export async function getLastfmStats(): Promise<LastfmStats | null> {
  const cached = await cache.get();
  if (cached) return cached.stats;

  if (!LASTFM_API_KEY || !LASTFM_USERNAME) {
    log.error('Last.fm API key or username not configured');
    return null;
  }

  log.info('Fetching Last.fm data...');

  try {
    const [totalScrobbles, recentTracks, topArtists, topTracks, topAlbums] = await Promise.all([
      getTotalScrobbles(),
      getRecentTracks(30),
      getTopArtists('1month', 12),
      getTopTracks('1month', 12),
      getTopAlbums('1month', 12),
    ]);
    if (totalScrobbles === null) {
      log.error('Last.fm API key invalid or username not found');
      return null;
    }

    // Attach genre tags to top artists (extra API calls, cached with the whole payload)
    const taggedArtists = await Promise.all(
      topArtists.map(async artist => ({
        ...artist,
        tags: await getArtistTags(artist.name),
      }))
    );

    // Aggregate genres across top artists, ranked by how often they appear
    const genreCounts = new Map<string, number>();
    for (const artist of taggedArtists) {
      for (const tag of artist.tags) {
        genreCounts.set(tag, (genreCounts.get(tag) || 0) + 1);
      }
    }
    const topGenres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre]) => genre);

    // Last.fm images come from Fastly, which is unreachable in some networks
    // (e.g. mainland China). Replace covers with real art from iTunes instead.
    const recentWithCovers = await mapWithConcurrency(
      recentTracks.slice(0, 10),
      async track => ({
        ...track,
        image: (await searchITunesCover(`${track.artist} ${track.name}`, 'song')) || '',
      })
    );
    const artistsWithCovers = await mapWithConcurrency(taggedArtists, async artist => {
      let cover = await searchITunesCover(artist.name, 'musicArtist');
      if (!cover) cover = await searchITunesCover(artist.name, 'song');
      return { ...artist, image: cover || '' };
    });
    const tracksWithCovers = await mapWithConcurrency(
      topTracks,
      async track => ({
        ...track,
        image: (await searchITunesCover(`${track.artist} ${track.name}`, 'song')) || '',
      })
    );
    const albumsWithCovers = await mapWithConcurrency(
      topAlbums,
      async album => ({
        ...album,
        image: (await searchITunesCover(`${album.artist} ${album.name}`, 'album')) || '',
      })
    );

    await saveITunesCoverMap();

    const stats: LastfmStats = {
      totalScrobbles,
      recentTracks: [...recentWithCovers, ...recentTracks.slice(10)],
      topArtists: artistsWithCovers,
      topTracks: tracksWithCovers,
      topAlbums: albumsWithCovers,
      topGenres,
    };

    await cache.set({ stats, timestamp: Date.now() });
    log.info(`Fetched Last.fm data: ${stats.totalScrobbles} scrobbles, ${stats.recentTracks.length} recent tracks`);
    return stats;
  } catch (error) {
    log.error('Error fetching Last.fm stats:', error);
    return null;
  }
}