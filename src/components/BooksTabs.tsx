import MediaTabs from './MediaTabs';
import BooksFilter from './BooksFilter';

interface Props {
  overview: any[];
  favorites: any[];
  watchlist: any[];
}

export default function BooksTabs({ overview, favorites, watchlist }: Props) {
  return (
    <MediaTabs
      tabs={[
        { id: 'overview', label: '总览 Overview' },
        { id: 'favorites', label: '收藏 Favorites' },
        { id: 'watchlist', label: '待看 Watchlist' },
      ]}
      groups={{ overview, favorites, watchlist }}
      renderGrid={(items) => <BooksFilter books={items} />}
    />
  );
}
