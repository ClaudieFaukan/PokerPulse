export type Room = 'winamax' | 'pokerstars' | 'pmu';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type ActionType =
  | 'fold'
  | 'check'
  | 'call'
  | 'bet'
  | 'raise'
  | 'allin'
  | 'post_blind'
  | 'post_ante';

export type TournamentType = 'MTT' | 'SNG' | 'SPIN' | 'SAT';

export type Speed = 'regular' | 'turbo' | 'hyper-turbo';

export interface ParsedPlayer {
  seat: number;
  name: string;
  stack: number;
  isHero: boolean;
  cards?: [string, string];
}

export interface ParsedAction {
  street: Street;
  player: string;
  action: ActionType;
  amount?: number;
}

export interface ParsedHand {
  handId: string;
  room: Room;
  tournamentId: string;
  tournamentName: string;
  buyIn: number;
  fee: number;
  datetime: Date;
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  buttonSeat: number;
  tableSize: number;
  players: ParsedPlayer[];
  heroCards: [string, string];
  board: {
    flop?: [string, string, string];
    turn?: string;
    river?: string;
  };
  actions: ParsedAction[];
  pot: number;
  winners: { player: string; amount: number }[];
  showdownHands: { player: string; cards: [string, string] }[];
  rawText: string;
}

export interface ParsedTournamentSummary {
  room: Room;
  tournamentId: string;
  tournamentName: string;
  buyIn: number;
  fee: number;
  bounty?: number;
  prizePool: number;
  totalPlayers: number;
  startTime: Date;
  endTime: Date;
  heroFinishPosition: number;
  heroPrize: number;
  heroBountiesWon?: number;
  payoutStructure: { position: number; prize: number }[];
  tournamentType: TournamentType;
  speed: Speed;
  isRebuy: boolean;
  isKnockout: boolean;
}
