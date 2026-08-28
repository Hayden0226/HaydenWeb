import { useEffect, useRef, useState } from 'react';
import type { UnifiedGame } from '../utils/unified-games';
import type { SteamAchievementDetails } from '../utils/steam';
import GameCarousel from './GameCarousel';
import AchievementPanel from './AchievementPanel';

interface SteamLibraryProps {
  games: UnifiedGame[];
}

export default function SteamLibrary({ games }: SteamLibraryProps) {
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
    setSelected(game);
    // Scroll the detail panel into view on the next frame so the new content
    // doesn't jump while the user is reading the carousel.
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="relative">
      <GameCarousel games={games} title="Recent Games" onSelect={handleSelect} />
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
