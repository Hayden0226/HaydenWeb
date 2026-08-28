// AniList integration for the Anime page.
// Uses the free public AniList GraphQL API — no OAuth or API key required.

import { FileCache } from './cache';
import { createLogger } from './logger';
import type { AnimeStatus } from '../content/config';
import { fetchWithRetry } from './retry';

const log = createLogger('AniList');

const ANILIST_USERNAME = import.meta.env.ANILIST_USERNAME;
const ANILIST_API = 'https://graphql.anilist.co';

export interface AnimeEntry {
  title: string;
  englishTitle?: string;
  imageUrl: string;
  score?: number; // Normalized to 1-10
  status: AnimeStatus;
  episodes?: number;
  episodesWatched?: number;
  type?: string; // TV, Movie, OVA, ONA, Special, Music
  year?: number;
  startDate?: Date;
  endDate?: Date;
  entryUrl: string;
}

export interface AnimeData {
  anime: AnimeEntry[];
  timestamp: number;
}

const cache = new FileCache<AnimeData>('anilist-data', { ttl: 24 * 60 * 60 * 1000 });

const LIST_QUERY = `
query ($userName: String) {
  MediaListCollection(userName: $userName, type: ANIME) {
    user {
      mediaListOptions {
        scoreFormat
      }
    }
    lists {
      entries {
        status
        score
        progress
        media {
          id
          title {
            romaji
            english
          }
          format
          episodes
          seasonYear
          coverImage {
            extraLarge
            large
          }
          startDate {
            year
            month
            day
          }
          endDate {
            year
            month
            day
          }
        }
      }
    }
  }
}`;

/**
 * Convert AniList score (format depends on the user's settings) to a 1-10 scale.
 */
function normalizeScore(score: number | null | undefined, format: string): number | undefined {
  if (!score || score <= 0) return undefined;
  switch (format) {
    case 'POINT_100':
      return Math.round((score / 10) * 10) / 10;
    case 'POINT_10_DECIMAL':
    case 'POINT_10':
      return score;
    case 'POINT_5':
      return score * 2;
    case 'POINT_3':
      return Math.round((score / 3) * 10) / 10;
    default:
      return Math.round((score / 10) * 10) / 10;
  }
}

function mapStatus(status: string | undefined): AnimeStatus {
  switch (status) {
    case 'CURRENT':
    case 'REPEATING':
      return 'watching';
    case 'COMPLETED':
      return 'completed';
    case 'PAUSED':
      return 'on_hold';
    case 'DROPPED':
      return 'dropped';
    default:
      return 'plan_to_watch';
  }
}

function toDate(
  year?: number | null,
  month?: number | null,
  day?: number | null
): Date | undefined {
  if (!year) return undefined;
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return isNaN(date.getTime()) ? undefined : date;
}

async function fetchAnimeList(): Promise<AnimeEntry[]> {
  const response = await fetchWithRetry(
    ANILIST_API,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: LIST_QUERY,
        variables: { userName: ANILIST_USERNAME },
      }),
    },
    { maxRetries: 2, initialDelayMs: 1000 }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`AniList: ${json.errors[0].message}`);
  }

  const collection = json.data?.MediaListCollection;
  const scoreFormat = collection?.user?.mediaListOptions?.scoreFormat ?? 'POINT_100';
  const lists = collection?.lists ?? [];
  const anime: AnimeEntry[] = [];

  for (const list of lists) {
    for (const entry of list.entries ?? []) {
      const media = entry.media ?? {};
      anime.push({
        title: media.title?.romaji || media.title?.english || 'Untitled',
        englishTitle: media.title?.english || undefined,
        imageUrl: media.coverImage?.extraLarge || media.coverImage?.large || '',
        score: normalizeScore(entry.score, scoreFormat),
        status: mapStatus(entry.status),
        episodes: media.episodes || undefined,
        episodesWatched: entry.progress || undefined,
        type: media.format || undefined,
        year: media.seasonYear || undefined,
        startDate: toDate(media.startDate?.year, media.startDate?.month, media.startDate?.day),
        endDate: toDate(media.endDate?.year, media.endDate?.month, media.endDate?.day),
        entryUrl: `https://anilist.co/anime/${media.id}`,
      });
    }
  }

  return anime;
}

/**
 * Get all anime from the user's AniList account.
 */
export async function getAnimeData(): Promise<AnimeData | null> {
  const cached = await cache.get();
  if (cached) return cached;

  if (!ANILIST_USERNAME) {
    log.info('AniList username not configured, skipping...');
    return null;
  }

  try {
    const anime = await fetchAnimeList();
    const data: AnimeData = { anime, timestamp: Date.now() };
    await cache.set(data);
    log.info(`Fetched ${anime.length} anime from AniList`);
    return data;
  } catch (error) {
    log.error('Error fetching AniList data:', error);
    return null;
  }
}
