import React, { useState } from 'react';
import { Tv, Smartphone, Sparkles, ArrowRight } from 'lucide-react';

interface HomeSelectorProps {
  onSelectMode: (mode: 'tv' | 'controller', roomCode?: string) => void;
}

export const HomeSelector: React.FC<HomeSelectorProps> = ({ onSelectMode }) => {
  const [quickCode, setQuickCode] = useState('');

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = quickCode.trim().toUpperCase();
    onSelectMode('controller', cleanCode || undefined);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-950 via-neutral-900 to-black text-white flex flex-col justify-between font-['Plus_Jakarta_Sans',sans-serif] p-4 sm:p-8 overflow-x-hidden">
      <div className="max-w-4xl mx-auto w-full pt-2 sm:pt-6">
        {/* Logo and Brand */}
        <div className="text-center mb-6 sm:mb-10">
          <div className="inline-flex items-center gap-3 mb-2 sm:mb-3">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-red-600 via-amber-500 to-blue-600 flex items-center justify-center font-black italic text-2xl sm:text-3xl shadow-2xl border-2 border-white/20">
              U
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 bg-clip-text text-transparent">
              UNO PARTY
            </h1>
          </div>
          <p className="text-sm sm:text-lg text-neutral-300 font-semibold max-w-xl mx-auto px-2">
            O clássico jogo de cartas estilo Jackbox: a mesa passa na TV e cada jogador usa o celular como controle!
          </p>
        </div>

        {/* 2 Choice Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 mb-8">
          {/* Choice 1: TV Screen */}
          <div
            onClick={() => onSelectMode('tv')}
            className="group relative cursor-pointer bg-gradient-to-br from-neutral-900 to-neutral-950 border-2 border-white/10 hover:border-amber-400 rounded-3xl p-5 sm:p-7 shadow-2xl transition-all duration-300 transform hover:-translate-y-1 hover:shadow-amber-500/20 flex flex-col justify-between overflow-hidden"
          >
            <div className="absolute top-4 right-4 bg-amber-400/10 border border-amber-400/30 text-amber-300 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full">
              Na TV
            </div>

            <div>
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-neutral-800 group-hover:bg-amber-400 group-hover:text-neutral-950 flex items-center justify-center text-amber-400 transition-colors mb-4 shadow-inner">
                <Tv className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black mb-2 text-white group-hover:text-amber-300 transition-colors">
                Criar Mesa na TV
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed mb-6 font-medium">
                Abra esta tela na TV da sala ou PC. Ela exibe a mesa com a pilha de descarte, o sentido da rodada e um <strong>QR Code gigante</strong> para os celulares entrarem.
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectMode('tv');
              }}
              className="w-full py-3.5 sm:py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-sm sm:text-base shadow-xl flex items-center justify-center gap-2 transition transform active:scale-95 cursor-pointer"
            >
              <span>ABRIR MESA NA TV</span>
              <ArrowRight className="w-5 h-5 shrink-0" />
            </button>
          </div>

          {/* Choice 2: Phone Controller */}
          <div className="group relative bg-gradient-to-br from-neutral-900 to-neutral-950 border-2 border-white/10 hover:border-rose-400 rounded-3xl p-5 sm:p-7 shadow-2xl transition-all duration-300 flex flex-col justify-between overflow-hidden">
            <div className="absolute top-4 right-4 bg-rose-400/10 border border-rose-400/30 text-rose-300 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full">
              No Celular
            </div>

            <div>
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-neutral-800 group-hover:bg-rose-500 group-hover:text-white flex items-center justify-center text-rose-400 transition-colors mb-4 shadow-inner">
                <Smartphone className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black mb-2 text-white group-hover:text-rose-300 transition-colors">
                Entrar com Celular
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed mb-4 font-medium">
                Segure suas cartas secretas na mão, jogue com um toque na tela, grite UNO e envie reações em tempo real para a TV.
              </p>

              {/* Single clean form without horizontal overflow */}
              <form onSubmit={handleQuickJoin} className="mb-2">
                <div className="mb-3">
                  <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Código da Sala (4 letras da TV)
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={quickCode}
                    onChange={(e) => setQuickCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                    placeholder="Ex: ABCD (Opcional)"
                    className="w-full text-center font-mono font-black uppercase bg-neutral-950 border-2 border-white/20 focus:border-rose-400 rounded-2xl py-2.5 px-3 text-base sm:text-lg outline-none transition placeholder:text-neutral-600 placeholder:font-sans placeholder:font-normal placeholder:text-xs"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-rose-500 via-orange-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white font-black text-sm sm:text-base shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 transition transform active:scale-95 cursor-pointer"
                >
                  <span>ENTRAR COM CELULAR</span>
                  <ArrowRight className="w-5 h-5 shrink-0" />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* How it works info */}
        <div className="bg-neutral-900/50 border border-white/10 rounded-2xl p-4 sm:p-6 backdrop-blur-md">
          <h3 className="text-xs uppercase font-extrabold tracking-widest text-amber-400 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            Como Jogar em 3 Passos Simples
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
            <div className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-amber-400 text-neutral-950 font-black text-xs flex items-center justify-center shrink-0">
                1
              </span>
              <p className="text-neutral-300">
                Abra a <strong>Mesa na TV</strong> e exiba o QR Code na tela grande.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-amber-400 text-neutral-950 font-black text-xs flex items-center justify-center shrink-0">
                2
              </span>
              <p className="text-neutral-300">
                Até 5 amigos apontam a câmera do celular ou digitam o código para entrar.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-amber-400 text-neutral-950 font-black text-xs flex items-center justify-center shrink-0">
                3
              </span>
              <p className="text-neutral-300">
                Cada um vê suas próprias cartas na mão, grita UNO e joga em tempo real!
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-[11px] text-neutral-500 pt-4 pb-2">
        Uno Party TV &copy; {new Date().getFullYear()} &bull; Multiplayer em Tempo Real
      </div>
    </div>
  );
};
