// Steam Web API integration
// Documentation: https://steamwebapi.azurewebsites.net/

import { fetchWithRetry } from './retry';
import { FileCache } from './cache';
import { createLogger } from './logger';
import { pLimit } from './concurrency';

const log = createLogger('Steam');

const STEAM_API_KEY = import.meta.env.STEAM_API_KEY;
const STEAM_ID = import.meta.env.STEAM_ID;
const BASE_URL = 'https://api.steampowered.com';

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number; // Total playtime in minutes
  rtime_last_played?: number; // Unix timestamp of last played
}

interface PlayerSummary {
  gameextrainfo?: string; // Currently playing game name
  personaname?: string; // Display name
  avatarfull?: string; // Full-size avatar URL
}

export interface SteamStats {
  topPlayedGames: SteamGame[];
  ownedGames: SteamGame[]; // All owned games (including never-played)
  totalGames: number;
  totalHoursPlayed: number;
  playerSummary: PlayerSummary;
  gamesPlayedCount: number; // Games with playtime > 0
}

interface SteamData {
  games: SteamGame[];
  stats: SteamStats;
  timestamp: number;
}

const cache = new FileCache<SteamData>('steam-data', {
  ttl: 24 * 60 * 60 * 1000,
});

export interface SteamAchievementInfo {
  unlocked: number;
  total: number;
}

export interface SteamAchievement {
  apiname: string;
  title: string;
  description: string;
  icon: string;
  iconGray: string;
  achieved: boolean;
  unlockTime?: number;
  hidden?: boolean;
}

export interface SteamGlobalAchievement {
  apiname: string;
  title: string;
  percent: number;
}

export interface SteamAchievementDetails {
  achievements: SteamAchievement[];
  global: SteamGlobalAchievement[];
}

interface SteamAchievementsData {
  games: Record<string, SteamAchievementInfo>;
  timestamp: number;
}

const achievementsCache = new FileCache<SteamAchievementsData>('steam-achievements', {
  ttl: 7 * 24 * 60 * 60 * 1000,
});

interface SteamAchievementDetailsData {
  games: Record<string, SteamAchievementDetails>;
  timestamp: number;
}

const achievementDetailsCache = new FileCache<SteamAchievementDetailsData>('steam-achievement-details-v2', {
  ttl: 7 * 24 * 60 * 60 * 1000,
});

// Steam is rate-limited on free API keys; serialize achievement requests so a
// large library can't trip 429s mid-build.
const achievementsLimit = pLimit(1);

/**
 * Fetch achievement progress for a single game (unlocked / total).
 * Returns null when the game has no achievements or the profile hides them.
 */
export async function getSteamAchievements(appid: number): Promise<SteamAchievementInfo | null> {
  if (!STEAM_API_KEY || !STEAM_ID) {
    return null;
  }

  return achievementsLimit(async () => {
    const key = String(appid);
    const cached = await achievementsCache.get();
    if (cached?.games?.[key]) {
      return cached.games[key];
    }

    try {
      const response = await fetchWithRetry(
        `${BASE_URL}/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appid}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json`,
        undefined,
        {
          maxRetries: 2,
          initialDelayMs: 1000,
          onRetry: (error, attempt) => {
            log.info(`Achievements retry ${attempt} for app ${appid}: ${error.message}`);
          },
        }
      );
      const data = await response.json();
      const stats = data.playerstats;
      // success === false means the game has no achievements or it hasn't been
      // played enough for the API to expose them.
      if (!stats || stats.success === false) {
        return null;
      }
      const achievements: { achieved?: boolean }[] = stats.achievements || [];
      const info: SteamAchievementInfo = {
        unlocked: achievements.filter((a) => a.achieved).length,
        total: achievements.length,
      };
      const all: SteamAchievementsData = {
        ...(cached ?? { games: {} }),
        games: { ...(cached?.games ?? {}), [key]: info },
        timestamp: Date.now(),
      };
      await achievementsCache.set(all);
      log.info(`Fetched Steam achievements for app ${appid}: ${info.unlocked}/${info.total}`);
      return info;
    } catch (error) {
      log.error(`Error fetching achievements for app ${appid}:`, error);
      return null;
    }
  });
}

interface SchemaAchievement {
  apiname?: string;
  name?: string;
  displayName?: string;
  desc?: string;
  description?: string;
  icon?: string;
  icongray?: string;
  hidden?: number;
}

/**
 * Fetch full achievement details (name, description, icons, unlock status,
 * hidden flag) plus global unlock percentages for a single game by merging
 * GetSchemaForGame + GetPlayerAchievements + GetGlobalAchievementPercentagesForApp.
 * Localized to Simplified Chinese when the game ships a zh-CN schema.
 */
export async function getSteamAchievementDetails(appid: number): Promise<SteamAchievementDetails | null> {
  if (!STEAM_API_KEY || !STEAM_ID) {
    return null;
  }

  return achievementsLimit(async () => {
    const key = String(appid);
    const cached = await achievementDetailsCache.get();
    if (cached?.games?.[key]) {
      return cached.games[key];
    }

    try {
      const [schemaRes, playerRes, globalRes] = await Promise.all([
        fetchWithRetry(
          `${BASE_URL}/ISteamUserStats/GetSchemaForGame/v2/?key=${STEAM_API_KEY}&appid=${appid}&l=schinese&format=json`,
          undefined,
          { maxRetries: 2, initialDelayMs: 1000 }
        ),
        fetchWithRetry(
          `${BASE_URL}/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appid}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json`,
          undefined,
          { maxRetries: 2, initialDelayMs: 1000 }
        ),
        fetchWithRetry(
          `${BASE_URL}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${appid}&format=json`,
          undefined,
          { maxRetries: 2, initialDelayMs: 1000 }
        ),
      ]);

      const schema = schemaRes.ok ? (await schemaRes.json()).game?.availableGameStats?.achievements as SchemaAchievement[] | undefined : undefined;
      const playerData = await playerRes.json();
      const playerAchievements = playerData.playerstats;
      if (!playerAchievements || playerAchievements.success === false) {
        return null;
      }

      const schemaMap = new Map<string, SchemaAchievement>();
      for (const item of schema ?? []) {
        const id = item.apiname || item.name || '';
        if (id) schemaMap.set(String(id).toLowerCase(), item);
      }

      const achievements: SteamAchievement[] = (playerAchievements.achievements || []).map((entry: { apiname: string; achieved?: boolean; unlocktime?: number }) => {
        const s = schemaMap.get(String(entry.apiname).toLowerCase());
        return {
          apiname: entry.apiname,
          title: s?.displayName || s?.name || entry.apiname,
          description: s?.description || s?.desc || '',
          icon: s?.icon || '',
          iconGray: s?.icongray || '',
          achieved: !!entry.achieved,
          unlockTime: entry.unlocktime,
          hidden: !!s?.hidden,
        };
      }).filter((d: SteamAchievement) => d.apiname);

      const globalPercent = new Map<string, number>();
      if (globalRes.ok) {
        const globalData = await globalRes.json();
        const list = globalData.achievementpercentages?.achievements ?? [];
        for (const item of list) {
          if (item?.name != null) {
            globalPercent.set(String(item.name).toLowerCase(), Number(item.percent));
          }
        }
      }

      const global: SteamGlobalAchievement[] = achievements.map((a) => ({
        apiname: a.apiname,
        title: a.title,
        percent: globalPercent.get(a.apiname.toLowerCase()) ?? 0,
      }));

      const details: SteamAchievementDetails = { achievements, global };
      const all: SteamAchievementDetailsData = {
        ...(cached ?? { games: {} }),
        games: { ...(cached?.games ?? {}), [key]: details },
        timestamp: Date.now(),
      };
      await achievementDetailsCache.set(all);
      log.info(`Fetched achievement details for app ${appid}: ${achievements.length} achievements, ${global.filter((g) => g.percent > 0).length} with global data`);
      return details;
    } catch (error) {
      log.error(`Error fetching achievement details for app ${appid}:`, error);
      return null;
    }
  });
}

/**
 * Fetch player summary (profile info, online status, currently playing)
 * Includes retry logic for transient failures
 */
async function getPlayerSummaryForSteamId(steamId: string): Promise<PlayerSummary | null> {
  if (!STEAM_API_KEY || !steamId) {
    log.error('Steam API key or Steam ID not configured');
    return null;
  }

  try {
    const response = await fetchWithRetry(
      `${BASE_URL}/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${steamId}`,
      undefined,
      {
        maxRetries: 2,
        initialDelayMs: 1000,
        onRetry: (error, attempt) => {
          log.info(`Player summary retry ${attempt}: ${error.message}`);
        },
      }
    );
    const data = await response.json();

    if (data.response?.players?.length > 0) {
      return data.response.players[0];
    }
    return null;
  } catch (error) {
    log.error('Error fetching Steam player summary:', error);
    return null;
  }
}

/**
 * Fetch all owned games with playtime for a given Steam ID
 * Includes retry logic for transient failures
 */
async function getOwnedGamesForSteamId(steamId: string): Promise<SteamGame[]> {
  if (!STEAM_API_KEY || !steamId) {
    log.error('Steam API key or Steam ID not configured');
    return [];
  }

  try {
    const response = await fetchWithRetry(
      `${BASE_URL}/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json&include_appinfo=true&include_played_free_games=true`,
      undefined,
      {
        maxRetries: 2,
        initialDelayMs: 1000,
        onRetry: (error, attempt) => {
          log.info(`Owned games retry ${attempt}: ${error.message}`);
        },
      }
    );
    const data = await response.json();

    return data.response?.games || [];
  } catch (error) {
    log.error('Error fetching owned games:', error);
    return [];
  }
}

/**
 * Get comprehensive Steam stats
 */
export async function getSteamStats(): Promise<SteamStats | null> {
  // Check cache first
  const cached = await cache.get();
  if (cached) {
    return cached.stats;
  }

  // Get fresh data from Steam
  log.info('Fetching Steam data...');

  try {
    const [playerSummary, ownedGames] = await Promise.all([
      getPlayerSummaryForSteamId(STEAM_ID),
      getOwnedGamesForSteamId(STEAM_ID),
    ]);

    if (!playerSummary) {
      log.error('Failed to get Steam player summary');
      return null;
    }

    // Calculate total hours played across all games
    const totalMinutes = ownedGames.reduce((sum, game) => sum + game.playtime_forever, 0);
    const totalHoursPlayed = Math.round(totalMinutes / 60);

    // Get games that have been played (playtime > 0), sorted by last played date
    const playedGames = ownedGames
      .filter(game => game.playtime_forever > 0)
      .sort((a, b) => (b.rtime_last_played || 0) - (a.rtime_last_played || 0));

    const stats: SteamStats = {
      topPlayedGames: playedGames,
      ownedGames,
      totalGames: ownedGames.length,
      totalHoursPlayed,
      playerSummary,
      gamesPlayedCount: playedGames.length,
    };

    // Save to cache
    const data: SteamData = {
      games: ownedGames,
      stats,
      timestamp: Date.now(),
    };
    await cache.set(data);

    log.info(`Fetched Steam data: ${stats.totalGames} games, ${stats.totalHoursPlayed} hours played`);

    return stats;
  } catch (error) {
    log.error('Error fetching Steam stats:', error);
    return null;
  }
}

/**
 * Get Steam game capsule image fallback URLs
 */
export function getGameCapsuleFallbacks(appid: number): string[] {
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    `https://media.steampowered.com/steam/apps/${appid}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
  ];
}

/**
 * Steam vertical library artwork (600x900), used as the initial cover so Steam
 * games always have art that fits the 3:4 card without cropping.
 */
export function getSteamLibraryUrl(appid: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
}

export interface FamilyMemberLibrary {
  steamid: string;
  personaname: string;
  avatar?: string;
  totalGames: number;
  totalHoursPlayed: number;
  games: SteamGame[];
}

const familyCache = new FileCache<{ members: FamilyMemberLibrary[]; timestamp: number }>('steam-family', {
  ttl: 24 * 60 * 60 * 1000,
});

const recentCache = new FileCache<{ games: SteamGame[]; timestamp: number }>('steam-recent', {
  ttl: 24 * 60 * 60 * 1000,
});

function getFamilyMemberIds(): string[] {
  const raw = (import.meta.env.STEAM_FAMILY_IDS as string | undefined) ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{17}$/.test(s));
}

/**
 * Fetch game libraries of Steam Family members (e.g. shared library owners).
 * Requires each member's game details to be public. Returns an empty array
 * when STEAM_FAMILY_IDS is unset.
 */
export async function getFamilyLibraryMembers(): Promise<FamilyMemberLibrary[]> {
  if (!STEAM_API_KEY) {
    return [];
  }
  const ids = getFamilyMemberIds();
  if (ids.length === 0) {
    return [];
  }

  const cached = await familyCache.get();
  if (cached) {
    return cached.members;
  }

  log.info(`Fetching Steam family libraries for ${ids.length} member(s)...`);
  const members = await Promise.all(
    ids.map(async (steamid): Promise<FamilyMemberLibrary | null> => {
      const [summary, games] = await Promise.all([
        getPlayerSummaryForSteamId(steamid),
        getOwnedGamesForSteamId(steamid),
      ]);
      if (!games || games.length === 0) {
        return null;
      }
      const totalMinutes = games.reduce((sum, game) => sum + game.playtime_forever, 0);
      return {
        steamid,
        personaname: summary?.personaname || steamid,
        avatar: summary?.avatarfull,
        totalGames: games.length,
        totalHoursPlayed: Math.round(totalMinutes / 60),
        games,
      };
    })
  );
  const result = members.filter((m): m is FamilyMemberLibrary => m !== null);

  await familyCache.set({ members: result, timestamp: Date.now() });
  log.info(`Fetched Steam family libraries: ${result.map((m) => `${m.personaname} (${m.totalGames} games)`).join(', ')}`);
  return result;
}

/**
 * Games played by the viewer's own account in the last two weeks.
 * Steam Family shared games that were actually played appear here with the
 * viewer's own playtime, which is the only public source for that data.
 */
export async function getRecentlyPlayedGames(): Promise<SteamGame[]> {
  if (!STEAM_API_KEY || !STEAM_ID) {
    return [];
  }

  const cached = await recentCache.get();
  if (cached) {
    return cached.games;
  }

  try {
    const response = await fetchWithRetry(
      `${BASE_URL}/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json`,
      undefined,
      {
        maxRetries: 2,
        initialDelayMs: 1000,
        onRetry: (error, attempt) => {
          log.info(`Recently played retry ${attempt}: ${error.message}`);
        },
      }
    );
    const data = await response.json();
    const games: SteamGame[] = data.response?.games ?? [];
    await recentCache.set({ games, timestamp: Date.now() });
    return games;
  } catch (error) {
    log.error('Error fetching recently played games:', error);
    return [];
  }
}
