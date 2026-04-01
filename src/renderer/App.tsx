import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/common/Sidebar';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import Dashboard from './pages/Dashboard';
import Tournaments from './pages/Tournaments';
import TournamentDetail from './pages/TournamentDetail';
import HandHistory from './pages/HandHistory';
import Replayer from './pages/Replayer';
import Coach from './pages/Coach';
import Import from './pages/Import';
import Settings from './pages/Settings';
import Players from './pages/Players';

export default function App() {
  useGlobalShortcuts();

  return (
    <div className="flex h-screen bg-poker-dark text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournaments/:id" element={<TournamentDetail />} />
          <Route path="/hands" element={<HandHistory />} />
          <Route path="/replayer" element={<Replayer />} />
          <Route path="/replayer/:id" element={<Replayer />} />
          <Route path="/players" element={<Players />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/import" element={<Import />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
