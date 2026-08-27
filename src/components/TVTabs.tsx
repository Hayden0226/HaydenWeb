import { useState } from 'react';
import TVFilter from './TVFilter';

interface ShowData {
  title: string;
  year: number;
  posterImage: string;
  firstAiredAt?: Date;
  rating?: number;
  link: string;
}

interface Show {
  data: ShowData;
}

interface TVTabsProps {
  overview: Show[];
  favorites: Show[];
  watchlist: Show[];
}

const TABS = [
  { id: 'overview', label: '总览 Overview' },
  { id: 'favorites', label: '收藏 Favorites' },
  { id: 'watchlist', label: '待看 Watchlist' },
] as const;

export default function TVTabs({ overview, favorites, watchlist }: TVTabsProps) {
  const [active, setActive] = useState<string>('overview');
  const groups: Record<string, Show[]> = { overview, favorites, watchlist };
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
        <TVFilter shows={current} />
      )}
    </div>
  );
}
