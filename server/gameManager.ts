import { Server, Socket } from 'socket.io';
import {
  CardColor,
  CardValue,
  GameAnnouncement,
  PlayerPrivate,
  PlayerPublic,
  PublicGameState,
  UnoCard,
} from '../src/types/uno.ts';
import {
  buildUnoDeck,
  getNextPlayerIndex,
  isValidCardPlay,
  shuffle,
  COLORS,
  AVATARS,
} from '../src/utils/unoEngine.ts';
import {
  createOrSyncRoom,
  syncPlayerJoin,
  updateRoomStatus,
  updateWinnerScore,
} from './supabase.ts';

interface Room {
  roomCode: string;
  hostSocketId: string;
  players: PlayerPrivate[];
  deck: UnoCard[];
  discardPile: UnoCard[];
  currentTurnIndex: number;
  direction: 1 | -1;
  activeColor: CardColor | null;
  status: 'LOBBY' | 'PLAYING' | 'GAME_OVER';
  winner: PlayerPublic | null;
  announcements: GameAnnouncement[];
  canChallengeUno: {
    targetPlayerId: string;
    targetPlayerName: string;
    expiresAt: number;
  } | null;
  hasDrawnThisTurn: boolean;
  botTimeout?: NodeJS.Timeout;
  supabaseRoomId?: string | null;
}

const rooms = new Map<string, Room>();

const BOT_NAMES = ['Robô Uno 🤖', 'Byte Azul ⚡', 'Cyber Fox 🦊', 'Pixel Panda 🐼', 'Turbo Bot 🚀'];

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function getPublicGameState(room: Room): PublicGameState {
  return {
    roomCode: room.roomCode,
    status: room.status,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cardCount: p.hand.length,
      hasCalledUno: p.hasCalledUno,
      isBot: p.isBot,
      isConnected: p.isConnected,
      isHost: p.isHost,
    })),
    currentTurnIndex: room.currentTurnIndex,
    direction: room.direction,
    topCard: room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null,
    activeColor: room.activeColor,
    drawPileCount: room.deck.length,
    discardPileCount: room.discardPile.length,
    winner: room.winner,
    announcements: room.announcements.slice(-5),
    canChallengeUno:
      room.canChallengeUno && room.canChallengeUno.expiresAt > Date.now()
        ? room.canChallengeUno
        : null,
  };
}

function broadcastGameState(io: Server, room: Room) {
  const publicState = getPublicGameState(room);
  io.to(room.roomCode).emit('gameStateUpdate', publicState);

  // Send private hands to connected human players
  for (const player of room.players) {
    if (!player.isBot && player.isConnected) {
      io.to(player.id).emit('playerHandUpdate', {
        hand: player.hand,
        hasDrawnThisTurn: room.players[room.currentTurnIndex]?.id === player.id ? room.hasDrawnThisTurn : false,
      });
    }
  }
}

function addAnnouncement(room: Room, text: string, type: GameAnnouncement['type'] = 'play') {
  room.announcements.push({
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    text,
    type,
    timestamp: Date.now(),
  });
  if (room.announcements.length > 20) {
    room.announcements.shift();
  }
}

function drawCardsFromDeck(room: Room, count: number): UnoCard[] {
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      if (room.discardPile.length > 1) {
        const top = room.discardPile.pop()!;
        room.deck = shuffle(room.discardPile);
        room.discardPile = [top];
        addAnnouncement(room, 'O monte de compras foi reembaralhado!', 'draw');
      } else {
        break; // No cards left
      }
    }
    const card = room.deck.pop();
    if (card) drawn.push(card);
  }
  return drawn;
}

export function setupUnoGameSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    // 1. TV Host creates room
    socket.on('createRoom', (callback) => {
      const roomCode = generateRoomCode();
      const room: Room = {
        roomCode,
        hostSocketId: socket.id,
        players: [],
        deck: [],
        discardPile: [],
        currentTurnIndex: 0,
        direction: 1,
        activeColor: null,
        status: 'LOBBY',
        winner: null,
        announcements: [],
        canChallengeUno: null,
        hasDrawnThisTurn: false,
      };

      rooms.set(roomCode, room);
      socket.join(roomCode);
      addAnnouncement(room, `Sala ${roomCode} criada! Aguardando jogadores...`, 'play');

      // Sync with Supabase rooms table
      createOrSyncRoom(roomCode).then((supaId) => {
        if (supaId) {
          room.supabaseRoomId = supaId;
        }
      }).catch(() => {});

      if (typeof callback === 'function') {
        callback({ success: true, roomCode, state: getPublicGameState(room) });
      }
    });

    // 2. TV Host requests reconnect / sync
    socket.on('syncRoom', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, message: 'Sala não encontrada' });
        return;
      }
      socket.join(room.roomCode);
      if (typeof callback === 'function') {
        callback({ success: true, state: getPublicGameState(room) });
      }
    });

    // 3. Player joins from mobile phone
    socket.on('joinRoom', ({ roomCode, playerName, avatar }, callback) => {
      const code = roomCode?.toString()?.toUpperCase()?.replace(/[^A-Z0-9]/g, '')?.trim();
      const room = code ? rooms.get(code) : undefined;

      if (!room) {
        if (typeof callback === 'function') {
          callback({
            success: false,
            message: code
              ? `Sala "${code}" não encontrada! Verifique as 4 letras na tela da TV.`
              : 'Por favor, informe o código de 4 letras exibido na TV.',
          });
        }
        return;
      }

      if (room.status !== 'LOBBY') {
        // Check if player reconnecting by socket or name
        const existing = room.players.find((p) => p.name.toLowerCase() === playerName?.toLowerCase());
        if (existing) {
          existing.id = socket.id;
          existing.isConnected = true;
          socket.join(room.roomCode);
          addAnnouncement(room, `${existing.name} reconectou ao jogo!`, 'play');
          broadcastGameState(io, room);
          if (typeof callback === 'function') {
            callback({
              success: true,
              player: existing,
              state: getPublicGameState(room),
            });
          }
          return;
        }

        if (typeof callback === 'function') callback({ success: false, message: 'A partida já começou!' });
        return;
      }

      if (room.players.length >= 5) {
        if (typeof callback === 'function') callback({ success: false, message: 'A sala já está cheia (máx 5 jogadores)!' });
        return;
      }

      const cleanName = (playerName || `Jogador ${room.players.length + 1}`).trim().substring(0, 15);
      const chosenAvatar = avatar || AVATARS[room.players.length % AVATARS.length];

      const newPlayer: PlayerPrivate = {
        id: socket.id,
        name: cleanName,
        avatar: chosenAvatar,
        cardCount: 0,
        hasCalledUno: false,
        isBot: false,
        isConnected: true,
        isHost: room.players.length === 0,
        hand: [],
      };

      room.players.push(newPlayer);
      socket.join(room.roomCode);
      addAnnouncement(room, `${newPlayer.name} ${newPlayer.avatar} entrou na sala!`, 'play');

      // Sync player with Supabase players table
      if (room.supabaseRoomId) {
        syncPlayerJoin(room.supabaseRoomId, newPlayer.name, newPlayer.avatar).catch(() => {});
      } else {
        createOrSyncRoom(room.roomCode).then((supaId) => {
          if (supaId) {
            room.supabaseRoomId = supaId;
            syncPlayerJoin(supaId, newPlayer.name, newPlayer.avatar).catch(() => {});
          }
        }).catch(() => {});
      }

      broadcastGameState(io, room);

      if (typeof callback === 'function') {
        callback({
          success: true,
          player: newPlayer,
          state: getPublicGameState(room),
        });
      }
    });

    // 4. Host adds a Bot
    socket.on('addBot', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room || room.status !== 'LOBBY') return;
      if (room.players.length >= 5) {
        if (typeof callback === 'function') callback({ success: false, message: 'Limite de 5 jogadores atingido!' });
        return;
      }

      const botIndex = room.players.filter((p) => p.isBot).length;
      const botName = BOT_NAMES[botIndex % BOT_NAMES.length];
      const botAvatar = '🤖';

      const botPlayer: PlayerPrivate = {
        id: `bot-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        name: botName,
        avatar: botAvatar,
        cardCount: 0,
        hasCalledUno: false,
        isBot: true,
        isConnected: true,
        hand: [],
      };

      room.players.push(botPlayer);
      addAnnouncement(room, `${botPlayer.name} foi adicionado à partida!`, 'play');
      broadcastGameState(io, room);
      if (typeof callback === 'function') callback({ success: true });
    });

    // 5. Host removes a player/bot
    socket.on('removePlayer', ({ roomCode, playerId }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room || room.status !== 'LOBBY') return;

      const idx = room.players.findIndex((p) => p.id === playerId);
      if (idx !== -1) {
        const removed = room.players.splice(idx, 1)[0];
        addAnnouncement(room, `${removed.name} saiu da sala.`, 'play');
        broadcastGameState(io, room);
        if (typeof callback === 'function') callback({ success: true });
      }
    });

    // 6. Host starts the game
    socket.on('startGame', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return;

      if (room.players.length < 2) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'São necessários pelo menos 2 jogadores para iniciar!' });
        }
        return;
      }

      room.status = 'PLAYING';
      updateRoomStatus(room.roomCode, 'playing').catch(() => {});
      room.deck = buildUnoDeck();
      room.discardPile = [];
      room.winner = null;
      room.direction = 1;
      room.currentTurnIndex = 0;
      room.hasDrawnThisTurn = false;
      room.canChallengeUno = null;

      // Deal 7 cards each
      for (const player of room.players) {
        player.hand = drawCardsFromDeck(room, 7);
        player.hasCalledUno = false;
      }

      // Draw initial top card (must be a number or non-wild action)
      let initialTop: UnoCard | undefined;
      while (room.deck.length > 0) {
        const candidate = room.deck.pop()!;
        if (candidate.color !== 'black' && candidate.value !== 'wild' && candidate.value !== 'wild4') {
          initialTop = candidate;
          break;
        } else {
          // Put back in bottom
          room.deck.unshift(candidate);
        }
      }

      if (!initialTop) {
        initialTop = { id: 'init-card', color: 'red', value: '5' };
      }

      room.discardPile.push(initialTop);
      room.activeColor = initialTop.color;

      addAnnouncement(room, `A partida começou! Primeira carta: ${initialTop.color.toUpperCase()} ${initialTop.value}`, 'play');

      // Apply initial top card effects if action
      if (initialTop.value === 'skip') {
        room.currentTurnIndex = getNextPlayerIndex(0, room.players.length, room.direction, 1);
        addAnnouncement(room, `${room.players[0].name} foi pulado pela carta inicial!`, 'skip');
      } else if (initialTop.value === 'reverse') {
        room.direction = -1;
        room.currentTurnIndex = room.players.length === 2 ? 1 : room.players.length - 1;
        addAnnouncement(room, 'Sentido inicial invertido!', 'reverse');
      } else if (initialTop.value === 'draw2') {
        const target = room.players[0];
        target.hand.push(...drawCardsFromDeck(room, 2));
        room.currentTurnIndex = getNextPlayerIndex(0, room.players.length, room.direction, 1);
        addAnnouncement(room, `${target.name} comprou +2 cartas da mesa e perdeu a vez!`, 'draw');
      }

      broadcastGameState(io, room);

      if (typeof callback === 'function') callback({ success: true });

      checkBotTurn(io, room);
    });

    // 7. Player plays a card
    socket.on('playCard', ({ roomCode, cardId, chosenColor }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room || room.status !== 'PLAYING') {
        if (typeof callback === 'function') callback({ success: false, message: 'Partida não está ativa!' });
        return;
      }

      const currentPlayer = room.players[room.currentTurnIndex];
      if (!currentPlayer || currentPlayer.id !== socket.id) {
        if (typeof callback === 'function') callback({ success: false, message: 'Não é a sua vez!' });
        return;
      }

      const cardIndex = currentPlayer.hand.findIndex((c) => c.id === cardId);
      if (cardIndex === -1) {
        if (typeof callback === 'function') callback({ success: false, message: 'Carta não encontrada na mão!' });
        return;
      }

      const playedCard = currentPlayer.hand[cardIndex];
      const topCard = room.discardPile[room.discardPile.length - 1];

      if (!isValidCardPlay(playedCard, topCard, room.activeColor)) {
        if (typeof callback === 'function') callback({ success: false, message: 'Jogada inválida! Cor ou número não combinam.' });
        return;
      }

      // If wild card, must have a chosen color
      if (playedCard.color === 'black') {
        if (!chosenColor || !COLORS.includes(chosenColor)) {
          if (typeof callback === 'function') callback({ success: false, message: 'Por favor, escolha uma cor!' });
          return;
        }
      }

      // Check Uno condition before removing card
      const hadTwoCards = currentPlayer.hand.length === 2;
      const calledUno = currentPlayer.hasCalledUno;

      // Remove card from player hand
      currentPlayer.hand.splice(cardIndex, 1);
      room.discardPile.push(playedCard);
      room.hasDrawnThisTurn = false;

      // If player now has 1 card and DID NOT call UNO, make them vulnerable to challenge
      if (hadTwoCards && currentPlayer.hand.length === 1) {
        if (!calledUno) {
          room.canChallengeUno = {
            targetPlayerId: currentPlayer.id,
            targetPlayerName: currentPlayer.name,
            expiresAt: Date.now() + 7000, // 7 seconds window
          };
          addAnnouncement(room, `⚠️ ${currentPlayer.name} ficou com 1 carta e NÃO gritou UNO!`, 'uno');
        } else {
          addAnnouncement(room, `🔥 ${currentPlayer.name} gritou UNO com sucesso!`, 'uno');
        }
      }

      // Check for WIN
      if (currentPlayer.hand.length === 0) {
        room.status = 'GAME_OVER';
        updateRoomStatus(room.roomCode, 'finished').catch(() => {});
        updateWinnerScore(room.supabaseRoomId || null, currentPlayer.name).catch(() => {});
        room.winner = {
          id: currentPlayer.id,
          name: currentPlayer.name,
          avatar: currentPlayer.avatar,
          cardCount: 0,
          hasCalledUno: true,
          isBot: currentPlayer.isBot,
          isConnected: currentPlayer.isConnected,
        };
        addAnnouncement(room, `🏆 ${currentPlayer.name} VENCEU A PARTIDA!`, 'win');
        broadcastGameState(io, room);
        io.to(room.roomCode).emit('soundEffect', 'win');
        if (typeof callback === 'function') callback({ success: true });
        return;
      }

      // Apply card effects
      let turnStep = 1;
      let soundType: 'play' | 'skip' | 'reverse' | 'wild' | 'draw' = 'play';

      if (playedCard.value === 'skip') {
        const skippedIndex = getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, 1);
        const skippedPlayer = room.players[skippedIndex];
        turnStep = 2;
        soundType = 'skip';
        room.activeColor = playedCard.color;
        addAnnouncement(room, `${currentPlayer.name} jogou Bloqueio! ${skippedPlayer.name} pulou a vez!`, 'skip');
      } else if (playedCard.value === 'reverse') {
        soundType = 'reverse';
        room.activeColor = playedCard.color;
        if (room.players.length === 2) {
          turnStep = 2; // In 2-player Uno, Reverse acts as Skip
          addAnnouncement(room, `${currentPlayer.name} inverteu! O adversário pulou a vez!`, 'reverse');
        } else {
          room.direction = (room.direction * -1) as 1 | -1;
          turnStep = 1;
          addAnnouncement(room, `${currentPlayer.name} inverteu o sentido do jogo!`, 'reverse');
        }
      } else if (playedCard.value === 'draw2') {
        soundType = 'draw';
        room.activeColor = playedCard.color;
        const targetIndex = getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, 1);
        const targetPlayer = room.players[targetIndex];
        const drawnCards = drawCardsFromDeck(room, 2);
        targetPlayer.hand.push(...drawnCards);
        targetPlayer.hasCalledUno = false;
        turnStep = 2; // Skips their turn
        addAnnouncement(room, `${currentPlayer.name} jogou +2! ${targetPlayer.name} comprou 2 cartas e perdeu a vez!`, 'draw');
      } else if (playedCard.value === 'wild') {
        soundType = 'wild';
        room.activeColor = chosenColor;
        turnStep = 1;
        addAnnouncement(room, `${currentPlayer.name} escolheu a cor ${chosenColor?.toUpperCase()}!`, 'wild');
      } else if (playedCard.value === 'wild4') {
        soundType = 'wild';
        room.activeColor = chosenColor;
        const targetIndex = getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, 1);
        const targetPlayer = room.players[targetIndex];
        const drawnCards = drawCardsFromDeck(room, 4);
        targetPlayer.hand.push(...drawnCards);
        targetPlayer.hasCalledUno = false;
        turnStep = 2; // Skips their turn
        addAnnouncement(room, `${currentPlayer.name} jogou +4 e escolheu ${chosenColor?.toUpperCase()}! ${targetPlayer.name} comprou 4 cartas e perdeu a vez!`, 'wild');
      } else {
        room.activeColor = playedCard.color;
        addAnnouncement(room, `${currentPlayer.name} jogou ${playedCard.color.toUpperCase()} ${playedCard.value}`, 'play');
      }

      // Advance turn
      room.currentTurnIndex = getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, turnStep);

      broadcastGameState(io, room);
      io.to(room.roomCode).emit('soundEffect', soundType);

      if (typeof callback === 'function') callback({ success: true });

      checkBotTurn(io, room);
    });

    // 8. Player draws a card
    socket.on('drawCard', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room || room.status !== 'PLAYING') return;

      const currentPlayer = room.players[room.currentTurnIndex];
      if (!currentPlayer || currentPlayer.id !== socket.id) {
        if (typeof callback === 'function') callback({ success: false, message: 'Não é a sua vez!' });
        return;
      }

      if (room.hasDrawnThisTurn) {
        if (typeof callback === 'function') callback({ success: false, message: 'Você já comprou uma carta nesta rodada!' });
        return;
      }

      const drawnCards = drawCardsFromDeck(room, 1);
      if (drawnCards.length > 0) {
        currentPlayer.hand.push(drawnCards[0]);
        currentPlayer.hasCalledUno = false;
        room.hasDrawnThisTurn = true;
        addAnnouncement(room, `${currentPlayer.name} comprou uma carta do monte.`, 'draw');
      }

      broadcastGameState(io, room);
      io.to(room.roomCode).emit('soundEffect', 'draw');

      if (typeof callback === 'function') {
        callback({
          success: true,
          drawnCard: drawnCards[0] || null,
        });
      }
    });

    // 9. Player passes turn after drawing
    socket.on('passTurn', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room || room.status !== 'PLAYING') return;

      const currentPlayer = room.players[room.currentTurnIndex];
      if (!currentPlayer || currentPlayer.id !== socket.id) return;

      if (!room.hasDrawnThisTurn) {
        if (typeof callback === 'function') callback({ success: false, message: 'Você deve comprar uma carta antes de passar a vez!' });
        return;
      }

      room.hasDrawnThisTurn = false;
      room.currentTurnIndex = getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, 1);
      addAnnouncement(room, `${currentPlayer.name} passou a vez.`, 'play');

      broadcastGameState(io, room);
      if (typeof callback === 'function') callback({ success: true });

      checkBotTurn(io, room);
    });

    // 10. Player declares UNO!
    socket.on('callUno', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room || room.status !== 'PLAYING') return;

      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      if (player.hand.length <= 2) {
        player.hasCalledUno = true;
        if (room.canChallengeUno?.targetPlayerId === player.id) {
          room.canChallengeUno = null;
        }
        addAnnouncement(room, `🚨 ${player.name} gritou "UNO!" 🚨`, 'uno');
        broadcastGameState(io, room);
        io.to(room.roomCode).emit('soundEffect', 'uno');
        if (typeof callback === 'function') callback({ success: true });
      } else {
        if (typeof callback === 'function') callback({ success: false, message: 'Você só pode gritar UNO com 2 ou 1 carta!' });
      }
    });

    // 11. Player challenges another who forgot to call UNO
    socket.on('challengeUno', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room || !room.canChallengeUno) {
        if (typeof callback === 'function') callback({ success: false, message: 'Nenhuma contestação válida no momento!' });
        return;
      }

      const challenger = room.players.find((p) => p.id === socket.id);
      const targetPlayer = room.players.find((p) => p.id === room.canChallengeUno?.targetPlayerId);

      if (!targetPlayer || targetPlayer.hand.length !== 1 || targetPlayer.hasCalledUno) {
        room.canChallengeUno = null;
        broadcastGameState(io, room);
        if (typeof callback === 'function') callback({ success: false, message: 'Contestação expirada ou inválida!' });
        return;
      }

      // Penalty: Target draws 2 cards
      const penaltyCards = drawCardsFromDeck(room, 2);
      targetPlayer.hand.push(...penaltyCards);
      targetPlayer.hasCalledUno = false;
      const challengerName = challenger ? challenger.name : 'Alguém';

      addAnnouncement(
        room,
        `💥 ${challengerName} contestou o UNO de ${targetPlayer.name}! ${targetPlayer.name} comprou +2 cartas de penalidade!`,
        'penalty'
      );

      room.canChallengeUno = null;
      broadcastGameState(io, room);
      io.to(room.roomCode).emit('soundEffect', 'uno');

      if (typeof callback === 'function') callback({ success: true });
    });

    // 12. Floating emote reactions from players
    socket.on('sendEmote', ({ roomCode, emoji }) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return;

      const player = room.players.find((p) => p.id === socket.id);
      const emote = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        emoji,
        playerName: player ? player.name : 'Jogador',
        avatar: player ? player.avatar : '🎲',
        timestamp: Date.now(),
      };

      io.to(room.roomCode).emit('floatingEmote', emote);
    });

    // 13. Host restarts the game for another round
    socket.on('restartGame', ({ roomCode }, callback) => {
      const room = rooms.get(roomCode?.toUpperCase());
      if (!room) return;

      room.status = 'LOBBY';
      updateRoomStatus(room.roomCode, 'waiting').catch(() => {});
      room.winner = null;
      room.deck = [];
      room.discardPile = [];
      room.announcements = [];
      room.canChallengeUno = null;
      room.hasDrawnThisTurn = false;

      for (const p of room.players) {
        p.hand = [];
        p.hasCalledUno = false;
      }

      addAnnouncement(room, 'Nova partida iniciada! Aguardando o host...', 'play');
      broadcastGameState(io, room);

      if (typeof callback === 'function') callback({ success: true });
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      for (const [code, room] of rooms.entries()) {
        const player = room.players.find((p) => p.id === socket.id);
        if (player) {
          player.isConnected = false;
          addAnnouncement(room, `${player.name} desconectou.`, 'play');
          broadcastGameState(io, room);
        }
      }
    });
  });
}

/**
 * Handles bot turn logic automatically with human-like delay
 */
function checkBotTurn(io: Server, room: Room) {
  if (room.status !== 'PLAYING') return;

  const currentPlayer = room.players[room.currentTurnIndex];
  if (!currentPlayer || !currentPlayer.isBot) return;

  if (room.botTimeout) {
    clearTimeout(room.botTimeout);
  }

  room.botTimeout = setTimeout(() => {
    executeBotTurn(io, room, currentPlayer);
  }, 1400);
}

function executeBotTurn(io: Server, room: Room, bot: PlayerPrivate) {
  if (room.status !== 'PLAYING' || room.players[room.currentTurnIndex]?.id !== bot.id) {
    return;
  }

  const topCard = room.discardPile[room.discardPile.length - 1];
  const validCards = bot.hand.filter((c) => isValidCardPlay(c, topCard, room.activeColor));

  // Bot calls UNO if has 2 cards and can play 1
  if (bot.hand.length === 2 && validCards.length > 0) {
    bot.hasCalledUno = true;
    addAnnouncement(room, `🤖 ${bot.name} gritou "UNO!"`, 'uno');
    io.to(room.roomCode).emit('soundEffect', 'uno');
  }

  if (validCards.length > 0) {
    // Choose non-wild action cards first, or highest matching number, or wild
    validCards.sort((a, b) => {
      if (a.color !== 'black' && b.color === 'black') return -1;
      if (a.color === 'black' && b.color !== 'black') return 1;
      return 0;
    });

    const chosenCard = validCards[0];
    const cardIndex = bot.hand.findIndex((c) => c.id === chosenCard.id);
    bot.hand.splice(cardIndex, 1);
    room.discardPile.push(chosenCard);
    room.hasDrawnThisTurn = false;

    // Pick a color for wild: pick color with most cards in bot's hand
    let chosenColor: CardColor = 'red';
    if (chosenCard.color === 'black') {
      const counts: Record<CardColor, number> = { red: 0, blue: 0, green: 0, yellow: 0, black: 0 };
      bot.hand.forEach((c) => counts[c.color]++);
      chosenColor = (['red', 'blue', 'green', 'yellow'] as CardColor[]).reduce((max, c) =>
        counts[c] > counts[max] ? c : max
      , 'red');
    }

    // Check WIN
    if (bot.hand.length === 0) {
      room.status = 'GAME_OVER';
      updateRoomStatus(room.roomCode, 'finished').catch(() => {});
      updateWinnerScore(room.supabaseRoomId || null, bot.name).catch(() => {});
      room.winner = {
        id: bot.id,
        name: bot.name,
        avatar: bot.avatar,
        cardCount: 0,
        hasCalledUno: true,
        isBot: true,
        isConnected: true,
      };
      addAnnouncement(room, `🏆 ${bot.name} venceu a partida!`, 'win');
      broadcastGameState(io, room);
      io.to(room.roomCode).emit('soundEffect', 'win');
      return;
    }

    // Apply effects
    let turnStep = 1;
    let sound: 'play' | 'skip' | 'reverse' | 'wild' | 'draw' = 'play';

    if (chosenCard.value === 'skip') {
      const skipped = room.players[getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, 1)];
      turnStep = 2;
      sound = 'skip';
      room.activeColor = chosenCard.color;
      addAnnouncement(room, `${bot.name} jogou Bloqueio! ${skipped.name} pulou a vez!`, 'skip');
    } else if (chosenCard.value === 'reverse') {
      sound = 'reverse';
      room.activeColor = chosenCard.color;
      if (room.players.length === 2) {
        turnStep = 2;
        addAnnouncement(room, `${bot.name} inverteu! O adversário pulou a vez!`, 'reverse');
      } else {
        room.direction = (room.direction * -1) as 1 | -1;
        turnStep = 1;
        addAnnouncement(room, `${bot.name} inverteu o sentido do jogo!`, 'reverse');
      }
    } else if (chosenCard.value === 'draw2') {
      sound = 'draw';
      room.activeColor = chosenCard.color;
      const target = room.players[getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, 1)];
      target.hand.push(...drawCardsFromDeck(room, 2));
      target.hasCalledUno = false;
      turnStep = 2;
      addAnnouncement(room, `${bot.name} jogou +2! ${target.name} comprou 2 cartas!`, 'draw');
    } else if (chosenCard.value === 'wild') {
      sound = 'wild';
      room.activeColor = chosenColor;
      turnStep = 1;
      addAnnouncement(room, `${bot.name} jogou Coringa e escolheu ${chosenColor.toUpperCase()}!`, 'wild');
    } else if (chosenCard.value === 'wild4') {
      sound = 'wild';
      room.activeColor = chosenColor;
      const target = room.players[getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, 1)];
      target.hand.push(...drawCardsFromDeck(room, 4));
      target.hasCalledUno = false;
      turnStep = 2;
      addAnnouncement(room, `${bot.name} jogou +4 e escolheu ${chosenColor.toUpperCase()}! ${target.name} comprou 4 cartas!`, 'wild');
    } else {
      room.activeColor = chosenCard.color;
      addAnnouncement(room, `${bot.name} jogou ${chosenCard.color.toUpperCase()} ${chosenCard.value}`, 'play');
    }

    room.currentTurnIndex = getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, turnStep);
    broadcastGameState(io, room);
    io.to(room.roomCode).emit('soundEffect', sound);

    checkBotTurn(io, room);
  } else {
    // Bot draws a card
    const drawn = drawCardsFromDeck(room, 1);
    if (drawn.length > 0) {
      bot.hand.push(drawn[0]);
      bot.hasCalledUno = false;
      addAnnouncement(room, `${bot.name} comprou 1 carta.`, 'draw');
    }

    // Bot passes turn
    room.currentTurnIndex = getNextPlayerIndex(room.currentTurnIndex, room.players.length, room.direction, 1);
    broadcastGameState(io, room);
    io.to(room.roomCode).emit('soundEffect', 'draw');

    checkBotTurn(io, room);
  }
}
