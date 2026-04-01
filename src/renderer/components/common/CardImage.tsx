interface CardImageProps {
  card: string;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
}

const SIZES = {
  sm: { w: 24, h: 34, rank: 10, suit: 12 },
  md: { w: 40, h: 56, rank: 16, suit: 18 },
  lg: { w: 56, h: 78, rank: 22, suit: 24 },
};

const SUIT_SYMBOLS: Record<string, string> = {
  h: '♥', d: '♦', c: '♣', s: '♠',
};

const SUIT_COLORS: Record<string, string> = {
  h: '#e63946', d: '#e63946', c: '#1a1a2e', s: '#1a1a2e',
};

export default function CardImage({ card, size = 'md', faceDown = false }: CardImageProps) {
  const s = SIZES[size];

  if (faceDown || !card || card.length < 2) {
    return (
      <svg width={s.w} height={s.h} viewBox={`0 0 ${s.w} ${s.h}`}>
        <rect x="0.5" y="0.5" width={s.w - 1} height={s.h - 1} rx="3" ry="3"
          fill="#1e3a5f" stroke="#2a5a8f" strokeWidth="1" />
        <rect x="3" y="3" width={s.w - 6} height={s.h - 6} rx="2" ry="2"
          fill="none" stroke="#2a5a8f" strokeWidth="0.5" strokeDasharray="2 2" />
      </svg>
    );
  }

  const rank = card[0];
  const suit = card[1];
  const color = SUIT_COLORS[suit] || '#1a1a2e';
  const symbol = SUIT_SYMBOLS[suit] || suit;

  return (
    <svg width={s.w} height={s.h} viewBox={`0 0 ${s.w} ${s.h}`}>
      <rect x="0.5" y="0.5" width={s.w - 1} height={s.h - 1} rx="3" ry="3"
        fill="white" stroke="#d0d0d0" strokeWidth="1" />
      <text
        x={s.w / 2}
        y={s.h * 0.38}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={s.rank}
        fontWeight="bold"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {rank}
      </text>
      <text
        x={s.w / 2}
        y={s.h * 0.68}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={s.suit}
        fontFamily="Inter, system-ui, sans-serif"
      >
        {symbol}
      </text>
    </svg>
  );
}
