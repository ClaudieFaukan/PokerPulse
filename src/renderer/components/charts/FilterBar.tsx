import { ReactNode } from 'react';
import { useAppStore } from '../../store/appStore';

const PERIODS = [
  { label: '7j', days: 7 },
  { label: '1m', days: 30 },
  { label: '3m', days: 90 },
  { label: '6m', days: 180 },
  { label: '1a', days: 365 },
  { label: 'Tout', days: 0 },
];

const ROOMS = [
  { value: 'winamax', label: 'Winamax' },
  { value: 'pokerstars', label: 'PokerStars' },
  { value: 'pmu', label: 'PMU' },
];

const BUYIN_RANGES = [
  { label: 'Tous', min: undefined, max: undefined },
  { label: '1-5€', min: 1, max: 5 },
  { label: '5-20€', min: 5, max: 20 },
  { label: '20-50€', min: 20, max: 50 },
  { label: '50€+', min: 50, max: undefined },
];

export default function FilterBar({ searchSlot }: { searchSlot?: ReactNode } = {}) {
  const { filters, setFilters, resetFilters } = useAppStore();

  const activePeriod = filters.activePeriod ?? 0;

  const setDateRange = (days: number) => {
    if (days === 0) {
      setFilters({ dateFrom: undefined, dateTo: undefined, activePeriod: 0 });
    } else {
      const from = new Date();
      from.setDate(from.getDate() - days);
      setFilters({ dateFrom: from.toISOString(), dateTo: new Date().toISOString(), activePeriod: days });
    }
  };

  const toggleRoom = (room: 'winamax' | 'pokerstars' | 'pmu') => {
    const rooms = filters.rooms.includes(room)
      ? filters.rooms.filter((r) => r !== room)
      : [...filters.rooms, room];
    setFilters({ rooms });
  };

  const setBuyinRange = (min?: number, max?: number) => {
    setFilters({ buyInMin: min, buyInMax: max });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-poker-card rounded-lg border border-poker-border">
      {searchSlot && (
        <>
          {searchSlot}
          <div className="w-px h-5 bg-poker-border" />
        </>
      )}
      {/* Period */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 mr-1">Période</span>
        {PERIODS.map(({ label, days }) => (
          <button
            key={label}
            onClick={() => setDateRange(days)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              activePeriod === days
                ? 'bg-poker-green text-white'
                : 'bg-poker-dark text-gray-400 hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-poker-border" />

      {/* Rooms */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 mr-1">Room</span>
        {ROOMS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => toggleRoom(value as any)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              filters.rooms.includes(value as any)
                ? 'bg-poker-green text-white'
                : filters.rooms.length === 0
                  ? 'bg-poker-green/15 text-poker-green border border-poker-green/20'
                  : 'bg-poker-dark text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-poker-border" />

      {/* Buy-in range */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 mr-1">Buy-in</span>
        {BUYIN_RANGES.map(({ label, min, max }) => (
          <button
            key={label}
            onClick={() => setBuyinRange(min, max)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              filters.buyInMin === min && filters.buyInMax === max
                ? 'bg-poker-green text-white'
                : 'bg-poker-dark text-gray-400 hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Reset */}
      <button
        onClick={resetFilters}
        className="ml-auto px-2 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        Réinitialiser
      </button>
    </div>
  );
}
