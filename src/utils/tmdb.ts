// TMDB TV integration
// Reads the user's watched/rated TV, favorites and watchlist from TMDB v4.
// The access token embeds the account object id in its JWT "sub" claim, so it
// is derived automatically when TMDB_ACCOUNT_OBJECT_ID is not provided.

import { fetchWithRetry } from './retry';
import { FileCache } from './cache';
import { createLogger } from './logger';

const TMDB_ACCESS_TOKEN = import.meta.env.TMDB_ACCESS_TOKEN;

// The v4 access token embeds the account object id in its JWT "sub" claim, so it
// can be derived automatically when TMDB_ACCOUNT_OBJECT_ID is not provided (or
// set incorrectly). This removes a common source of 404s on account endpoints.
function extractAccountObjectId(token?: string): string | undefined {
  if (!token) return undefined;
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return undefined;
  try {
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

const TMDB_ACCOUNT_OBJECT_ID =
  extractAccountObjectId(TMDB_ACCESS_TOKEN) || import.meta.env.TMDB_ACCOUNT_OBJECT_ID;
const TMDB_TV_LIST_ID = import.meta.env.TMDB_TV_LIST_ID;

const log = createLogger('TMDB');
const cache = new FileCache<TmdbTVData>('tmdb-tv-data', { ttl: 24 * 60 * 60 * 1000 });

// TV summary object as returned in v4 list/rated/favorite/watchlist results
interface TmdbTVResult {
  id: number;
  name: string;
  first_air_date?: string;
  poster_path?: string;
  media_type?: string;
  account_rating?: {
    value: number;
  };
}

export interface TVShow {
  title: string;
  year: number;
  tmdbId: number;
  posterImage: string;
  firstAiredAt?: Date;
  rating?: number;
  link: string;
}

export interface TmdbTVData {
  overview: TVShow[];
  favorites: TVShow[];
  watchlist: TVShow[];
  stats: {
    totalShows: number;
    rated: number;
    averageRating: number;
  };
  timestamp: number;
}

/**
 * Fetch all pages of a v4 endpoint that returns { results, total_pages }
 * Includes retry logic for transient failures
 */
async function fetchAllPages(endpoint: string): Promise<TmdbTVResult[]> {
  const results: TmdbTVResult[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const response = await fetchWithRetry(
      `https://api.themoviedb.org/4${endpoint}${separator}page=${page}`,
      {
        headers: {
          'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
        },
      },
      {
        maxRetries: 2,
        initialDelayMs: 1000,
        onRetry: (error, attempt) => {
          log.info(`TMDB retry ${attempt} for ${endpoint} page ${page}: ${error.message}`);
        },
      }
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} for ${endpoint} page ${page}`);
    }

    const data = await response.json();
    results.push(...(data.results || []));
    totalPages = data.total_pages || 1;
    page++;
  }

  return results;
}

// Some optional account endpoints (favorite) return 404 when the user has no
// entries. Treat that as "empty" rather than a hard failure.
async function safeFetchAllPages(endpoint: string): Promise<TmdbTVResult[]> {
  try {
    return await fetchAllPages(endpoint);
  } catch (error) {
    if (/404/.test(String(error))) {
      log.info(`TMDB endpoint returned 404 (likely empty): ${endpoint}`);
      return [];
    }
    throw error;
  }
}

function toShows(items: TmdbTVResult[], ratingsMap: Map<number, number>): TVShow[] {
  return items
    .filter(item => item.media_type !== 'movie')
    .map(item => ({
      title: item.name,
      year: item.first_air_date ? parseInt(item.first_air_date.slice(0, 4), 10) : 0,
      tmdbId: item.id,
      posterImage: item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : '',
      firstAiredAt: item.first_air_date ? new Date(item.first_air_date) : undefined,
      rating: ratingsMap.get(item.id),
      link: `https://www.themoviedb.org/tv/${item.id}`,
    }));
}

function byFirstAiredDesc(a: TVShow, b: TVShow): number {
  return (b.firstAiredAt?.getTime() || 0) - (a.firstAiredAt?.getTime() || 0);
}

/**
 * Get all TV data for display: overview (watched/rated, plus an optional list),
 * favorites and watchlist.
 */
export async function getTmdbTVData(): Promise<TmdbTVData | null> {
  // Check cache first
  const cached = await cache.get();
  if (cached) {
    return cached;
  }

  if (!TMDB_ACCESS_TOKEN || !TMDB_ACCOUNT_OBJECT_ID) {
    log.info('TMDB credentials not configured, skipping...');
    return null;
  }

  log.info('Fetching TV shows from TMDB...');

  try {
    const [listItems, ratedShows, favoriteShows, watchlistShows] = await Promise.all([
      TMDB_TV_LIST_ID
        ? fetchAllPages(`/list/${TMDB_TV_LIST_ID}`)
        : Promise.resolve([]),
      fetchAllPages(`/account/${TMDB_ACCOUNT_OBJECT_ID}/tv/rated`),
      safeFetchAllPages(`/account/${TMDB_ACCOUNT_OBJECT_ID}/tv/favorite`),
      safeFetchAllPages(`/account/${TMDB_ACCOUNT_OBJECT_ID}/tv/watchlist`),
    ]);

    const ratingsMap = new Map<number, number>();
    for (const rated of ratedShows) {
      if (rated.account_rating?.value) {
        ratingsMap.set(rated.id, rated.account_rating.value);
      }
    }

    // Overview = de-duplicated watched/rated set, plus any optional list entries.
    const showMap = new Map<number, TmdbTVResult>();
    for (const item of listItems) {
      if (item.media_type !== 'movie') showMap.set(item.id, item);
    }
    for (const rated of ratedShows) {
      if (rated.media_type !== 'movie' && !showMap.has(rated.id)) {
        showMap.set(rated.id, rated);
      }
    }

    const overview = toShows([...showMap.values()], ratingsMap).sort(byFirstAiredDesc);
    const favorites = toShows(favoriteShows, ratingsMap).sort(byFirstAiredDesc);
    const watchlist = toShows(watchlistShows, ratingsMap).sort(byFirstAiredDesc);

    if (!overview.length && !favorites.length && !watchlist.length) {
      log.error('No shows found in TMDB lists/ratings');
      return null;
    }

    const ratedOverview = overview.filter(s => s.rating && s.rating > 0);
    const averageRating = ratedOverview.length > 0
      ? ratedOverview.reduce((sum, s) => sum + (s.rating || 0), 0) / ratedOverview.length
      : 0;

    const data: TmdbTVData = {
      overview,
      favorites,
      watchlist,
      stats: {
        totalShows: overview.length,
        rated: ratedOverview.length,
        averageRating: Math.round(averageRating * 10) / 10,
      },
      timestamp: Date.now(),
    };

    // Save to cache
    await cache.set(data);

    log.info(
      `Fetched ${overview.length} overview / ${favorites.length} favorites / ${watchlist.length} watchlist from TMDB`
    );

    return data;
  } catch (error) {
    log.error('Error fetching TMDB TV data:', error);
    return null;
  }
}
