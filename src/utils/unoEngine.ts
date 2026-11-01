import { CardColor, CardValue, UnoCard, PublicGameState, PlayerPrivate, GameAnnouncement } from '../types/uno.ts';

export const COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow'];
export const AVATARS = ['🦁', '🦊', '🐼', '🐸', '🦄', '🤖', '🐱', '🐶', '🐯', '🐙', '👾', '🚀'];

let cardCounter = 0;
export function createCard(color: CardColor, value: CardValue): UnoCard {
  cardCounter += 1;
  return {
    id: `${color}-${value}-${cardCounter}-${Math.random().toString(36).substring(2, 6)}`,
    color,
    value,
  };
}

/**
 * Builds the standard 108 card Uno deck
 */
export function buildUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = [];

  for (const color of COLORS) {
    // One '0' per color
    deck.push(createCard(color, '0'));

    // Two '1'-'9' per color
    for (let n = 1; n <= 9; n++) {
      const val = String(n) as CardValue;
      deck.push(createCard(color, val));
      deck.push(createCard(color, val));
    }

    // Action cards: 2 skip, 2 reverse, 2 draw2 per color
    for (let i = 0; i < 2; i++) {
      deck.push(createCard(color, 'skip'));
      deck.push(createCard(color, 'reverse'));
      deck.push(createCard(color, 'draw2'));
    }
  }

  // 4 Wild cards and 4 Wild Draw 4 cards
  for (let i = 0; i < 4; i++) {
    deck.push(createCard('black', 'wild'));
    deck.push(createCard('black', 'wild4'));
  }

  return shuffle(deck);
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Checks if a card is legally playable against current top card and active color
 */
export function isValidCardPlay(
  card: UnoCard,
  topCard: UnoCard | null,
  activeColor: CardColor | null
): boolean {
  if (!topCard) return true;
  // Wilds can always be played
  if (card.color === 'black') return true;

  const currentColor = activeColor || topCard.color;
  // Same color or same value
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;

  return false;
}

/**
 * Helper to compute the next player index considering direction and skips
 */
export function getNextPlayerIndex(
  currentIndex: number,
  playerCount: number,
  direction: 1 | -1,
  steps = 1
): number {
  if (playerCount <= 0) return 0;
  const raw = (currentIndex + direction * steps) % playerCount;
  return raw < 0 ? raw + playerCount : raw;
}
