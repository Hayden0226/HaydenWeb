import { useState } from 'react';
import AnimeFilter from './AnimeFilter';

interface AnimeData {
  title: string;
  englishTitle?: string;
  imageUrl: string;
  score?: number;
  status?: string;
  episodes?: number;
  episodesWatched?: number;
  type?: string;
  year?: number;
  startDate?: string;
  endDate?: string;
  entryUrl: string;
}

interface Anime {
  data: AnimeData;
}

interface AnimeTabsProps {
  overview: Anime[];
  favourites: Anime[];
}

const TABS = [
  { id: 'overview', label: '总览 Overview' },
  { id: 'favourites', label: '收藏 Favourites' },
] as const;

export default function AnimeTabs({ overview, favourites }: AnimeTabsProps) {
  const [active, setActive] = useState<string>('overview');
  const groups: Record<string, Anime[]> = { overview, favourites };
  const current = groups[active] ?? [];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8">
        {TABS.map(tab => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className="px-4 py-2 rounded-full border transition-colors cursor-pointer"
              style={isActive
                ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--bg-primary)' }
                : { backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
              }
            >
              {tab.label}
              <span className="ml-2 text-xs opacity-80">({(groups[tab.id] || []).length})</span>
            </button>
          );
        })}
      </div>

      {current.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
            暂无 {TABS.find(t => t.id === active)?.label ?? '内容'}
          </p>
        </div>
      ) : (
        <AnimeFilter anime={current} defaultStatus={active === 'favourites' ? 'all' : 'completed'} />
      )}
    </div>
  );
}
