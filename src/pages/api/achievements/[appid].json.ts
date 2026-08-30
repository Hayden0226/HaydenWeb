import type { APIRoute } from 'astro';
import { getSteamStats, getSteamAchievementDetails, getFamilyLibraryMembers } from '../../../utils/steam';
import { createLogger } from '../../../utils/logger';

const log = createLogger('AchievementsAPI');

export async function getStaticPaths() {
  const [stats, members] = await Promise.all([
    getSteamStats(),
    getFamilyLibraryMembers(),
  ]);
  const appids = new Set<number>();
  for (const game of stats?.topPlayedGames ?? []) {
    appids.add(game.appid);
  }
  for (const member of members) {
    for (const game of member.games) {
      appids.add(game.appid);
    }
  }
  return [...appids].map((appid) => ({
    params: { appid: String(appid) },
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
