export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'black';

export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

export interface UnoCard {
  id: string;
  color: CardColor;
  value: CardValue;
}

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: string;
  cardCount: number;
  hasCalledUno: boolean;
  isBot: boolean;
  isConnected: boolean;
  isHost?: boolean;
}

export interface PlayerPrivate extends PlayerPublic {
  hand: UnoCard[];
}

export type GameStatus = 'LOBBY' | 'PLAYING' | 'GAME_OVER';

export interface GameAnnouncement {
  id: string;
  text: string;
  type: 'play' | 'draw' | 'skip' | 'reverse' | 'uno' | 'wild' | 'penalty' | 'win';
  timestamp: number;
}

export interface FloatingEmote {
  id: string;
  emoji: string;
  playerName: string;
  avatar: string;
  timestamp: number;
}

export interface PublicGameState {
  roomCode: string;
  status: GameStatus;
  players: PlayerPublic[];
  currentTurnIndex: number;
  direction: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
  topCard: UnoCard | null;
  activeColor: CardColor | null;
  drawPileCount: number;
  discardPileCount: number;
  winner: PlayerPublic | null;
  announcements: GameAnnouncement[];
  canChallengeUno: {
    targetPlayerId: string;
    targetPlayerName: string;
    expiresAt: number;
  } | null;
}

export interface ControllerState {
  roomCode: string;
  player: PlayerPrivate | null;
  publicState: PublicGameState | null;
  isMyTurn: boolean;
  canDraw: boolean;
  canPass: boolean;
  hasDrawnThisTurn: boolean;
}
