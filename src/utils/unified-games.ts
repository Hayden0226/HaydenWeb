// Unified game data structure combining Steam, PSN, and Nintendo
import { getSteamStats, getSteamAchievements, getSteamLibraryUrl, getRecentlyPlayedGames, type SteamGame, type SteamStats, type SteamAchievementInfo } from './steam';
import { getFamilyLibraryMembers, type FamilyMemberLibrary } from './steam';
import { getPSNData, type PSNGame, type PSNStats } from './psn';
import { getNintendoStats, type NintendoGame, type NintendoStats } from './nintendo';
import { getCoverGlowColor } from './cover-color';
import { createLogger } from './logger';
import type { Platform } from './platform';
import { STEAM_FAVORITE_APPIDS } from '../data/steam-favorites';
import { STEAM_COVER_OVERRIDES } from '../data/steam-cover-overrides';

const log = createLogger('Games');

export interface UnifiedGame {
  id: string; // Unique identifier combining platform + game ID
  name: string;
  platform: Platform;
  image: string; // Card/thumbnail image
  headerImage?: string; // Larger header image for modal
  glowColor?: string; // Dominant cover color for the hover halo
  favorite?: boolean; // In the Steam library "收藏夹" collection
  sharedFrom?: string; // Steam Family member this game is shared from

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
 * Build a unified game for a family member's library entry. The card is
 * marked as family-shared and intentionally carries no playtime/achievement
 * data of its own so only the viewer's own stats are ever displayed.
 */
export async function buildFamilySharedGame(
  game: SteamGame,
  member: FamilyMemberLibrary,
  achievements: SteamAchievementInfo | null = null,
  recent?: SteamGame
): Promise<UnifiedGame> {
  const image = getSteamLibraryUrl(game.appid);
  const glowColor = image ? await getCoverGlowColor(image) : null;
  return {
    id: `family-${member.steamid}-${game.appid}`,
    name: game.name,
    platform: 'steam',
    image,
    headerImage: image,
    glowColor: glowColor ?? undefined,
    sharedFrom: member.personaname,
    favorite: STEAM_FAVORITE_APPIDS.includes(game.appid),
    steamData: {
      appid: game.appid,
      playtimeMinutes: recent?.playtime_forever ?? 0,
      lastPlayed: recent?.rtime_last_played,
      achievements: achievements ?? undefined,
    },
  };
}

/**
 * Collect games shared via Steam Family that are NOT in the viewer's own
 * library, so they can be shown separately from personal game data.
 */
export async function getFamilySharedGames(): Promise<UnifiedGame[]> {
  const [members, ownStats, recentGames] = await Promise.all([
    getFamilyLibraryMembers(),
    getSteamStats(),
    getRecentlyPlayedGames(),
  ]);
  if (members.length === 0) {
    return [];
  }

  const ownAppids = new Set((ownStats?.ownedGames ?? []).map((g) => g.appid));
  const recentByAppid = new Map(recentGames.map((g) => [g.appid, g]));
  const shared: UnifiedGame[] = [];

  for (const member of members) {
    for (const game of member.games) {
      if (ownAppids.has(game.appid)) {
        continue; // Already owned — belongs in the personal library
      }
      const achievements = await getSteamAchievements(game.appid);
      shared.push(await buildFamilySharedGame(game, member, achievements, recentByAppid.get(game.appid)));
    }
  }
  return shared;
}

/**
 * Combine games from all platforms into a unified list with cover art.
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
    const filteredSteamGames = (steamStats.ownedGames ?? steamStats.topPlayedGames)
      .sort((a, b) => (b.rtime_last_played || 0) - (a.rtime_last_played || 0));
    const steamGames = await Promise.all(
      filteredSteamGames.map(async (game: SteamGame): Promise<UnifiedGame> => {
        const achievements = await getSteamAchievements(game.appid);
        const steamCover = getSteamLibraryUrl(game.appid);
        const image = STEAM_COVER_OVERRIDES[game.appid] ?? steamCover;
        const glowColor = image ? await getCoverGlowColor(image) : null;
        return {
          id: `steam-${game.appid}`,
          name: game.name,
          platform: 'steam',
          image,
          headerImage: image,
          glowColor: glowColor ?? undefined,
          favorite: STEAM_FAVORITE_APPIDS.includes(game.appid),
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
    const psnUnified = await Promise.all(
      psnGames.map(async (game: PSNGame): Promise<UnifiedGame> => {
        return {
          id: `psn-${game.titleId}`,
          name: game.name,
          platform: 'psn',
          image: '',
          headerImage: '',
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
    const nintendoUnified = await Promise.all(
      nintendoStats.recentGames.map(async (game: NintendoGame): Promise<UnifiedGame> => {
        return {
          id: `nintendo-${game.titleId}`,
          name: game.name,
          platform: 'nintendo',
          image: '',
          headerImage: '',
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
