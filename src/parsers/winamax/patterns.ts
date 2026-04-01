// Regex patterns for Winamax hand history parsing

// Header line:
// Winamax Poker - Tournament "Freeroll 500€" buyIn: 5€ + 0.50€ level: 4 - HandId: #1234567-89-1234567890 - Holdem no limit (25/50/5) - 2024/01/15 20:30:00 UTC
export const HEADER = /^Winamax Poker - Tournament "(.+?)" buyIn:\s*([\d.,]+)€?\s*\+\s*([\d.,]+)€?\s*level:\s*(\d+)\s*-\s*HandId:\s*#([\w-]+)\s*-\s*Holdem no limit\s*\((\d+)\/(\d+)(?:\/(\d+))?\)\s*-\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s*UTC/;

// Table line:
// Table: 'Freeroll 500€(123456789)#005' 9-max (real money) Seat #3 is the button
export const TABLE = /^Table:\s*'(.+?)(?:\((\d+)\))?#\d+'\s+(\d+)-max\s+.*Seat\s+#(\d+)\s+is the button/;

// Seat line:
// Seat 1: Player1 (3500)
// Seat 1: Me_boo (20000, 0.50€ bounty)
export const SEAT = /^Seat\s+(\d+):\s+(.+?)\s+\((\d+)(?:,\s*[\d.,]+€?\s*bounty)?\)/;

// Dealt cards:
// Dealt to HeroName [Ah Kd]
export const DEALT = /^Dealt to\s+(.+?)\s+\[(\w{2})\s+(\w{2})\]/;

// Section markers
export const SECTION = /^\*\*\*\s+(.+?)\s+\*\*\*/;

// Flop: *** FLOP *** [Ks 7h 2d]
export const FLOP = /^\*\*\*\s+FLOP\s+\*\*\*\s+\[(\w{2})\s+(\w{2})\s+(\w{2})\]/;

// Turn: *** TURN *** [Ks 7h 2d][Jc]
export const TURN = /^\*\*\*\s+TURN\s+\*\*\*\s+\[.*?\]\[(\w{2})\]/;

// River: *** RIVER *** [Ks 7h 2d Jc][Qh]
export const RIVER = /^\*\*\*\s+RIVER\s+\*\*\*\s+\[.*?\]\[(\w{2})\]/;

// Actions:
// Player1 folds
// Player2 calls 200
// Player3 raises 300 to 300
// Player4 bets 250
// Player5 checks
// Player6 posts small blind 25
// Player7 posts big blind 50
// Player8 posts ante 5
export const ACTION_FOLD = /^(.+?)\s+folds/;
export const ACTION_CHECK = /^(.+?)\s+checks/;
export const ACTION_CALL = /^(.+?)\s+calls\s+([\d.]+)/;
export const ACTION_RAISE = /^(.+?)\s+raises\s+([\d.]+)\s+to\s+([\d.]+)/;
export const ACTION_BET = /^(.+?)\s+bets\s+([\d.]+)/;
export const ACTION_ALLIN = /^(.+?)\s+is all-in/;
export const ACTION_BLIND_SB = /^(.+?)\s+posts small blind\s+([\d.]+)/;
export const ACTION_BLIND_BB = /^(.+?)\s+posts big blind\s+([\d.]+)/;
export const ACTION_ANTE = /^(.+?)\s+posts ante\s+([\d.]+)/;

// Collected/won:
// HeroName collected 1320 from pot
export const COLLECTED = /^(.+?)\s+collected\s+([\d.]+)\s+from\s+(?:main\s+|side\s+)?pot/;

// Summary pot:
// Total pot 1320 | No Rake
// Total pot 1320 | Rake 10
export const TOTAL_POT = /^Total pot\s+([\d.]+)/;

// Showdown:
// Player shows [Ah Kd]
export const SHOWS = /^(.+?)\s+shows\s+\[(\w{2})\s+(\w{2})\]/;

// Summary seat line:
// Seat 3: HeroName (button) won 1320
export const SUMMARY_SEAT_WON = /^Seat\s+\d+:\s+(.+?)(?:\s+\(.+?\))?\s+won\s+([\d.]+)/;

// Hand separator - empty line between hands
export const HAND_SEPARATOR = /^\s*$/;
