// Regex patterns for PMU / iPoker text format hand history parsing

// Header:
// ***** History for hand #12345678-12 *****
export const HEADER = /^\*{5}\s+History for hand #([\w-]+)\s+\*{5}/;

// Start hand date:
// Start hand: Mon Jan 15 20:00:00 CET 2024
export const START_DATE = /^Start hand:\s+(.+)/;

// Table info:
// Table: TableName [12345678] (NO_LIMIT TEXAS_HOLDEM 50/100/10, Tournament)
export const TABLE_INFO = /^Table:\s+(.+?)\s+\[(\d+)\]\s+\(NO_LIMIT\s+TEXAS_HOLDEM\s+(\d+)\/(\d+)(?:\/(\d+))?,\s*Tournament\)/;

// Seat:
// Seat 1: Player1 (4500)
export const SEAT = /^Seat\s+(\d+):\s+(.+?)\s+\((\d+)\)/;

// Button:
// Button: Seat 5
export const BUTTON = /^Button:\s+Seat\s+(\d+)/;

// Blinds:
// Small Blind [Seat 6]: Player6 (50)
// Big Blind [Seat 1]: Player1 (100)
export const SMALL_BLIND = /^Small Blind \[Seat (\d+)\]:\s+(.+?)\s+\((\d+)\)/;
export const BIG_BLIND = /^Big Blind \[Seat (\d+)\]:\s+(.+?)\s+\((\d+)\)/;

// Ante:
// Ante [Seat 1]: Player1 (10)
export const ANTE = /^Ante \[Seat (\d+)\]:\s+(.+?)\s+\((\d+)\)/;

// Dealt cards:
// Dealt to HeroName [Jh Ts]
export const DEALT = /^Dealt to\s+(.+?)\s+\[(\w{2})\s+(\w{2})\]/;

// Street markers:
// ---FLOP--- [Qh 9c 8d]
// ---TURN--- [Qh 9c 8d] [Kc]
// ---RIVER--- [Qh 9c 8d Kc] [2h]
export const FLOP = /^---FLOP---\s+\[(\w{2})\s+(\w{2})\s+(\w{2})\]/;
export const TURN = /^---TURN---\s+\[.*?\]\s+\[(\w{2})\]/;
export const RIVER = /^---RIVER---\s+\[.*?\]\s+\[(\w{2})\]/;

// Actions:
// Player3 folds
// HeroName raises 250
// Player6 checks
// HeroName bets 400
// Player6 calls 400
// Player1 is all-in 4500
export const ACTION_FOLD = /^(.+?)\s+folds/;
export const ACTION_CHECK = /^(.+?)\s+checks/;
export const ACTION_CALL = /^(.+?)\s+calls\s+([\d.]+)/;
export const ACTION_RAISE = /^(.+?)\s+raises\s+([\d.]+)/;
export const ACTION_BET = /^(.+?)\s+bets\s+([\d.]+)/;
export const ACTION_ALLIN = /^(.+?)\s+is all-in\s+([\d.]+)/;

// Results:
// HeroName wins 1850
// Player6 mucks
export const WINS = /^(.+?)\s+wins\s+([\d.]+)/;
export const MUCKS = /^(.+?)\s+mucks/;

// Shows:
// HeroName shows [Jh Ts]
export const SHOWS = /^(.+?)\s+shows\s+\[(\w{2})\s+(\w{2})\]/;

// --- XML action types (real PMU/iPoker format) ---
// 0 = fold, 1 = small blind, 2 = big blind, 3 = call, 4 = check, 5 = bet, 15 = ante, 23 = raise
export const XML_ACTION_TYPES: Record<string, string> = {
  '0': 'fold',
  '1': 'post_blind',   // small blind
  '2': 'post_blind',   // big blind
  '3': 'call',
  '4': 'check',
  '5': 'bet',
  '15': 'post_ante',
  '23': 'raise',
};
