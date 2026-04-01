import { useEffect } from 'react';

interface ControlsProps {
  actionIndex: number;
  totalActions: number;
  isPlaying: boolean;
  speed: number;
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
  actionIndex, totalActions, isPlaying, speed,
  onTogglePlay, onNext, onPrev, onGoToStart, onGoToEnd, onGoTo, onSetSpeed,
  onPrevHand, onNextHand,
}: ControlsProps) {
  // Keyboard shortcuts
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
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTogglePlay, onNext, onPrev, onGoToStart, onGoToEnd]);

  const progress = totalActions > 0 ? ((actionIndex + 1) / totalActions) * 100 : 0;

  return (
    <div className="bg-poker-card rounded-lg border border-poker-border p-3 space-y-2">
      {/* Progress slider */}
      <div className="relative">
        <input
          type="range"
          min={-1}
          max={totalActions - 1}
          value={actionIndex}
          onChange={(e) => onGoTo(parseInt(e.target.value, 10))}
          className="w-full h-1.5 bg-poker-border rounded-lg appearance-none cursor-pointer accent-poker-green"
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Start */}
          <ControlButton onClick={onGoToStart} title="Début (Home)">
            ⏮
          </ControlButton>

          {/* Prev */}
          <ControlButton onClick={onPrev} title="Précédent (←)">
            ⏪
          </ControlButton>

          {/* Play/Pause/Replay */}
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

          {/* Next */}
          <ControlButton onClick={onNext} title="Suivant (→)">
            ⏩
          </ControlButton>

          {/* End */}
          <ControlButton onClick={onGoToEnd} title="Fin (End)">
            ⏭
          </ControlButton>
        </div>

        {/* Progress text */}
        <span className="text-xs text-gray-500 font-mono">
          {actionIndex + 1} / {totalActions}
        </span>

        {/* Speed */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-1">Vitesse</span>
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

        {/* Hand navigation */}
        {(onPrevHand || onNextHand) && (
          <div className="flex items-center gap-1 border-l border-poker-border pl-3">
            <button
              onClick={onPrevHand}
              disabled={!onPrevHand}
              className="px-2 py-1 text-xs bg-poker-dark border border-poker-border rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
            >
              ← Main
            </button>
            <button
              onClick={onNextHand}
              disabled={!onNextHand}
              className="px-2 py-1 text-xs bg-poker-dark border border-poker-border rounded text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
            >
              Main →
            </button>
          </div>
        )}
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
