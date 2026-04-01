import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';

interface TournamentPoint {
  id: number;
  name: string;
  room: string;
  buy_in: number;
  fee: number;
  hero_prize: number;
  hero_finish_position: number;
  total_players: number;
  start_time: string;
  profit: number;
  chip_ev_diff?: number;
  dollar_ev_diff?: number;
}

interface ProfitChartProps {
  data: TournamentPoint[];
}

interface ChartDataPoint {
  index: number;
  cumulativeProfit: number;
  cumulativeChipEV: number | null;
  cumulativeDollarEV: number | null;
  tournament: TournamentPoint;
}

function formatCurrency(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}€`;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;

  const point: ChartDataPoint = payload[0].payload;
  const t = point.tournament;

  return (
    <div className="bg-poker-darker border border-poker-border rounded-lg p-3 shadow-xl text-xs">
      <p className="font-medium text-gray-200 mb-1 truncate max-w-48">{t.name || 'Tournament'}</p>
      <div className="space-y-0.5 text-gray-400">
        <p>Room: <span className="text-gray-300">{t.room}</span></p>
        <p>Buy-in: <span className="text-gray-300">{t.buy_in}€ + {t.fee}€</span></p>
        {t.hero_finish_position > 0 && (
          <p>Finish: <span className="text-gray-300">
            {t.hero_finish_position}{t.total_players ? `/${t.total_players}` : ''}
          </span></p>
        )}
        <p>Prize: <span className="text-gray-300">{t.hero_prize?.toFixed(2) || '0'}€</span></p>
        <p>Profit: <span className={t.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          {formatCurrency(t.profit)}
        </span></p>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-poker-border space-y-0.5">
        <p>Gains réels: <span className={point.cumulativeProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          {formatCurrency(point.cumulativeProfit)}
        </span></p>
        {point.cumulativeChipEV != null && (
          <p>Chip EV: <span className="text-poker-blue">
            {formatCurrency(point.cumulativeChipEV)}
          </span></p>
        )}
        {point.cumulativeDollarEV != null && (
          <p>$EV (ICM): <span className="text-poker-gold">
            {formatCurrency(point.cumulativeDollarEV)}
          </span></p>
        )}
      </div>
    </div>
  );
}

export default function ProfitChart({ data }: ProfitChartProps) {
  const [showChipEV, setShowChipEV] = useState(true);
  const [showDollarEV, setShowDollarEV] = useState(true);

  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-gray-500 text-sm">
        Aucune donnée à afficher
      </div>
    );
  }

  // Build cumulative data
  let cumProfit = 0;
  let cumChipEV = 0;
  let cumDollarEV = 0;
  let hasChipEV = false;
  let hasDollarEV = false;

  const chartData: ChartDataPoint[] = data.map((t, i) => {
    cumProfit += t.profit;

    if (t.chip_ev_diff != null) {
      cumChipEV += t.profit + t.chip_ev_diff;
      hasChipEV = true;
    } else {
      cumChipEV += t.profit;
    }

    if (t.dollar_ev_diff != null) {
      cumDollarEV += t.profit + t.dollar_ev_diff;
      hasDollarEV = true;
    } else {
      cumDollarEV += t.profit;
    }

    return {
      index: i + 1,
      cumulativeProfit: cumProfit,
      cumulativeChipEV: hasChipEV ? cumChipEV : null,
      cumulativeDollarEV: hasDollarEV ? cumDollarEV : null,
      tournament: t,
    };
  });

  const allValues = chartData.flatMap((d) => [
    d.cumulativeProfit,
    ...(d.cumulativeChipEV != null ? [d.cumulativeChipEV] : []),
    ...(d.cumulativeDollarEV != null ? [d.cumulativeDollarEV] : []),
  ]);
  const minY = Math.min(0, ...allValues);
  const maxY = Math.max(0, ...allValues);
  const padding = Math.max(10, (maxY - minY) * 0.1);

  return (
    <div>
      {/* Toggle buttons for EV lines */}
      {(hasChipEV || hasDollarEV) && (
        <div className="flex gap-3 mb-2">
          {hasChipEV && (
            <button
              onClick={() => setShowChipEV(!showChipEV)}
              className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                showChipEV ? 'bg-poker-blue/20 text-poker-blue' : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <span className="w-3 h-0.5 bg-poker-blue inline-block" style={{ borderTop: '2px dashed' }} />
              Chip EV
            </button>
          )}
          {hasDollarEV && (
            <button
              onClick={() => setShowDollarEV(!showDollarEV)}
              className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                showDollarEV ? 'bg-poker-gold/20 text-poker-gold' : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <span className="w-3 h-0.5 bg-poker-gold inline-block" style={{ borderTop: '2px dashed' }} />
              $EV (ICM)
            </button>
          )}
        </div>
      )}

      <div className="h-80 min-h-[320px] min-w-[200px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
            <XAxis
              dataKey="index"
              stroke="#555"
              tick={{ fontSize: 11, fill: '#666' }}
              label={{ value: 'Tournois', position: 'insideBottom', offset: -5, fill: '#666', fontSize: 11 }}
            />
            <YAxis
              stroke="#555"
              tick={{ fontSize: 11, fill: '#666' }}
              tickFormatter={(v) => `${v}€`}
              domain={[minY - padding, maxY + padding]}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#4a4a6a" strokeDasharray="4 4" />

            {/* Chip EV line (blue dashed) */}
            {hasChipEV && showChipEV && (
              <Line
                type="monotone"
                dataKey="cumulativeChipEV"
                stroke="#4a90d9"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                activeDot={false}
                connectNulls
              />
            )}

            {/* $EV ICM line (orange dashed) */}
            {hasDollarEV && showDollarEV && (
              <Line
                type="monotone"
                dataKey="cumulativeDollarEV"
                stroke="#f4a261"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                dot={false}
                activeDot={false}
                connectNulls
              />
            )}

            {/* Main profit line (solid green) */}
            <Line
              type="monotone"
              dataKey="cumulativeProfit"
              stroke="#2d6a4f"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#2d6a4f', stroke: '#fff', strokeWidth: 1 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
