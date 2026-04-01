# PokerPulse

Tracker MTT offline pour macOS. Importez vos historiques de mains Winamax, PokerStars et PMU, analysez vos tournois, identifiez vos leaks et progressez.

![Electron](https://img.shields.io/badge/Electron-41-blue) ![React](https://img.shields.io/badge/React-19-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6) ![SQLite](https://img.shields.io/badge/SQLite-local-green)

## Features

### Dashboard
Vue d'ensemble de vos performances : profit cumulé, ROI, ITM%, ABI, courbe de gains et stats HUD complètes (VPIP, PFR, 3-Bet, C-Bet, WTSD, AF...).

### Tournois
Liste de tous vos tournois avec filtres (room, buy-in, type, dates). Détail par tournoi avec :
- Graphique de progression du stack avec courbe EV
- Distribution du stack en BB (zones danger/short/medium/deep)
- Statistiques all-in EV et M-ratio
- Export d'analyse pour Claude AI

### Replayer visuel
Rejouez chaque main action par action sur une table visuelle :
- Affichage chips ou BB (toggle)
- M-ratio et stack effectif en temps réel
- Mini HUD sous chaque adversaire (VPIP/PFR)
- Cotes du pot et equity requise avec ajustement bounty (KO)
- Clic sur un adversaire pour ses stats complètes
- Bouton "Analyser avec Claude" par main

### Joueurs
Recherche de joueurs par nom avec stats rapides. Clic pour modale détaillée : 16 stats preflop + postflop avec code couleur (norme reg / attention / leak).

### Coach
Détection automatique de 10 types de leaks sur vos dernières mains :
- Open limp, fold BB avec bonnes cotes, missed steal, wide UTG open
- Pas de 3-bet avec premiums, flat 3-bet OOP
- Missed c-bet, check-fold après PFR, min-bet suspect, passivité avec mains fortes

### Import
Import automatique depuis les dossiers configurés ou sélection manuelle. Supporte :
- **Winamax** : fichiers texte + summaries
- **PokerStars** : fichiers texte + résultats tournoi intégrés (satellites/tickets)
- **PMU** : fichiers XML iPoker

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Desktop | Electron 41 |
| UI | React 19 + Tailwind CSS 4 |
| Build | Vite 8 |
| Base de données | SQLite (better-sqlite3) |
| Graphiques | Recharts |
| Langage | TypeScript |
| Tests | Vitest |

## Installation

```bash
git clone <repo>
cd PokerPulse
npm install
```

## Développement

```bash
npm run dev
```

Lance Vite (renderer) + compilation TypeScript (main) + Electron en mode dev avec hot reload.

## Build

```bash
npm run build
npm run package
```

Génère l'application macOS dans le dossier `release/`.

## Configuration

Dans **Settings** :
- Configurez vos pseudos par room (Winamax, PokerStars, PMU)
- Indiquez les chemins des dossiers d'historiques de mains
- L'import automatique utilise ces chemins

## Architecture

```
src/
  engine/          Moteurs de calcul (EV, ICM, stats, leak detection)
  main/            Process principal Electron
    database/      Schéma SQLite + queries
    ipc/           Handlers IPC (hands, stats, players, coach, export)
    services/      Import, settings
  parsers/         Parsers par room (winamax, pokerstars, pmu)
    common/        Détection auto de room
  renderer/        Interface React
    components/    Composants (replayer, charts, modales)
    hooks/         Hooks custom (replayer state, shortcuts)
    pages/         Pages (Dashboard, Tournaments, Replayer, Coach...)
```

## Licence

ISC
