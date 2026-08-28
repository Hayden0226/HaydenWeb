import type { APIRoute } from 'astro';
import { getSteamStats, getSteamAchievementDetails } from '../../../utils/steam';
import { createLogger } from '../../../utils/logger';

const log = createLogger('AchievementsAPI');

export async function getStaticPaths() {
  const stats = await getSteamStats();
  if (!stats) return [];
  return stats.topPlayedGames.map((game) => ({
    params: { appid: String(game.appid) },
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const appid = Number(params.appid);
  if (!appid) {
    return new Response(JSON.stringify({ error: 'Invalid appid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const details = await getSteamAchievementDetails(appid);
    return new Response(JSON.stringify({ appid, achievements: details?.achievements ?? [], global: details?.global ?? [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    log.error(`Error in achievements API for app ${appid}:`, error);
    return new Response(JSON.stringify({ appid, achievements: [], global: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
