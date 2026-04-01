import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const NAV_ROUTES = [
  '/',           // Cmd+1 → Dashboard
  '/tournaments', // Cmd+2 → Tournaments
  '/hands',       // Cmd+3 → Hands
  '/replayer',    // Cmd+4 → Replayer
  '/coach',       // Cmd+5 → Coach
  '/import',      // Cmd+6 → Import
];

export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta) {
        // Cmd+1 through Cmd+6
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 6) {
          e.preventDefault();
          navigate(NAV_ROUTES[num - 1]);
          return;
        }

        switch (e.key.toLowerCase()) {
          case 'd':
            e.preventDefault();
            navigate('/');
            break;
          case 'i':
            e.preventDefault();
            navigate('/import');
            break;
          case ',':
            e.preventDefault();
            navigate('/settings');
            break;
          case 'f':
            e.preventDefault();
            navigate('/hands');
            break;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);
}
