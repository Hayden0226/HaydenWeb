import { useEffect, useRef, useState } from 'react';
import type { UnifiedGame } from '../utils/unified-games';
import type { SteamAchievementDetails, SteamStats } from '../utils/steam';
import MediaTabs from './MediaTabs';
import GamesFilter from './GamesFilter';
import SteamLibrary from './SteamLibrary';
import AchievementPanel from './AchievementPanel';
import ErrorBoundary from './ErrorBoundary';

interface GamesTabsProps {
  games: UnifiedGame[];
  stats?: SteamStats | null;
}

function GamesTabsInner({ games, stats }: GamesTabsProps) {
  const [selected, setSelected] = useState<UnifiedGame | null>(null);
  const [details, setDetails] = useState<SteamAchievementDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const appid = selected?.steamData?.appid;
    if (!appid) {
      setDetails(null);
      setError(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setDetails(null);
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}api/achievements/${appid}.json`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setDetails({ achievements: data.achievements ?? [], global: data.global ?? [] });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleSelect = (game: UnifiedGame) => {
    if (game.sharedFrom) return; // Family-shared games have no personal achievement data
    setSelected(game);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const overview = games;
  const favorites = games.filter((g) => g.favorite);
  const recent = games.filter((g) => !g.sharedFrom && (g.steamData?.playtimeMinutes ?? 0) > 0);

  return (
    <div>
      <MediaTabs
        tabs={[
          { id: 'overview', label: '总览 Overview' },
          { id: 'favorites', label: '收藏夹 Favorites' },
          { id: 'recent', label: '最近 Recent' },
        ]}
        groups={{ overview, favorites, recent }}
        renderGrid={(items, activeId) => {
          if (activeId === 'recent') {
            return (
              <div className="p-6 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <SteamLibrary games={recent} stats={stats} onSelect={handleSelect} />
              </div>
            );
          }
          return <GamesFilter games={items} onSelect={handleSelect} />;
        }}
      />

      <div ref={panelRef}>
        {selected && (
          <AchievementPanel
            game={selected}
            achievements={details?.achievements ?? []}
            global={details?.global ?? []}
            loading={loading}
            error={error}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function GamesTabs(props: GamesTabsProps) {
  return (
    <ErrorBoundary sectionName="Games">
      <GamesTabsInner {...props} />
    </ErrorBoundary>
  );
}
