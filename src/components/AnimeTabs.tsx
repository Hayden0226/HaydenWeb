import MediaTabs from './MediaTabs';
import AnimeFilter from './AnimeFilter';

interface Props {
  overview: any[];
  favourites: any[];
  watchlist: any[];
}

export default function AnimeTabs({ overview, favourites, watchlist }: Props) {
  return (
    <MediaTabs
      tabs={[
        { id: 'overview', label: '总览 Overview' },
        { id: 'favourites', label: '收藏 Favorites' },
        { id: 'watchlist', label: '待看 Watchlist' },
      ]}
      groups={{ overview, favourites, watchlist }}
      renderGrid={(items, activeId) => (
        <AnimeFilter anime={items} defaultStatus={activeId === 'overview' ? 'completed' : 'all'} />
      )}
    />
  );
}
