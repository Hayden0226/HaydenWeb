// Platform metadata shared between server-side game aggregation and the
// client-side game cards. Kept separate from unified-games.ts so the client
// bundle never pulls in server-only modules (Steam/IGDB/sharp).

export type Platform = 'steam' | 'psn' | 'nintendo';

export function getPlatformName(platform: Platform): string {
  switch (platform) {
    case 'steam':
      return 'Steam';
    case 'psn':
      return 'PlayStation';
    case 'nintendo':
      return 'Nintendo Switch';
  }
}

export function getPlatformColor(platform: Platform): string {
  switch (platform) {
    case 'steam':
      return '#1b2838';
    case 'psn':
      return '#003087';
    case 'nintendo':
      return '#e60012';
  }
}
