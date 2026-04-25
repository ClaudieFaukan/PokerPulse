import { useEffect } from 'react';

interface ControlsProps {
  actionIndex: number;
  totalActions: number;
  isPlaying: boolean;
  speed: number;
  handPlayed?: boolean; // true = hero played (saw flop+), false = folded preflop
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  onGoTo: (index: number) => void;
  onSetSpeed: (speed: number) => void;
  onPrevHand?: () => void;
  onNextHand?: () => void;
}

const SPEEDS = [0.5, 1, 2, 4];

export default function Controls({
  actionIndex, totalActions, isPlaying, speed, handPlayed,
  onTogglePlay, onNext, onPrev, onGoToStart, onGoToEnd, onGoTo, onSetSpeed,
  onPrevHand, onNextHand,
}: ControlsProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (actionIndex >= totalActions - 1 && !isPlaying) {
            onGoToStart();
          } else {
            onTogglePlay();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          onNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onPrev();
          break;
        case 'Home':
          e.preventDefault();
          onGoToStart();
          break;
        case 'End':
          e.preventDefault();
          onGoToEnd();
          break;
        case 'ArrowUp':
          e.preventDefault();
          onPrevHand?.();
          break;
        case 'ArrowDown':
          e.preventDefault();
          onNextHand?.();
          break;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTogglePlay, onNext, onPrev, onGoToStart, onGoToEnd, onPrevHand, onNextHand]);

  return (
    <div className="bg-poker-card rounded-lg border border-poker-border p-3 space-y-2">
      {/* Progress slider */}
      <input
        type="range"
        min={0}
        max={totalActions - 1}
        value={actionIndex}
        onChange={(e) => onGoTo(parseInt(e.target.value, 10))}
        className="w-full h-1.5 bg-poker-border rounded-lg appearance-none cursor-pointer accent-poker-green"
      />

      {/* Controls row */}
      <div className="flex items-center gap-2">

        {/* Prev hand */}
        <button
          onClick={onPrevHand}
          disabled={!onPrevHand}
          title="Main précédente (↑)"
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-poker-dark border border-poker-border rounded text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          ← Main
        </button>

        {/* Playback controls */}
        <div className="flex items-center gap-0.5">
          <ControlButton onClick={onGoToStart} title="Début (Home)">⏮</ControlButton>
          <ControlButton onClick={onPrev} title="Précédent (←)">⏪</ControlButton>

          {actionIndex >= totalActions - 1 && !isPlaying ? (
            <button
              onClick={onGoToStart}
              title="Rejouer (Espace)"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-poker-blue hover:bg-poker-blue/80 text-white transition-colors text-lg"
            >
              ↺
            </button>
          ) : (
            <button
              onClick={onTogglePlay}
              title="Play/Pause (Espace)"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-poker-green hover:bg-poker-green/80 text-white transition-colors text-lg"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
          )}

          <ControlButton onClick={onNext} title="Suivant (→)">⏩</ControlButton>
          <ControlButton onClick={onGoToEnd} title="Fin (End)">⏭</ControlButton>
        </div>

        {/* Next hand */}
        <button
          onClick={onNextHand}
          disabled={!onNextHand}
          title="Main suivante (↓)"
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-poker-dark border border-poker-border rounded text-gray-400 hover:text-gray-200 hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          Main →
        </button>

        {/* Played indicator */}
        {handPlayed !== undefined && (
          <span className={`px-2 py-1 text-[10px] font-bold rounded border ${
            handPlayed
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-gray-500/15 border-gray-600/30 text-gray-500'
          }`}>
            {handPlayed ? 'Joué' : 'Passé'}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Progress */}
        <span className="text-xs text-gray-500 font-mono">
          {actionIndex + 1} / {totalActions}
        </span>

        {/* Speed */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Vitesse</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                speed === s
                  ? 'bg-poker-green text-white'
                  : 'bg-poker-dark text-gray-500 hover:text-gray-300'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ControlButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors text-sm"
    >
      {children}
    </button>
  );
}
