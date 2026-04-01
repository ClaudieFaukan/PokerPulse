import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/tournaments', label: 'Tournois', icon: '🏆' },
  { to: '/hands', label: 'Mains', icon: '🃏' },
  { to: '/replayer', label: 'Replayer', icon: '▶️' },
  { to: '/players', label: 'Joueurs', icon: '👤' },
  { to: '/coach', label: 'Coach', icon: '💡' },
  { to: '/import', label: 'Importer', icon: '📥' },
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-poker-darker border-r border-poker-border flex flex-col">
      {/* App title + drag region */}
      <div className="h-12 flex items-center px-4 border-b border-poker-border" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h1 className="text-lg font-bold text-poker-green tracking-tight">PokerPulse</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-poker-green/20 text-poker-green border-r-2 border-poker-green'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Settings at bottom */}
      <div className="border-t border-poker-border">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
              isActive
                ? 'bg-poker-green/20 text-poker-green'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`
          }
        >
          <span className="text-base">⚙️</span>
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
