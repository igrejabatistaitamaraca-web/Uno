import React, { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import {
  CardColor,
  PlayerPrivate,
  PublicGameState,
  UnoCard as UnoCardType,
} from '../types/uno.ts';
import { UnoCard } from './UnoCard.tsx';
import { isValidCardPlay, AVATARS, COLORS } from '../utils/unoEngine.ts';
import { sounds } from '../utils/audio.ts';
import {
  Sparkles,
  AlertOctagon,
  ArrowRight,
  ShieldAlert,
  Smartphone,
  Flame,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

interface ControllerViewProps {
  socket: Socket | null;
  initialRoomCode?: string;
  isSocketConnected?: boolean;
  onExit: () => void;
}

const EMOTES = ['😂', '🔥', '😱', '👑', '💩', '🤡', '🚀', '❤️'];

export const ControllerView: React.FC<ControllerViewProps> = ({
  socket,
  initialRoomCode = '',
  isSocketConnected = false,
  onExit,
}) => {
  // Join form state
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase().trim());
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('uno_player_name') || ''
  );
  const [avatar, setAvatar] = useState(
    () => localStorage.getItem('uno_player_avatar') || '🦊'
  );
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Keep room code in sync if initialRoomCode changes
  useEffect(() => {
    if (initialRoomCode) {
      setRoomCode(initialRoomCode.toUpperCase().trim());
    }
  }, [initialRoomCode]);

  // Game state
  const [publicState, setPublicState] = useState<PublicGameState | null>(null);
  const [hand, setHand] = useState<UnoCardType[]>([]);
  const [hasDrawnThisTurn, setHasDrawnThisTurn] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [selectedWildCard, setSelectedWildCard] = useState<UnoCardType | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Keep screen awake on mobile devices
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          setWakeLockActive(true);
        }
      } catch {
        // WakeLock not supported or denied
      }
    };

    if (isJoined) {
      requestWakeLock();
    }

    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [isJoined]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleGameStateUpdate = (state: PublicGameState) => {
      setPublicState(state);
      const current = state.players[state.currentTurnIndex];
      const isNowMyTurn = current?.id === socket.id;

      // Turn vibration and sound alert
      if (isNowMyTurn && !isMyTurn) {
        sounds.turnAlert();
        if (navigator.vibrate) {
          navigator.vibrate([120, 80, 120]);
        }
      }

      setIsMyTurn(isNowMyTurn);
    };

    const handlePlayerHandUpdate = (data: { hand: UnoCardType[]; hasDrawnThisTurn: boolean }) => {
      setHand(data.hand);
      setHasDrawnThisTurn(data.hasDrawnThisTurn);
    };

    socket.on('gameStateUpdate', handleGameStateUpdate);
    socket.on('playerHandUpdate', handlePlayerHandUpdate);

    return () => {
      socket.off('gameStateUpdate', handleGameStateUpdate);
      socket.off('playerHandUpdate', handlePlayerHandUpdate);
    };
  }, [socket, isMyTurn]);

  // Join Room
  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCode.replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
    const cleanName = playerName.trim() || `Jogador ${Math.floor(Math.random() * 899 + 100)}`;

    if (!cleanCode) {
      setJoinError('Por favor, informe o código de 4 letras exibido na TV!');
      return;
    }

    setJoinError('');
    setIsJoining(true);
    localStorage.setItem('uno_player_name', cleanName);
    localStorage.setItem('uno_player_avatar', avatar);

    // Timeout safety guard
    const timeoutId = setTimeout(() => {
      setIsJoining(false);
      setJoinError('O servidor demorou para responder. Verifique se a sala está aberta na TV e tente novamente.');
    }, 6000);

    const sendJoin = () => {
      if (!socket) {
        clearTimeout(timeoutId);
        setIsJoining(false);
        setJoinError('Conectando ao servidor... Tente novamente em um instante.');
        return;
      }

      socket.emit(
        'joinRoom',
        { roomCode: cleanCode, playerName: cleanName, avatar },
        (res: { success: boolean; message?: string; player?: PlayerPrivate; state?: PublicGameState }) => {
          clearTimeout(timeoutId);
          setIsJoining(false);
          if (res.success && res.state) {
            setIsJoined(true);
            setPublicState(res.state);
            if (res.player) {
              setHand(res.player.hand);
            }
            sounds.playCard();
          } else {
            setJoinError(res.message || 'Falha ao entrar na sala.');
          }
        }
      );
    };

    if (!socket || !socket.connected) {
      if (socket) {
        socket.connect();
        socket.once('connect', sendJoin);
      } else {
        clearTimeout(timeoutId);
        setIsJoining(false);
        setJoinError('Conectando ao servidor... Aguarde 1 segundo e toque novamente.');
      }
    } else {
      sendJoin();
    }
  };

  // Card play action
  const handleCardClick = (card: UnoCardType) => {
    if (!socket || !isMyTurn || !publicState) return;

    if (!isValidCardPlay(card, publicState.topCard ?? null, publicState.activeColor ?? null)) {
      sounds.skip();
      return;
    }

    // If wild card, open color selector modal
    if (card.color === 'black') {
      setSelectedWildCard(card);
      return;
    }

    // Play standard card
    playCardWithColor(card);
  };

  const playCardWithColor = (card: UnoCardType, chosenColor?: CardColor) => {
    if (!socket || !publicState) return;

    socket.emit(
      'playCard',
      {
        roomCode: publicState.roomCode,
        cardId: card.id,
        chosenColor,
      },
      (res: { success: boolean; message?: string }) => {
        if (!res.success && res.message) {
          alert(res.message);
        }
      }
    );
    setSelectedWildCard(null);
  };

  // Draw card action
  const handleDrawCard = () => {
    if (!socket || !isMyTurn || !publicState || hasDrawnThisTurn) return;
    socket.emit('drawCard', { roomCode: publicState.roomCode });
  };

  // Pass turn action
  const handlePassTurn = () => {
    if (!socket || !isMyTurn || !publicState) return;
    socket.emit('passTurn', { roomCode: publicState.roomCode });
  };

  // Call UNO
  const handleCallUno = () => {
    if (!socket || !publicState) return;
    sounds.unoAlert();
    socket.emit('callUno', { roomCode: publicState.roomCode });
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  };

  // Challenge another player's missed UNO
  const handleChallengeUno = () => {
    if (!socket || !publicState) return;
    socket.emit('challengeUno', { roomCode: publicState.roomCode });
  };

  // Send Emote
  const handleSendEmote = (emoji: string) => {
    if (!socket || !publicState) return;
    sounds.emotePop();
    socket.emit('sendEmote', { roomCode: publicState.roomCode, emoji });
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  /* ================= 1. JOIN SCREEN ================= */
  if (!isJoined) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-neutral-900 via-neutral-950 to-black text-white flex flex-col justify-between p-6 max-w-md mx-auto font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="pt-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 via-amber-500 to-blue-600 flex items-center justify-center font-black text-lg shadow-lg">
              U
            </div>
            <h1 className="text-2xl font-black bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">
              UNO PARTY
            </h1>
          </div>
          <p className="text-center text-xs uppercase font-extrabold tracking-widest text-amber-400 mb-8">
            Controle do Celular
          </p>

          <form onSubmit={handleJoin} className="flex flex-col gap-5">
            {/* Room Code */}
            <div>
              <label className="block text-xs uppercase font-bold text-neutral-400 tracking-wider mb-1.5">
                Código da Sala (4 letras da TV)
              </label>
              <input
                type="text"
                maxLength={4}
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
                  setJoinError('');
                }}
                placeholder="Ex: ABCD"
                className="w-full text-center text-2xl font-mono font-black tracking-widest uppercase bg-neutral-900 border-2 border-white/20 focus:border-amber-400 rounded-2xl py-3 px-4 outline-none transition"
              />
            </div>

            {/* Player Name */}
            <div>
              <label className="block text-xs uppercase font-bold text-neutral-400 tracking-wider mb-1.5">
                Seu Nome ou Apelido
              </label>
              <input
                type="text"
                maxLength={15}
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  setJoinError('');
                }}
                placeholder="Como quer ser chamado? (Opcional)"
                className="w-full text-base font-semibold bg-neutral-900 border-2 border-white/20 focus:border-amber-400 rounded-2xl py-3 px-4 outline-none transition"
              />
            </div>

            {/* Avatar Selector */}
            <div>
              <label className="block text-xs uppercase font-bold text-neutral-400 tracking-wider mb-2">
                Escolha seu Avatar
              </label>
              <div className="grid grid-cols-6 gap-2 bg-neutral-900/60 border border-white/10 p-3 rounded-2xl">
                {AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setAvatar(av)}
                    className={`w-11 h-11 text-2xl rounded-xl flex items-center justify-center transition ${
                      avatar === av
                        ? 'bg-amber-400 border-2 border-white shadow-lg scale-110'
                        : 'bg-neutral-800 hover:bg-neutral-700'
                    }`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            {joinError && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-bold text-center animate-in fade-in">
                {joinError}
              </div>
            )}

            <button
              type="submit"
              disabled={isJoining}
              className={`w-full py-4 rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2 transform active:scale-95 transition ${
                isJoining
                  ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed border border-white/10'
                  : 'bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-white shadow-orange-500/30'
              }`}
            >
              {isJoining ? (
                <>
                  <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Entrando na sala...</span>
                </>
              ) : (
                <>
                  <span>ENTRAR NO JOGO</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="pt-6 pb-2 text-center">
          <button
            onClick={onExit}
            className="text-xs text-neutral-400 hover:text-white underline"
          >
            Voltar para tela inicial
          </button>
        </div>
      </div>
    );
  }

  /* ================= 2. LOBBY WAITING SCREEN ================= */
  if (publicState?.status === 'LOBBY') {
    return (
      <div className="min-h-screen w-full bg-neutral-950 text-white flex flex-col justify-between p-6 max-w-md mx-auto text-center font-['Plus_Jakarta_Sans',sans-serif]">
        <div className="pt-10">
          <div className="w-20 h-20 rounded-3xl bg-neutral-900 border-2 border-amber-400/50 flex items-center justify-center text-4xl shadow-xl mx-auto mb-4">
            {avatar}
          </div>
          <h2 className="text-2xl font-black">{playerName}</h2>
          <p className="text-xs uppercase font-extrabold tracking-widest text-emerald-400 mt-1">
            Conectado à sala {publicState.roomCode}
          </p>

          <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-6 mt-8 shadow-xl">
            <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="font-bold text-lg text-white mb-1">Aguardando o Host...</h3>
            <p className="text-xs text-neutral-400">
              Olhe para a tela da TV. A partida começará assim que o anfitrião apertar "Iniciar
              Partida".
            </p>
          </div>

          <div className="mt-8">
            <h4 className="text-xs uppercase font-bold text-neutral-500 tracking-wider mb-2">
              Jogadores na sala ({publicState.players.length}/5):
            </h4>
            <div className="flex flex-wrap justify-center gap-2">
              {publicState.players.map((p) => (
                <div
                  key={p.id}
                  className="bg-neutral-900 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <span>{p.avatar}</span>
                  <span>{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pb-4">
          <button
            onClick={() => setIsJoined(false)}
            className="text-xs text-neutral-500 hover:text-neutral-300 font-bold"
          >
            Trocar nome ou sala
          </button>
        </div>
      </div>
    );
  }

  /* ================= 3. ACTIVE GAME PLAYING SCREEN ================= */
  const topCard = publicState?.topCard;
  const activeColor = publicState?.activeColor;
  const currentPlayer = publicState ? publicState.players[publicState.currentTurnIndex] : null;
  const canShoutUno = hand.length <= 2;

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white flex flex-col justify-between font-['Plus_Jakarta_Sans',sans-serif] select-none touch-manipulation overflow-x-hidden">
      {/* Top Controller Bar */}
      <header className="px-4 py-2.5 bg-neutral-900 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{avatar}</span>
          <div>
            <span className="font-bold text-sm block leading-tight">{playerName}</span>
            <span className="text-[10px] text-neutral-400 font-mono">
              Sala: {publicState?.roomCode}
            </span>
          </div>
        </div>

        {/* Current Table Card Glance */}
        <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1 rounded-xl border border-white/10">
          <span className="text-[10px] font-bold uppercase text-neutral-400">Mesa:</span>
          {topCard ? (
            <div className="flex items-center gap-1.5">
              <UnoCard card={topCard} size="sm" />
              <div
                className={`w-3.5 h-3.5 rounded-full border border-white ${
                  activeColor === 'red'
                    ? 'bg-red-500'
                    : activeColor === 'blue'
                    ? 'bg-blue-500'
                    : activeColor === 'green'
                    ? 'bg-emerald-500'
                    : 'bg-yellow-400'
                }`}
              ></div>
            </div>
          ) : (
            <span className="text-xs text-neutral-500">-</span>
          )}
        </div>
      </header>

      {/* Turn Status Alert Banner */}
      <div
        className={`py-2 px-4 text-center font-extrabold text-sm transition-all duration-300 ${
          isMyTurn
            ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-lg animate-pulse'
            : 'bg-neutral-900/90 text-neutral-400 border-b border-white/5'
        }`}
      >
        {isMyTurn ? (
          <span className="flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 fill-current" />
            É A SUA VEZ! Jogue uma carta ou compre do monte.
          </span>
        ) : (
          <span>Vez de {currentPlayer ? `${currentPlayer.avatar} ${currentPlayer.name}` : '...'}</span>
        )}
      </div>

      {/* UNO Challenge Floating Banner if someone forgot to call UNO */}
      {publicState?.canChallengeUno && publicState.canChallengeUno.targetPlayerId !== socket?.id && (
        <div className="mx-4 my-2 p-2.5 bg-rose-600 rounded-2xl flex items-center justify-between border-2 border-yellow-300 shadow-xl animate-bounce">
          <div className="flex items-center gap-2 text-xs font-black">
            <AlertOctagon className="w-5 h-5 text-yellow-300 shrink-0" />
            <span>{publicState.canChallengeUno.targetPlayerName} não gritou UNO!</span>
          </div>
          <button
            onClick={handleChallengeUno}
            className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-neutral-950 font-black text-xs rounded-xl shadow active:scale-95 uppercase"
          >
            Contestar!
          </button>
        </div>
      )}

      {/* Main Playing Hand Area */}
      <div className="flex-1 flex flex-col justify-center px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase font-extrabold tracking-wider text-neutral-400">
            Sua Mão ({hand.length} {hand.length === 1 ? 'carta' : 'cartas'})
          </span>
          {isMyTurn && (
            <span className="text-xs font-bold text-amber-400">Toque em uma carta para jogar</span>
          )}
        </div>

        {/* Scrollable Card Hand */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 pt-2 px-1 scrollbar-thin">
          {hand.map((card) => {
            const playable = isMyTurn && isValidCardPlay(card, topCard ?? null, activeColor ?? null);
            return (
              <div key={card.id} className="shrink-0 transition-transform">
                <UnoCard
                  card={card}
                  size="hand"
                  isValid={playable}
                  isPlayable={playable}
                  onClick={() => handleCardClick(card)}
                />
              </div>
            );
          })}
        </div>

        {/* Turn Actions: Draw Card / Pass Turn */}
        {isMyTurn && (
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleDrawCard}
              disabled={hasDrawnThisTurn}
              className={`flex-1 py-3.5 px-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 border-2 transition shadow-lg ${
                hasDrawnThisTurn
                  ? 'bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-400 text-white hover:brightness-110 active:scale-95'
              }`}
            >
              <span>+ COMPRAR CARTA</span>
            </button>

            {hasDrawnThisTurn && (
              <button
                onClick={handlePassTurn}
                className="flex-1 py-3.5 px-4 rounded-2xl font-black text-sm bg-neutral-800 hover:bg-neutral-700 border-2 border-amber-400 text-amber-400 transition active:scale-95"
              >
                PASSAR A VEZ
              </button>
            )}
          </div>
        )}

        {/* Big Pulsing UNO Button (Appears when you have 2 or 1 cards) */}
        {canShoutUno && (
          <div className="mt-4">
            <button
              onClick={handleCallUno}
              className="w-full py-4 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 border-4 border-white text-white font-black italic text-2xl sm:text-3xl tracking-wider shadow-[0_0_30px_rgba(239,68,68,0.7)] animate-bounce active:scale-95"
            >
              🚨 GRITAR "UNO!" 🚨
            </button>
          </div>
        )}
      </div>

      {/* Bottom Emote Reaction Bar */}
      <footer className="p-3 bg-neutral-900 border-t border-white/10 flex items-center justify-around">
        {EMOTES.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleSendEmote(emoji)}
            className="text-2xl p-1.5 rounded-xl hover:bg-neutral-800 active:scale-125 transition transform"
            title="Enviar reação para a TV"
          >
            {emoji}
          </button>
        ))}
      </footer>

      {/* Wild Color Selection Modal */}
      {selectedWildCard && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in">
          <div className="bg-neutral-900 border-2 border-white/20 rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl">
            <h3 className="text-xl font-black mb-1">Escolha a Cor</h3>
            <p className="text-xs text-neutral-400 mb-6">Qual cor você quer para a rodada?</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => playCardWithColor(selectedWildCard, 'red')}
                className="py-4 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 border-2 border-red-300 font-black text-white text-base shadow-lg shadow-red-500/30 active:scale-95"
              >
                VERMELHO
              </button>
              <button
                onClick={() => playCardWithColor(selectedWildCard, 'blue')}
                className="py-4 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-600 border-2 border-blue-300 font-black text-white text-base shadow-lg shadow-blue-500/30 active:scale-95"
              >
                AZUL
              </button>
              <button
                onClick={() => playCardWithColor(selectedWildCard, 'yellow')}
                className="py-4 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 border-2 border-amber-200 font-black text-neutral-950 text-base shadow-lg shadow-yellow-500/30 active:scale-95"
              >
                AMARELO
              </button>
              <button
                onClick={() => playCardWithColor(selectedWildCard, 'green')}
                className="py-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 border-2 border-emerald-300 font-black text-white text-base shadow-lg shadow-green-500/30 active:scale-95"
              >
                VERDE
              </button>
            </div>

            <button
              onClick={() => setSelectedWildCard(null)}
              className="text-xs text-neutral-400 hover:text-white font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
