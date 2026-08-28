import type { UnifiedGame } from '../utils/unified-games';
import GameCard from './GameCard';
import BaseCarousel from './BaseCarousel';
import ErrorBoundary from './ErrorBoundary';

interface GameCarouselProps {
  games: UnifiedGame[];
  title: string;
  onSelect?: (game: UnifiedGame) => void;
}

function GameCarouselInner({ games, title, onSelect }: GameCarouselProps) {
  return (
    <BaseCarousel itemCount={games.length} itemNoun="game" title={title} arrowZClass="z-30">
      {games.map((game) => (
        <div key={game.id} className="flex-shrink-0 w-56">
          <GameCard game={game} onSelect={onSelect} />
        </div>
      ))}
    </BaseCarousel>
  );
}

export default function GameCarousel(props: GameCarouselProps) {
  return <ErrorBoundary sectionName="Games"><GameCarouselInner {...props} /></ErrorBoundary>;
}
