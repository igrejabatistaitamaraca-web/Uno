import React from 'react';
import { CardColor, UnoCard as UnoCardType } from '../types/uno.ts';

interface UnoCardProps {
  card?: UnoCardType;
  isBack?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hand';
  isValid?: boolean;
  isPlayable?: boolean;
  onClick?: () => void;
  className?: string;
  countBadge?: number;
}

const COLOR_STYLES: Record<CardColor, { bg: string; border: string; text: string; glow: string }> = {
  red: {
    bg: 'from-rose-500 to-red-600',
    border: 'border-red-400',
    text: 'text-red-600',
    glow: 'shadow-red-500/50',
  },
  blue: {
    bg: 'from-blue-500 to-sky-600',
    border: 'border-blue-400',
    text: 'text-blue-600',
    glow: 'shadow-blue-500/50',
  },
  green: {
    bg: 'from-emerald-500 to-green-600',
    border: 'border-emerald-400',
    text: 'text-emerald-600',
    glow: 'shadow-green-500/50',
  },
  yellow: {
    bg: 'from-amber-400 to-yellow-500',
    border: 'border-amber-300',
    text: 'text-amber-500',
    glow: 'shadow-amber-400/50',
  },
  black: {
    bg: 'from-zinc-900 via-neutral-900 to-zinc-950',
    border: 'border-neutral-700',
    text: 'text-white',
    glow: 'shadow-purple-500/40',
  },
};

const SIZE_STYLES = {
  sm: 'w-10 h-14 text-xs rounded-md shadow-sm',
  md: 'w-16 h-24 text-sm rounded-lg shadow-md',
  lg: 'w-24 h-36 text-base rounded-xl shadow-lg',
  xl: 'w-36 h-52 text-xl rounded-2xl shadow-2xl',
  hand: 'w-24 h-36 sm:w-28 sm:h-42 text-base rounded-xl shadow-xl',
};

export const UnoCard: React.FC<UnoCardProps> = ({
  card,
  isBack = false,
  size = 'md',
  isValid = true,
  isPlayable = false,
  onClick,
  className = '',
  countBadge,
}) => {
  if (isBack || !card) {
    return (
      <div
        onClick={onClick}
        className={`relative select-none flex items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-950 border-2 border-neutral-700/80 p-1.5 transition-transform ${
          SIZE_STYLES[size]
        } ${onClick ? 'cursor-pointer hover:scale-105 active:scale-95' : ''} ${className}`}
        style={{ perspective: 600 }}
      >
        <div className="w-full h-full rounded-md border border-neutral-800 flex items-center justify-center overflow-hidden bg-gradient-to-br from-red-600 via-amber-600 to-blue-600 p-0.5">
          <div className="w-full h-full bg-neutral-950 rounded flex items-center justify-center rotate-[-25deg] shadow-inner border border-white/20">
            <span className="font-black italic tracking-tighter text-amber-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-base sm:text-lg">
              UNO
            </span>
          </div>
        </div>
        {countBadge !== undefined && countBadge > 0 && (
          <div className="absolute -top-2 -right-2 bg-amber-500 text-neutral-950 font-black text-xs px-2 py-0.5 rounded-full border-2 border-neutral-950 shadow-md">
            {countBadge}
          </div>
        )}
      </div>
    );
  }

  const colorConfig = COLOR_STYLES[card.color] || COLOR_STYLES.black;

  const renderSymbol = (isCenter = false) => {
    switch (card.value) {
      case 'skip':
        return (
          <span className={`font-black ${isCenter ? 'text-3xl sm:text-5xl' : 'text-xs sm:text-sm'}`}>
            ⊘
          </span>
        );
      case 'reverse':
        return (
          <span className={`font-black ${isCenter ? 'text-3xl sm:text-5xl' : 'text-xs sm:text-sm'}`}>
            ⇄
          </span>
        );
      case 'draw2':
        return (
          <span className={`font-black italic ${isCenter ? 'text-2xl sm:text-4xl' : 'text-xs'}`}>
            +2
          </span>
        );
      case 'wild':
        if (isCenter) {
          return (
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-white shadow-md grid grid-cols-2 grid-rows-2">
              <div className="bg-red-500"></div>
              <div className="bg-blue-500"></div>
              <div className="bg-yellow-400"></div>
              <div className="bg-emerald-500"></div>
            </div>
          );
        }
        return <span className="font-black text-[10px] tracking-tight">WILD</span>;
      case 'wild4':
        if (isCenter) {
          return (
            <div className="flex flex-col items-center justify-center">
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-white shadow-md grid grid-cols-2 grid-rows-2 mb-1">
                <div className="bg-red-500"></div>
                <div className="bg-blue-500"></div>
                <div className="bg-yellow-400"></div>
                <div className="bg-emerald-500"></div>
              </div>
              <span className="font-black italic text-xl sm:text-2xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                +4
              </span>
            </div>
          );
        }
        return <span className="font-black italic text-[11px]">+4</span>;
      default:
        return (
          <span
            className={`font-black italic tracking-tighter ${
              isCenter ? 'text-3xl sm:text-5xl font-["Lilita_One"]' : 'text-xs sm:text-sm font-bold'
            }`}
          >
            {card.value}
          </span>
        );
    }
  };

  return (
    <div
      onClick={isPlayable && onClick ? onClick : undefined}
      className={`relative select-none flex flex-col justify-between p-1 sm:p-1.5 transition-all duration-200 border-2 ${
        SIZE_STYLES[size]
      } ${colorConfig.border} bg-gradient-to-br ${colorConfig.bg} ${
        isPlayable
          ? 'cursor-pointer hover:-translate-y-2 hover:scale-105 ring-4 ring-amber-400 ring-offset-2 ring-offset-neutral-900 ' +
            colorConfig.glow
          : isValid
          ? 'opacity-100'
          : 'opacity-40 grayscale-[40%] cursor-not-allowed'
      } ${className}`}
      style={{
        boxShadow: isPlayable
          ? '0 12px 24px -4px rgba(251, 191, 36, 0.4), 0 8px 16px -4px rgba(0,0,0,0.5)'
          : '0 8px 16px -4px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Top Left Corner */}
      <div className="flex items-center text-white drop-shadow leading-none font-bold">
        {renderSymbol(false)}
      </div>

      {/* Center Medallion */}
      <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none">
        <div className="w-[82%] h-[68%] rounded-[50%] bg-white/95 flex items-center justify-center rotate-[-22deg] shadow-lg border border-black/10 overflow-hidden">
          <div className={`rotate-[22deg] ${colorConfig.text} flex items-center justify-center`}>
            {renderSymbol(true)}
          </div>
        </div>
      </div>

      {/* Bottom Right Corner */}
      <div className="flex items-center justify-end text-white drop-shadow leading-none font-bold rotate-180">
        {renderSymbol(false)}
      </div>

      {/* Playable badge indicator */}
      {isPlayable && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 border border-neutral-950 animate-ping"></div>
      )}
    </div>
  );
};
