// Unified game data structure combining Steam, PSN, and Nintendo
import { getSteamStats, getSteamAchievements, getSteamLibraryUrl, type SteamGame, type SteamStats, type SteamAchievementInfo } from './steam';
import { getPSNData, type PSNGame, type PSNStats } from './psn';
import { getNintendoStats, type NintendoGame, type NintendoStats } from './nintendo';
import { getIGDBCoverUrl, isExcludedGame, flushIGDBCache } from './igdb';
import { getCoverGlowColor } from './cover-color';
import { createLogger } from './logger';
import type { Platform } from './platform';

const log = createLogger('Games');

export interface UnifiedGame {
  id: string; // Unique identifier combining platform + game ID
  name: string;
  platform: Platform;
  image: string; // Card/thumbnail image
  headerImage?: string; // Larger header image for modal
  glowColor?: string; // Dominant cover color for the hover halo

  // Platform-specific data
  steamData?: {
    appid: number;
    playtimeMinutes: number;
    lastPlayed?: number;
    achievements?: SteamAchievementInfo;
  };

  psnData?: {
    titleId: string;
    category: string;
    playDuration?: string;
    lastPlayed?: string;
    trophies?: {
      bronze: number;
      silver: number;
      gold: number;
      platinum: number;
      total: number;
    };
  };

  nintendoData?: {
    titleId: string;
    playtimeSeconds: number;
    lastPlayed?: number;
  };
}

export interface AllGamesResult {
  games: UnifiedGame[];
  steamStats: SteamStats | null;
  psnStats: PSNStats | null;
  nintendoStats: NintendoStats | null;
}

/**
 * Combine games from all platforms into a unified list with IGDB cover art.
 * Returns games + per-platform stats in a single call to avoid double-fetching.
 */
export async function getAllGames(): Promise<AllGamesResult> {
  const [steamStats, psnData, nintendoStats] = await Promise.all([
    getSteamStats(),
    getPSNData(),
    getNintendoStats(),
  ]);

  const unifiedGames: UnifiedGame[] = [];

  // Add Steam games
  if (steamStats) {
    log.info('Fetching IGDB covers for Steam games...');
    const filteredSteamGames = steamStats.topPlayedGames.filter(
      (game: SteamGame) => !isExcludedGame(game.name)
    );
    const steamGames = await Promise.all(
      filteredSteamGames.map(async (game: SteamGame): Promise<UnifiedGame> => {
        const [igdbCover, achievements] = await Promise.all([
          getIGDBCoverUrl(game.name, 'steam'),
          getSteamAchievements(game.appid),
        ]);
        const steamCover = getSteamLibraryUrl(game.appid);
        const image = igdbCover || steamCover;
        const glowColor = image ? await getCoverGlowColor(image) : null;
        return {
          id: `steam-${game.appid}`,
          name: game.name,
          platform: 'steam',
          image,
          headerImage: image,
          glowColor: glowColor ?? undefined,
          steamData: {
            appid: game.appid,
            playtimeMinutes: game.playtime_forever,
            lastPlayed: game.rtime_last_played,
            achievements: achievements ?? undefined,
          },
        };
      })
    );
    unifiedGames.push(...steamGames);
  }

  // Add PSN games
  const psnGames = psnData?.games;
  if (psnGames && psnGames.length > 0) {
    log.info('Fetching IGDB covers for PlayStation games...');
    const filteredPsnGames = psnGames.filter(
      (game: PSNGame) => !isExcludedGame(game.name)
    );
    const psnUnified = await Promise.all(
      filteredPsnGames.map(async (game: PSNGame): Promise<UnifiedGame> => {
        const igdbCover = await getIGDBCoverUrl(game.name, 'psn');
        const glowColor = igdbCover ? await getCoverGlowColor(igdbCover) : null;
        return {
          id: `psn-${game.titleId}`,
          name: game.name,
          platform: 'psn',
          image: igdbCover || '',
          headerImage: igdbCover || '',
          glowColor: glowColor ?? undefined,
          psnData: {
            titleId: game.titleId,
            category: game.category,
            playDuration: game.playDuration,
            lastPlayed: game.lastPlayedDateTime,
            trophies: game.earnedTrophies ? {
              bronze: game.earnedTrophies.bronze,
              silver: game.earnedTrophies.silver,
              gold: game.earnedTrophies.gold,
              platinum: game.earnedTrophies.platinum,
              total: game.earnedTrophies.bronze + game.earnedTrophies.silver +
                     game.earnedTrophies.gold + game.earnedTrophies.platinum,
            } : undefined,
          },
        };
      })
    );
    unifiedGames.push(...psnUnified);
  }

  // Add Nintendo games
  if (nintendoStats && nintendoStats.recentGames.length > 0) {
    log.info('Fetching IGDB covers for Nintendo games...');
    const filteredNintendoGames = nintendoStats.recentGames.filter(
      (game: NintendoGame) => !isExcludedGame(game.name)
    );
    const nintendoUnified = await Promise.all(
      filteredNintendoGames.map(async (game: NintendoGame): Promise<UnifiedGame> => {
        const igdbCover = await getIGDBCoverUrl(game.name, 'nintendo');
        const glowColor = igdbCover ? await getCoverGlowColor(igdbCover) : null;
        return {
          id: `nintendo-${game.titleId}`,
          name: game.name,
          platform: 'nintendo',
          image: igdbCover || '',
          headerImage: igdbCover || '',
          glowColor: glowColor ?? undefined,
          nintendoData: {
            titleId: game.titleId,
            playtimeSeconds: game.totalPlayTime,
            lastPlayed: game.lastPlayedAt,
          },
        };
      })
    );
    unifiedGames.push(...nintendoUnified);
  }

  // Flush IGDB cache once after all covers are fetched
  await flushIGDBCache();

  log.info(`Total games with IGDB covers: ${unifiedGames.filter(g => g.image).length}/${unifiedGames.length}`);
  return {
    games: unifiedGames,
    steamStats,
    psnStats: psnData?.stats ?? null,
    nintendoStats,
  };
}

// Re-exported so existing importers of unified-games keep working; these are
// pure client-safe helpers defined in platform.ts.
export { type Platform, getPlatformName, getPlatformColor } from './platform';
