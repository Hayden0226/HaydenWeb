import { useEffect, useRef, useState } from 'react';
import type { UnifiedGame } from '../utils/unified-games';
import type { SteamAchievementDetails, SteamStats } from '../utils/steam';
import GameCarousel from './GameCarousel';
import AchievementPanel from './AchievementPanel';

interface SteamLibraryProps {
  games: UnifiedGame[];
  stats?: SteamStats | null;
  // Controlled mode: when onSelect is provided, the parent owns the selection
  // and the achievement panel; SteamLibrary only renders stats + carousel.
  onSelect?: (game: UnifiedGame) => void;
}

export default function SteamLibrary({ games, stats, onSelect }: SteamLibraryProps) {
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
    if (onSelect) {
      onSelect(game);
      return;
    }
    setSelected(game);
    // Scroll the detail panel into view on the next frame so the new content
    // doesn't jump while the user is reading the carousel.
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="relative">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-64 flex-shrink-0">
          <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Steam</h3>
          {stats && (
            <div className="space-y-4">
              <div>
                <div className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>{stats.totalGames}</div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Games</div>
              </div>
              <div>
                <div className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>{stats.totalHoursPlayed.toLocaleString()}h</div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Hours Played</div>
              </div>
              <div>
                <div className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>{stats.gamesPlayedCount}</div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Games Played</div>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <GameCarousel games={games} title="Recent Games" onSelect={handleSelect} />
        </div>
      </div>
      {!onSelect && (
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
      )}
    </div>
  );
}
