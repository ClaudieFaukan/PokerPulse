import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

export interface ReplayerAction {
  street: string;
  player_name: string;
  action_type: string;
  amount: number | null;
  is_hero: boolean;
}

export interface ReplayerHand {
  id: number;
  hand_number: string;
  room: string;
  datetime: string;
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
  hero_card1: string;
  hero_card2: string;
  hero_position: string;
  total_pot: number;
  flop_card1: string | null;
  flop_card2: string | null;
  flop_card3: string | null;
  turn_card: string | null;
  river_card: string | null;
  num_players: number;
  raw_text: string;
  actions: ReplayerAction[];
  players: { seat: number; name: string; stack: number; bounty: number; isHero: boolean }[];
  buttonSeat: number;
  showdownCards: Map<string, [string, string]>; // player name → [card1, card2]
}

export interface PlayerState {
  seat: number;
  name: string;
  stack: number;
  bounty: number; // bounty value in € (KO tournaments)
  isHero: boolean;
  cards: [string, string] | null;
  folded: boolean;
  currentBet: number;
  isActive: boolean;
  lastAction: string | null;
}

export interface HeroDecision {
  toCall: number;          // chips to call
  potAfterCall: number;    // pot if hero calls
  equityNeeded: number;    // % equity needed without bounty
  equityWithBounty: number | null; // % equity needed with bounty dead money (null if hero doesn't cover)
  bountyChips: number;     // bounty value in chips added to pot
  odds: string;            // "X:1" pot odds display
  heroCoversBettor: boolean; // true if hero can eliminate the bettor
}

export interface PlayerEquity {
  name: string;
  equity: number; // 0-1
}

export interface StreetEquity {
  street: string;
  players: PlayerEquity[];
}

export interface TableState {
  players: PlayerState[];
  pot: number;
  board: string[];
  currentStreet: string;
  currentActionIndex: number;
  totalActions: number;
  lastAction: { player: string; action: string; amount?: number } | null;
  heroDecision: HeroDecision | null; // shown when hero faces a bet
}

export interface Step {
  type: 'actions' | 'board';
  actionRange: [number, number]; // [start, end] inclusive — for 'board' type, use last action index
  boardReveal?: 'flop' | 'turn' | 'river';
}

/**
 * Build replay steps:
 * - Group antes+blinds into one step
 * - Each action = one step
 * - Add virtual "board" steps for flop/turn/river when no actions exist on those streets
 *   (all-in preflop scenarios)
 */
function buildSteps(actions: ReplayerAction[], hand: ReplayerHand | null): Step[] {
  if (actions.length === 0) return [];

  const steps: Step[] = [];
  let i = 0;

  // Group antes + blinds
  const blindActions = new Set(['post_ante', 'post_blind']);
  if (blindActions.has(actions[0]?.action_type)) {
    let end = 0;
    while (end + 1 < actions.length && blindActions.has(actions[end + 1]?.action_type)) {
      end++;
    }
    steps.push({ type: 'actions', actionRange: [0, end] });
    i = end + 1;
  }

  // Each remaining action is its own step
  while (i < actions.length) {
    steps.push({ type: 'actions', actionRange: [i, i] });
    i++;
  }

  // Check if board cards exist but no actions on those streets (all-in scenario)
  if (hand) {
    const hasStreet = (street: string) => actions.some((a) => a.street === street);
    const lastActionIdx = actions.length - 1;

    if (hand.flop_card1 && !hasStreet('flop')) {
      steps.push({ type: 'board', actionRange: [lastActionIdx, lastActionIdx], boardReveal: 'flop' });
    }
    if (hand.turn_card && !hasStreet('turn')) {
      steps.push({ type: 'board', actionRange: [lastActionIdx, lastActionIdx], boardReveal: 'turn' });
    }
    if (hand.river_card && !hasStreet('river')) {
      steps.push({ type: 'board', actionRange: [lastActionIdx, lastActionIdx], boardReveal: 'river' });
    }
  }

  return steps;
}

const SPEED_MAP: Record<number, number> = {
  0.5: 2000,
  1: 1000,
  2: 500,
  4: 250,
};

export function useReplayerState(hand: ReplayerHand | null, bountyChipRatio?: number) {
  const [stepIndex, setStepIndex] = useState(-1); // -1 = initial state
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const actions = hand?.actions || [];
  const steps = useMemo(() => buildSteps(actions, hand), [actions, hand]);
  const totalSteps = steps.length;

  // The action index is the end of the current step
  const currentStep = stepIndex >= 0 && stepIndex < steps.length ? steps[stepIndex] : null;
  const actionIndex = currentStep ? currentStep.actionRange[1] : -1;

  // Collect which board streets to reveal based on virtual board steps reached
  const boardReveals = useMemo(() => {
    const reveals = new Set<string>();
    for (let s = 0; s <= stepIndex && s < steps.length; s++) {
      if (steps[s].type === 'board' && steps[s].boardReveal) {
        reveals.add(steps[s].boardReveal!);
      }
    }
    return reveals;
  }, [steps, stepIndex]);

  useEffect(() => {
    setStepIndex(-1);
    setIsPlaying(false);
  }, [hand?.id]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (isPlaying && hand) {
      intervalRef.current = setInterval(() => {
        setStepIndex((prev) => {
          if (prev >= totalSteps - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, SPEED_MAP[speed] || 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, totalSteps, hand]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  const next = useCallback(() => {
    setIsPlaying(false);
    setStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
  }, [totalSteps]);

  const prev = useCallback(() => {
    setIsPlaying(false);
    setStepIndex((prev) => Math.max(prev - 1, -1));
  }, []);

  const goToStart = useCallback(() => {
    setIsPlaying(false);
    setStepIndex(-1);
  }, []);

  const goToEnd = useCallback(() => {
    setIsPlaying(false);
    setStepIndex(totalSteps - 1);
  }, [totalSteps]);

  const goTo = useCallback((idx: number) => {
    setIsPlaying(false);
    setStepIndex(Math.max(-1, Math.min(idx, totalSteps - 1)));
  }, [totalSteps]);

  const tableState = buildTableState(hand, actionIndex, boardReveals, bountyChipRatio);

  // Compute equity for all streets asynchronously to avoid blocking the UI
  const [allInEquityData, setAllInEquityData] = useState<Record<number, StreetEquity> | null>(null);

  useEffect(() => {
    if (!hand || !hand.showdownCards || !(hand.showdownCards instanceof Map)) {
      setAllInEquityData(null);
      return;
    }

    // Only compute equity when hero went all-in (not folded)
    const heroAllin = hand.actions.some((a) => a.is_hero && a.action_type === 'allin');
    const heroFolded = hand.actions.some((a) => a.is_hero && a.action_type === 'fold');
    if (!heroAllin || heroFolded) {
      setAllInEquityData(null);
      return;
    }

    const playerHands: { name: string; cards: [string, string] }[] = [];
    const heroPlayer = hand.players.find((p) => p.isHero);
    if (heroPlayer && hand.hero_card1 && hand.hero_card2) {
      playerHands.push({ name: heroPlayer.name, cards: [hand.hero_card1, hand.hero_card2] });
    }
    for (const [name, cards] of hand.showdownCards) {
      if (!playerHands.some((p) => p.name === name)) {
        playerHands.push({ name, cards });
      }
    }
    if (playerHands.length < 2) {
      setAllInEquityData(null);
      return;
    }

    let cancelled = false;

    // Dynamic import to avoid breaking module loading
    import('../../engine/ev-calculator').then(({ calculateEquity }) => {
      if (cancelled) return;

      const hands = playerHands.map((p) => p.cards);
      const streetMap: Record<number, StreetEquity> = {};

      // Flop/turn/river are fast (max 990 combos)
      if (hand.flop_card1 && hand.flop_card2 && hand.flop_card3) {
        const board = [hand.flop_card1, hand.flop_card2, hand.flop_card3];
        const eq = calculateEquity(hands, board);
        streetMap[3] = { street: 'Flop', players: playerHands.map((p, i) => ({ name: p.name, equity: eq[i] })) };
      }
      if (hand.turn_card && hand.flop_card1) {
        const board = [hand.flop_card1, hand.flop_card2!, hand.flop_card3!, hand.turn_card];
        const eq = calculateEquity(hands, board);
        streetMap[4] = { street: 'Turn', players: playerHands.map((p, i) => ({ name: p.name, equity: eq[i] })) };
      }
      if (hand.river_card && hand.flop_card1) {
        const board = [hand.flop_card1, hand.flop_card2!, hand.flop_card3!, hand.turn_card!, hand.river_card];
        const eq = calculateEquity(hands, board);
        streetMap[5] = { street: 'River', players: playerHands.map((p, i) => ({ name: p.name, equity: eq[i] })) };
      }

      // Preflop: only for 2 players heads-up (C(48,5) = 1.7M combos)
      if (playerHands.length === 2) {
        try {
          const eq = calculateEquity(hands, []);
          streetMap[0] = { street: 'Preflop', players: playerHands.map((p, i) => ({ name: p.name, equity: eq[i] })) };
        } catch { /* skip if too slow */ }
      }

      if (!cancelled) setAllInEquityData(streetMap);
    }).catch(() => { /* module not available, skip equity */ });

    return () => { cancelled = true; };
  }, [hand]);

  // Current equity based on visible board cards + at least 2 visible hands
  const visibleHands = tableState.players.filter((p) => p.cards && !p.folded).length;
  const currentEquities = visibleHands >= 2 && allInEquityData
    ? (allInEquityData[tableState.board.length]?.players || null)
    : null;

  // All street equities for evolution display
  const streetEquities = useMemo(() => {
    if (!allInEquityData) return [];
    // Sort by board length: preflop, flop, turn, river
    return Object.entries(allInEquityData)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, v]) => v);
  }, [allInEquityData]);

  return {
    tableState,
    currentEquities,
    streetEquities,
    actionIndex,
    totalActions: actions.length,
    stepIndex,
    totalSteps,
    isPlaying,
    speed,
    setSpeed,
    play,
    pause,
    togglePlay,
    next,
    prev,
    goToStart,
    goToEnd,
    goTo,
  };
}

function formatActionLabel(actionType: string, amount?: number): string {
  const labels: Record<string, string> = {
    fold: 'FOLD',
    check: 'CHECK',
    call: 'CALL',
    bet: 'BET',
    raise: 'RAISE',
    allin: 'ALL-IN',
    post_blind: '',
    post_ante: '',
  };
  const label = labels[actionType] || '';
  if (!label) return '';
  if (amount && amount > 0 && actionType !== 'fold' && actionType !== 'check') {
    return `${label} ${amount.toLocaleString()}`;
  }
  return label;
}

function buildTableState(hand: ReplayerHand | null, upToIndex: number, boardReveals?: Set<string>, bountyChipRatio?: number): TableState {
  if (!hand) {
    return { players: [], pot: 0, board: [], currentStreet: 'preflop', currentActionIndex: -1, totalActions: 0, lastAction: null, heroDecision: null };
  }

  const players: PlayerState[] = hand.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    stack: p.stack,
    bounty: p.bounty || 0,
    isHero: p.isHero,
    cards: p.isHero && hand.hero_card1 && hand.hero_card2
      ? [hand.hero_card1, hand.hero_card2]
      : null,
    folded: false,
    currentBet: 0,
    isActive: false,
    lastAction: null,
  }));

  let pot = 0;
  let currentStreet = 'preflop';
  let lastAction: TableState['lastAction'] = null;
  const board: string[] = [];

  for (let i = 0; i <= upToIndex && i < hand.actions.length; i++) {
    const action = hand.actions[i];
    const player = players.find((p) => p.name === action.player_name);

    if (action.street !== currentStreet) {
      for (const p of players) {
        pot += p.currentBet;
        p.currentBet = 0;
        // Clear action labels on new street (except fold)
        if (p.lastAction && !p.lastAction.startsWith('FOLD')) {
          p.lastAction = null;
        }
      }
      currentStreet = action.street;

      if (currentStreet === 'flop' && hand.flop_card1 && board.length === 0) {
        board.push(hand.flop_card1, hand.flop_card2!, hand.flop_card3!);
      } else if (currentStreet === 'turn' && hand.turn_card && board.length === 3) {
        board.push(hand.turn_card);
      } else if (currentStreet === 'river' && hand.river_card && board.length === 4) {
        board.push(hand.river_card);
      }
    }

    if (player) {
      for (const p of players) p.isActive = false;
      player.isActive = true;

      const amount = action.amount || 0;

      switch (action.action_type) {
        case 'post_ante':
          player.stack -= amount;
          pot += amount;
          break;
        case 'post_blind':
          player.stack -= amount;
          player.currentBet = amount;
          break;
        case 'fold':
          player.folded = true;
          player.lastAction = 'FOLD';
          break;
        case 'check':
          player.lastAction = 'CHECK';
          break;
        case 'call':
          player.stack -= amount;
          player.currentBet += amount;
          player.lastAction = `CALL ${amount.toLocaleString()}`;
          break;
        case 'bet':
          player.stack -= amount;
          player.currentBet = amount;
          player.lastAction = `BET ${amount.toLocaleString()}`;
          break;
        case 'raise': {
          const additional = amount - player.currentBet;
          player.stack -= additional;
          player.currentBet = amount;
          player.lastAction = `RAISE ${amount.toLocaleString()}`;
          break;
        }
        case 'allin': {
          const allinAmount = Math.min(player.stack, amount || player.stack);
          player.stack -= allinAmount;
          player.currentBet += allinAmount;
          player.lastAction = 'ALL-IN';
          break;
        }
      }

      lastAction = {
        player: action.player_name,
        action: action.action_type,
        amount: amount || undefined,
      };
    }
  }

  // Reveal board cards from virtual board steps (all-in scenarios)
  if (boardReveals) {
    if (boardReveals.size > 0) {
      // Collect bets into pot before showing board
      for (const p of players) {
        pot += p.currentBet;
        p.currentBet = 0;
      }
    }
    if (boardReveals.has('flop') && hand.flop_card1 && board.length === 0) {
      board.push(hand.flop_card1, hand.flop_card2!, hand.flop_card3!);
    }
    if (boardReveals.has('turn') && hand.turn_card && board.length === 3) {
      board.push(hand.turn_card);
    }
    if (boardReveals.has('river') && hand.river_card && board.length === 4) {
      board.push(hand.river_card);
    }
  }

  // Reveal showdown cards when:
  // - Board starts appearing in all-in (boardReveals has entries)
  // - Or board is complete (5 cards in normal play)
  // - Or we reached the showdown street in actions
  const atShowdown = board.length >= 3 && (
    (boardReveals && boardReveals.size > 0) ||
    board.length === 5 ||
    currentStreet === 'river' ||
    upToIndex >= hand.actions.length - 1
  );
  if (atShowdown && hand.showdownCards && hand.showdownCards instanceof Map) {
    for (const p of players) {
      if (!p.cards && !p.folded) {
        const shown = hand.showdownCards.get(p.name);
        if (shown) {
          p.cards = shown;
        }
      }
    }
  }

  const displayPot = pot + players.reduce((s, p) => s + p.currentBet, 0);

  // Calculate hero decision when hero faces a bet
  let heroDecision: HeroDecision | null = null;
  const hero = players.find((p) => p.isHero);
  if (hero && !hero.folded && upToIndex >= 0) {
    // Check if the NEXT action is from the hero (hero is about to act)
    const nextActionIdx = upToIndex + 1;
    const nextAction = nextActionIdx < hand.actions.length ? hand.actions[nextActionIdx] : null;
    const heroName = hero.name;

    // Also check: is the current last action a bet/raise facing the hero?
    // The hero faces a decision if someone bet/raised and it's hero's turn
    const maxBet = Math.max(...players.filter((p) => !p.folded).map((p) => p.currentBet));
    const toCall = maxBet - hero.currentBet;

    if (toCall > 0 && nextAction?.player_name === heroName) {
      const potBeforeCall = displayPot;
      const potAfterCall = potBeforeCall + toCall;

      // Equity needed = toCall / (toCall + pot)
      const equityNeeded = (toCall / potAfterCall) * 100;

      // Bounty dead money: only applies if hero COVERS the villain (can eliminate them)
      // When hero eliminates villain, hero gets half villain's bounty in cash
      // That cash = villain.bounty / 2 → converted to chips via bountyChipRatio
      let villainBountyChips = 0;
      let heroCoversBettor = false;
      if (bountyChipRatio && lastAction) {
        const villain = players.find((p) => p.name === lastAction.player);
        if (villain && villain.bounty > 0) {
          // Hero covers villain if hero's remaining stack after calling >= 0
          // AND villain is all-in (or hero's stack > villain's stack)
          heroCoversBettor = hero.stack > toCall || (hero.stack + hero.currentBet) >= (villain.stack + villain.currentBet);
          if (heroCoversBettor) {
            villainBountyChips = villain.bounty * bountyChipRatio;
          }
        }
      }

      // Equity with bounty = toCall / (toCall + pot + bountyChips)
      // Only if hero covers the villain (can actually eliminate them)
      const equityWithBounty = villainBountyChips > 0
        ? (toCall / (potAfterCall + villainBountyChips)) * 100
        : null;

      // Pot odds as ratio
      const oddsRatio = toCall > 0 ? ((potBeforeCall) / toCall).toFixed(1) : '0';

      heroDecision = {
        toCall,
        potAfterCall,
        equityNeeded: Math.round(equityNeeded * 10) / 10,
        equityWithBounty: equityWithBounty !== null ? Math.round(equityWithBounty * 10) / 10 : null,
        bountyChips: Math.round(villainBountyChips),
        odds: `${oddsRatio}:1`,
        heroCoversBettor,
      };
    }
  }

  return {
    players,
    pot: displayPot,
    board,
    currentStreet,
    currentActionIndex: upToIndex,
    totalActions: hand.actions.length,
    lastAction,
    heroDecision,
  };
}
