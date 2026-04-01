import { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import FilterBar from '../components/charts/FilterBar';
import ProfitChart from '../components/charts/ProfitChart';
import StatsPanel from '../components/charts/StatsPanel';

interface DashboardData {
  profitCurve: any[];
  stats: Record<string, number>;
  overview: {
    total: number;
    itm: number;
    itmPct: string;
    profit: number;
    roi: string;
    avgBuyin: number;
  };
}

export default function Dashboard() {
  const { filters } = useAppStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const result = await window.api.getDashboardData({
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          rooms: filters.rooms.length > 0 ? filters.rooms : undefined,
          buyInMin: filters.buyInMin,
          buyInMax: filters.buyInMax,
          tournamentTypes: filters.tournamentTypes.length > 0 ? filters.tournamentTypes : undefined,
        });
        if (!cancelled) setData(result);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [filters]);

  const hasData = data && data.overview && data.overview.total > 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
      </div>

      <FilterBar />

      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin w-8 h-8 border-2 border-poker-green border-t-transparent rounded-full" />
        </div>
      ) : !hasData ? (
        <div className="bg-poker-card rounded-lg border border-poker-border p-12 text-center text-gray-500">
          <p className="text-lg mb-2">Aucune donnée</p>
          <p className="text-sm">Importez vos hand histories pour commencer l'analyse.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_280px] gap-4">
          {/* Left: Chart + Overview */}
          <div className="space-y-4">
            {/* Overview cards */}
            <div className="grid grid-cols-5 gap-3">
              <OverviewCard
                label="Tournois"
                value={data.overview.total.toString()}
              />
              <OverviewCard
                label="Profit"
                value={`${data.overview.profit >= 0 ? '+' : ''}${data.overview.profit.toFixed(2)}€`}
                color={data.overview.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
              />
              <OverviewCard
                label="ROI"
                value={`${data.overview.roi}%`}
                color={parseFloat(data.overview.roi) >= 0 ? 'text-emerald-400' : 'text-red-400'}
              />
              <OverviewCard
                label="ITM"
                value={`${data.overview.itmPct}%`}
              />
              <OverviewCard
                label="ABI"
                value={`${data.overview.avgBuyin.toFixed(2)}€`}
              />
            </div>

            {/* Profit chart */}
            <div className="bg-poker-card rounded-lg border border-poker-border p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Courbe de gains (€)</h3>
              <ProfitChart data={data.profitCurve} />
            </div>
          </div>

          {/* Right: Stats panel */}
          <div className="bg-poker-card rounded-lg border border-poker-border p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Stats HUD</h3>
            <StatsPanel
              stats={data.stats}
              handsPlayed={data.stats.totalHands}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewCard({
  label,
  value,
  color = 'text-gray-200',
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-poker-card rounded-lg border border-poker-border p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}
