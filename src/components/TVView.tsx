import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { Socket } from 'socket.io-client';
import {
  FloatingEmote,
  GameAnnouncement,
  PlayerPublic,
  PublicGameState,
} from '../types/uno.ts';
import { UnoCard } from './UnoCard.tsx';
import { sounds } from '../utils/audio.ts';
import {
  Volume2,
  VolumeX,
  Maximize2,
  UserPlus,
  Play,
  Copy,
  Check,
  RotateCw,
  RotateCcw,
  Sparkles,
  Trophy,
  AlertTriangle,
  Flame,
} from 'lucide-react';

interface TVViewProps {
  socket: Socket | null;
  initialRoomCode?: string;
  onExit: () => void;
}

export const TVView: React.FC<TVViewProps> = ({ socket, initialRoomCode, onExit }) => {
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isMuted, setIsMuted] = useState(sounds.isMuted);
  const [floatingEmotes, setFloatingEmotes] = useState<FloatingEmote[]>([]);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Setup room on mount
  useEffect(() => {
    if (!socket) return;

    if (initialRoomCode) {
      socket.emit('syncRoom', { roomCode: initialRoomCode }, (res: { success: boolean; state?: PublicGameState; message?: string }) => {
        if (res.success && res.state) {
          setGameState(res.state);
        } else {
          setErrorMessage(res.message || 'Erro ao sincronizar sala');
        }
      });
    } else {
      socket.emit('createRoom', (res: { success: boolean; roomCode?: string; state?: PublicGameState }) => {
        if (res.success && res.state) {
          setGameState(res.state);
        }
      });
    }

    const handleGameStateUpdate = (state: PublicGameState) => {
      setGameState(state);
      if (state.status === 'GAME_OVER' && state.winner) {
        sounds.winFanfare();
        confetti({
          particleCount: 150,
          spread: 90,
          origin: { y: 0.6 },
        });
      }
    };

    const handleSoundEffect = (type: string) => {
      switch (type) {
        case 'play':
          sounds.playCard();
          break;
        case 'draw':
          sounds.drawCard();
          break;
        case 'skip':
          sounds.skip();
          break;
        case 'reverse':
          sounds.reverse();
          break;
        case 'wild':
          sounds.wild();
          break;
        case 'uno':
          sounds.unoAlert();
          break;
        case 'win':
          sounds.winFanfare();
          break;
        default:
          sounds.playCard();
      }
    };

    const handleFloatingEmote = (emote: FloatingEmote) => {
      sounds.emotePop();
      setFloatingEmotes((prev) => [...prev.slice(-15), emote]);
      setTimeout(() => {
        setFloatingEmotes((prev) => prev.filter((e) => e.id !== emote.id));
      }, 3500);
    };

    socket.on('gameStateUpdate', handleGameStateUpdate);
    socket.on('soundEffect', handleSoundEffect);
    socket.on('floatingEmote', handleFloatingEmote);

    return () => {
      socket.off('gameStateUpdate', handleGameStateUpdate);
      socket.off('soundEffect', handleSoundEffect);
      socket.off('floatingEmote', handleFloatingEmote);
    };
  }, [socket, initialRoomCode]);

  // Generate QR Code when roomCode is known
  useEffect(() => {
    if (!gameState?.roomCode) return;
    const joinUrl = `${window.location.origin}?join=${gameState.roomCode}`;
    QRCode.toDataURL(
      joinUrl,
      {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      },
      (err, url) => {
        if (!err && url) {
          setQrCodeUrl(url);
        }
      }
    );
  }, [gameState?.roomCode]);

  const toggleSound = () => {
    sounds.isMuted = !sounds.isMuted;
    setIsMuted(sounds.isMuted);
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const copyInviteLink = () => {
    if (!gameState?.roomCode) return;
    const link = `${window.location.origin}?join=${gameState.roomCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddBot = () => {
    if (!socket || !gameState) return;
    socket.emit('addBot', { roomCode: gameState.roomCode });
  };

  const handleRemovePlayer = (playerId: string) => {
    if (!socket || !gameState) return;
    socket.emit('removePlayer', { roomCode: gameState.roomCode, playerId });
  };

  const handleStartGame = () => {
    if (!socket || !gameState) return;
    sounds.playCard();
    socket.emit('startGame', { roomCode: gameState.roomCode });
  };

  const handleRestartGame = () => {
    if (!socket || !gameState) return;
    socket.emit('restartGame', { roomCode: gameState.roomCode });
  };

  if (!gameState) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xl font-bold tracking-wide">Criando sala para a TV...</p>
        {errorMessage && <p className="text-rose-400 mt-2">{errorMessage}</p>}
      </div>
    );
  }

  const joinLink = `${window.location.origin}?join=${gameState.roomCode}`;
  const currentPlayer = gameState.players[gameState.currentTurnIndex];

  return (
    <div className="relative min-h-screen w-full bg-radial from-neutral-900 via-neutral-950 to-black text-white select-none overflow-hidden flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Header / TV Bar */}
      <header className="h-16 border-b border-white/10 px-6 sm:px-10 flex items-center justify-between backdrop-blur-md bg-neutral-950/60 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 via-amber-500 to-blue-600 flex items-center justify-center shadow-lg font-black italic text-lg text-white">
              U
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">
                UNO PARTY TV
              </span>
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Mesa Principal
              </span>
            </div>
          </div>
        </div>

        {/* Room Code Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-neutral-900/90 border-2 border-amber-500/40 px-4 py-1.5 rounded-2xl shadow-inner">
            <span className="text-xs uppercase tracking-wider text-neutral-400 mr-2 font-bold">
              Código da Sala:
            </span>
            <span className="font-black tracking-widest text-2xl text-amber-400 font-mono">
              {gameState.roomCode}
            </span>
          </div>

          {/* Audio & Fullscreen Buttons */}
          <button
            onClick={toggleSound}
            title={isMuted ? 'Ativar Som' : 'Silenciar'}
            className="p-2.5 rounded-xl bg-neutral-900 border border-white/10 hover:border-amber-400 hover:text-amber-400 transition"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-neutral-400" /> : <Volume2 className="w-5 h-5 text-amber-400" />}
          </button>

          <button
            onClick={toggleFullScreen}
            title="Tela Cheia"
            className="p-2.5 rounded-xl bg-neutral-900 border border-white/10 hover:border-amber-400 hover:text-amber-400 transition"
          >
            <Maximize2 className="w-5 h-5 text-neutral-300" />
          </button>
        </div>
      </header>

      {/* Floating Emotes Layer */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        {floatingEmotes.map((e) => (
          <div
            key={e.id}
            className="absolute bottom-16 animate-float-up flex flex-col items-center"
            style={{
              left: `${15 + (Math.sin(e.timestamp) * 0.5 + 0.5) * 70}%`,
            }}
          >
            <div className="text-6xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] filter">
              {e.emoji}
            </div>
            <div className="bg-neutral-900/90 text-white text-xs px-2 py-0.5 rounded-full border border-white/20 mt-1 shadow-lg">
              {e.playerName}
            </div>
          </div>
        ))}
      </div>

      {/* Announcements Bar */}
      {gameState.announcements.length > 0 && (
        <div className="bg-neutral-900/70 border-b border-white/5 py-1.5 px-6 flex items-center justify-center gap-3 text-sm font-semibold text-neutral-300 z-10">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="truncate max-w-2xl text-center">
            {gameState.announcements[gameState.announcements.length - 1]?.text}
          </span>
        </div>
      )}

      {/* MAIN VIEW: LOBBY vs ACTIVE GAME vs GAME OVER */}
      {gameState.status === 'LOBBY' ? (
        /* =================== LOBBY SCREEN =================== */
        <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-6 lg:p-12 gap-8 max-w-7xl mx-auto w-full z-10">
          {/* Left Column: QR Code to Join */}
          <div className="flex flex-col items-center bg-neutral-900/90 border-2 border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-xl max-w-md w-full text-center">
            <span className="text-xs uppercase tracking-widest text-amber-400 font-extrabold mb-1">
              Escaneie com a câmera do celular
            </span>
            <h2 className="text-2xl font-black mb-4">Entrar na Partida</h2>

            {/* QR Code Canvas */}
            <div className="bg-white p-4 rounded-2xl shadow-xl border-4 border-amber-400/40 mb-4">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="QR Code para entrar" className="w-56 h-56 sm:w-64 sm:h-64 object-contain" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-neutral-400">
                  Gerando QR...
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 w-full text-sm">
              <p className="text-neutral-400 font-medium">
                Ou acesse pelo navegador:{' '}
                <span className="text-white font-bold underline underline-offset-2">
                  {window.location.host}
                </span>
              </p>
              <button
                onClick={copyInviteLink}
                className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10 transition font-semibold"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                {copied ? 'Link copiado com sucesso!' : 'Copiar Link Completo'}
              </button>
            </div>
          </div>

          {/* Right Column: Players List & Game Controls */}
          <div className="flex-1 flex flex-col justify-between bg-neutral-900/60 border border-white/10 rounded-3xl p-8 backdrop-blur-xl w-full max-h-[620px]">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-black">Jogadores Conectados</h3>
                  <p className="text-sm text-neutral-400 font-medium">
                    {gameState.players.length} de 5 jogadores na sala (mínimo 2 para iniciar)
                  </p>
                </div>
                <button
                  onClick={handleAddBot}
                  disabled={gameState.players.length >= 5}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-bold shadow-lg transition"
                >
                  <UserPlus className="w-4 h-4" />
                  + Bot de Teste
                </button>
              </div>

              {/* Player Slots */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {Array.from({ length: 5 }).map((_, index) => {
                  const player = gameState.players[index];
                  if (player) {
                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between bg-neutral-900 border-2 border-amber-400/30 rounded-2xl p-4 shadow-lg animate-in fade-in zoom-in duration-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-neutral-800 border border-white/20 flex items-center justify-center text-2xl shadow-inner">
                            {player.avatar}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base text-white">{player.name}</span>
                              {player.isHost && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded font-black">
                                  HOST
                                </span>
                              )}
                              {player.isBot && (
                                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.5 rounded font-black">
                                  BOT
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                              Pronto para o jogo
                            </span>
                          </div>
                        </div>

                        {/* Host can remove player/bot in lobby */}
                        <button
                          onClick={() => handleRemovePlayer(player.id)}
                          className="text-xs text-neutral-500 hover:text-rose-400 p-2 transition font-bold"
                          title="Remover"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`empty-${index}`}
                      className="flex items-center gap-3 border-2 border-dashed border-white/10 rounded-2xl p-4 text-neutral-500"
                    >
                      <div className="w-12 h-12 rounded-xl border border-dashed border-neutral-700 flex items-center justify-center text-neutral-600">
                        ?
                      </div>
                      <span className="text-sm font-medium">Aguardando jogador {index + 1}...</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Start Game Action */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <span className="text-sm text-neutral-400 font-medium">
                {gameState.players.length < 2
                  ? 'Conecte outro jogador pelo celular ou adicione um Bot para começar.'
                  : 'Tudo pronto! O Host pode iniciar a qualquer momento.'}
              </span>
              <button
                onClick={handleStartGame}
                disabled={gameState.players.length < 2}
                className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 disabled:opacity-40 disabled:pointer-events-none text-white text-lg font-black shadow-xl shadow-emerald-600/30 transition transform hover:scale-105 active:scale-95"
              >
                <Play className="w-6 h-6 fill-current" />
                INICIAR PARTIDA
              </button>
            </div>
          </div>
        </div>
      ) : gameState.status === 'PLAYING' ? (
        /* =================== ACTIVE MATCH SCREEN (THE TABLE) =================== */
        <div className="flex-1 relative flex flex-col items-center justify-between p-4 sm:p-8 z-10">
          {/* Challenge Uno Alert Banner if someone forgot */}
          {gameState.canChallengeUno && (
            <div className="absolute top-4 bg-rose-600/90 text-white font-extrabold px-6 py-2.5 rounded-2xl border-2 border-rose-400 shadow-2xl flex items-center gap-3 animate-bounce z-30">
              <AlertTriangle className="w-6 h-6 text-yellow-300" />
              <span>
                {gameState.canChallengeUno.targetPlayerName} ficou com 1 carta e NÃO gritou UNO! Aperte no celular para contestar!
              </span>
            </div>
          )}

          {/* Circular / Table Seating of other players */}
          <div className="w-full max-w-6xl grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 my-2">
            {gameState.players.map((player, idx) => {
              const isTurn = idx === gameState.currentTurnIndex;
              return (
                <div
                  key={player.id}
                  className={`relative flex flex-col items-center p-3 rounded-2xl transition-all duration-300 ${
                    isTurn
                      ? 'bg-gradient-to-b from-amber-500/20 to-neutral-900/90 border-2 border-amber-400 shadow-2xl shadow-amber-500/30 scale-105 ring-4 ring-amber-400/20'
                      : 'bg-neutral-900/60 border border-white/10 opacity-80'
                  }`}
                >
                  {/* UNO Badge */}
                  {player.hasCalledUno && (
                    <div className="absolute -top-3.5 bg-gradient-to-r from-red-600 to-amber-500 text-white font-black italic text-xs px-3 py-1 rounded-full border-2 border-white shadow-xl animate-pulse">
                      UNO!
                    </div>
                  )}

                  {/* Turn Indicator */}
                  {isTurn && (
                    <div className="absolute -bottom-2 bg-amber-400 text-neutral-950 font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shadow">
                      SUA VEZ
                    </div>
                  )}

                  <div className="text-3xl mb-1">{player.avatar}</div>
                  <span className="font-bold text-sm text-white truncate max-w-[120px]">
                    {player.name}
                  </span>

                  {/* Card fan or count badge */}
                  <div className="flex items-center gap-1 mt-2">
                    <UnoCard isBack size="sm" countBadge={player.cardCount} />
                    <span className="text-xs font-black text-amber-400 ml-1">
                      {player.cardCount} {player.cardCount === 1 ? 'carta' : 'cartas'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CENTER ARENA: Felt Table with Discard Pile, Draw Pile & Direction Indicator */}
          <div className="relative w-full max-w-4xl h-80 sm:h-96 rounded-[48px] bg-gradient-to-b from-emerald-950 via-teal-950 to-neutral-950 border-8 border-amber-900/60 shadow-[inset_0_10px_40px_rgba(0,0,0,0.8),0_20px_50px_rgba(0,0,0,0.9)] flex items-center justify-center p-6 my-auto">
            {/* Center Felt Pattern Line */}
            <div className="absolute inset-8 rounded-[36px] border border-emerald-500/20 pointer-events-none"></div>

            {/* Rotating Direction Flow Indicator */}
            <div
              className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-1000 ${
                gameState.direction === 1 ? 'animate-spin-slow' : 'animate-spin-slow-reverse'
              }`}
            >
              <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-full border-2 border-dashed border-emerald-400/30 flex items-center justify-between px-2">
                <span className="text-2xl text-emerald-400">
                  {gameState.direction === 1 ? '↻' : '↺'}
                </span>
                <span className="text-2xl text-emerald-400">
                  {gameState.direction === 1 ? '↻' : '↺'}
                </span>
              </div>
            </div>

            {/* Active Color Glow Ring */}
            {gameState.activeColor && (
              <div
                className={`absolute w-72 h-72 rounded-full blur-2xl opacity-40 transition-colors duration-500 ${
                  gameState.activeColor === 'red'
                    ? 'bg-red-500'
                    : gameState.activeColor === 'blue'
                    ? 'bg-blue-500'
                    : gameState.activeColor === 'green'
                    ? 'bg-emerald-500'
                    : 'bg-yellow-400'
                }`}
              ></div>
            )}

            {/* Center Card Play Area */}
            <div className="relative flex items-center gap-8 sm:gap-14 z-10">
              {/* Draw Pile (Monte de compras) */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="absolute top-1 left-1 w-24 h-36 sm:w-28 sm:h-42 bg-neutral-800 rounded-xl border border-neutral-700"></div>
                  <UnoCard isBack size="hand" />
                </div>
                <span className="text-xs font-bold text-neutral-300 mt-2">
                  Monte ({gameState.drawPileCount})
                </span>
              </div>

              {/* Active Color Indicator & Direction Sign */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-neutral-900/90 border-4 border-white/30 flex flex-col items-center justify-center shadow-xl mb-2">
                  <span className="text-[10px] uppercase font-black text-neutral-400">Cor Ativa</span>
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white shadow-md my-0.5 ${
                      gameState.activeColor === 'red'
                        ? 'bg-red-600'
                        : gameState.activeColor === 'blue'
                        ? 'bg-blue-600'
                        : gameState.activeColor === 'green'
                        ? 'bg-emerald-600'
                        : 'bg-amber-400'
                    }`}
                  ></div>
                </div>

                <div className="flex items-center gap-1 text-xs font-black text-amber-300 bg-neutral-900/80 px-3 py-1 rounded-full border border-white/10">
                  {gameState.direction === 1 ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5" /> Horário
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" /> Anti-horário
                    </>
                  )}
                </div>
              </div>

              {/* Discard Pile (Top card on the table) */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  {/* Visual stack depth */}
                  {gameState.discardPileCount > 1 && (
                    <div className="absolute -top-1 -left-1 w-24 h-36 sm:w-28 sm:h-42 bg-neutral-700 rounded-xl rotate-[-4deg]"></div>
                  )}
                  {gameState.topCard ? (
                    <UnoCard card={gameState.topCard} size="hand" />
                  ) : (
                    <div className="w-24 h-36 bg-neutral-800 rounded-xl border border-neutral-600 flex items-center justify-center text-xs text-neutral-400">
                      Vazio
                    </div>
                  )}
                </div>
                <span className="text-xs font-bold text-neutral-300 mt-2">
                  Mesa ({gameState.discardPileCount})
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Table Bar: Current Turn Spotlight */}
          <div className="w-full max-w-3xl bg-neutral-900/90 border border-white/15 rounded-2xl px-6 py-3 flex items-center justify-between shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase font-extrabold text-neutral-400">Vez de Jogar:</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{currentPlayer?.avatar}</span>
                <span className="text-lg font-black text-amber-400">{currentPlayer?.name}</span>
                {currentPlayer?.isBot && (
                  <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-bold">
                    Robô pensando...
                  </span>
                )}
              </div>
            </div>

            <div className="text-xs text-neutral-400 font-semibold">
              Olhe suas cartas na tela do seu celular!
            </div>
          </div>
        </div>
      ) : (
        /* =================== GAME OVER / VICTORY PODIUM =================== */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto z-10">
          <div className="w-28 h-28 rounded-3xl bg-gradient-to-tr from-amber-400 to-yellow-500 border-4 border-white flex items-center justify-center text-6xl shadow-2xl mb-4 animate-bounce">
            🏆
          </div>

          <h2 className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent mb-2">
            VITÓRIA!
          </h2>

          <div className="bg-neutral-900/90 border-2 border-amber-400/50 rounded-3xl p-6 shadow-2xl w-full my-6 backdrop-blur-xl">
            <div className="text-5xl mb-2">{gameState.winner?.avatar}</div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
              {gameState.winner?.name}
            </h3>
            <p className="text-amber-400 font-bold mt-1">Zerou a mão e venceu a rodada de UNO!</p>

            {/* Ranking of remaining cards */}
            <div className="mt-6 pt-6 border-t border-white/10 text-left">
              <h4 className="text-xs uppercase font-bold text-neutral-400 tracking-wider mb-3">
                Cartas restantes dos adversários:
              </h4>
              <div className="flex flex-col gap-2">
                {gameState.players
                  .filter((p) => p.id !== gameState.winner?.id)
                  .sort((a, b) => a.cardCount - b.cardCount)
                  .map((p, rank) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between bg-neutral-950 px-4 py-2 rounded-xl border border-white/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-neutral-400">{rank + 2}º</span>
                        <span className="text-lg">{p.avatar}</span>
                        <span className="font-semibold text-sm text-neutral-200">{p.name}</span>
                      </div>
                      <span className="text-xs font-black text-amber-400">
                        {p.cardCount} {p.cardCount === 1 ? 'carta' : 'cartas'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleRestartGame}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-lg shadow-xl shadow-emerald-500/30 transition transform hover:scale-105 active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              JOGAR NOVAMENTE
            </button>
            <button
              onClick={onExit}
              className="px-6 py-4 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold border border-white/10 transition"
            >
              Sair para Início
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
