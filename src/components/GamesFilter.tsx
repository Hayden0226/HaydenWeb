import type { UnifiedGame } from '../utils/unified-games';
import MediaFilterGrid, { type MediaFilterGridConfig } from './MediaFilterGrid';
import GameCard from './GameCard';
import ErrorBoundary from './ErrorBoundary';

interface GamesFilterProps {
  games: UnifiedGame[];
  onSelect?: (game: UnifiedGame) => void;
}

function GamesFilterInner({ games, onSelect }: GamesFilterProps) {
  const maxHours = Math.max(
    0,
    ...games.map((g) => Math.floor((g.steamData?.playtimeMinutes ?? 0) / 60))
  );

  const config: MediaFilterGridConfig<UnifiedGame> = {
    search: {
      placeholder: 'Search games...',
      match: (g, q) => g.name.toLowerCase().includes(q),
    },
    filters: [
      {
        id: 'playtime',
        label: 'Playtime',
        options: [
          { value: 'all', label: 'All Playtime' },
          ...(maxHours >= 5 ? [{ value: '5', label: '5h+' }] : []),
          ...(maxHours >= 20 ? [{ value: '20', label: '20h+' }] : []),
          ...(maxHours >= 100 ? [{ value: '100', label: '100h+' }] : []),
        ],
        match: (g, v) =>
          v === 'all' ||
          Math.floor((g.steamData?.playtimeMinutes ?? 0) / 60) >= parseInt(v),
      },
      {
        id: 'achievements',
        label: 'Achievements',
        options: [
          { value: 'all', label: 'All Games' },
          { value: 'has', label: 'Has Achievements' },
          { value: 'complete', label: '100% Complete' },
        ],
        match: (g, v) => {
          const a = g.steamData?.achievements;
          if (v === 'all') return true;
          if (v === 'has') return !!a && a.total > 0;
          if (v === 'complete') return !!a && a.total > 0 && a.unlocked >= a.total;
          return true;
        },
      },
    ],
    sortOptions: [
      {
        value: 'lastPlayed',
        label: 'Last Played',
        compare: (a, b) =>
          (b.steamData?.lastPlayed ?? 0) - (a.steamData?.lastPlayed ?? 0),
      },
      {
        value: 'playtime',
        label: 'Playtime (High to Low)',
        compare: (a, b) =>
          (b.steamData?.playtimeMinutes ?? 0) - (a.steamData?.playtimeMinutes ?? 0),
      },
      {
        value: 'name',
        label: 'Name (A-Z)',
        compare: (a, b) => a.name.localeCompare(b.name),
      },
      {
        value: 'achievements',
        label: 'Achievements (High to Low)',
        compare: (a, b) => {
          const pct = (g: UnifiedGame) => {
            const ach = g.steamData?.achievements;
            return ach && ach.total > 0 ? ach.unlocked / ach.total : -1;
          };
          return pct(b) - pct(a);
        },
      },
    ],
    defaultSort: 'playtime',
    card: {
      getKey: (g) => g.id,
      getTitle: (g) => g.name,
      getSubtitle: (g) => {
        if (g.sharedFrom) return '家庭共享';
        const hours = Math.floor((g.steamData?.playtimeMinutes ?? 0) / 60);
        const last = g.steamData?.lastPlayed;
        const parts = [hours > 0 ? `${hours}h` : 'Not played'];
        if (last && last > 0) parts.push(new Date(last * 1000).toLocaleDateString());
        return parts.join(' · ');
      },
      getImage: (g) => g.image,
    },
    renderItem: (g) => <GameCard game={g} onSelect={onSelect} />,
    gridClassName: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6',
    filterColumnClass: 'lg:grid-cols-4',
    itemNounPlural: 'games',
  };

  return <MediaFilterGrid items={games} config={config} />;
}

export default function GamesFilter(props: GamesFilterProps) {
  return (
    <ErrorBoundary sectionName="Games">
      <GamesFilterInner {...props} />
    </ErrorBoundary>
  );
}
