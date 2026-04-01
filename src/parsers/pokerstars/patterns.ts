// Regex patterns for PokerStars hand history parsing

// Header line:
// PokerStars Hand #234567890123: Tournament #3456789012, $10.00+$1.00 USD Hold'em No Limit - Level XII (150/300) - 2024/01/15 21:45:00 CET [2024/01/15 15:45:00 ET]
export const HEADER = /^PokerStars Hand #(\d+):\s+Tournament #(\d+),\s*[$€]?([\d.]+)\+[$€]?([\d.]+)\s*(?:USD|EUR)?\s*Hold'em No Limit\s*-\s*Level\s+(\S+)\s*\((\d+)\/(\d+)\)\s*-\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s*(CET|ET|UTC)?/;

// Alternative header with ante in blinds: (150/300/40)
export const HEADER_WITH_ANTE = /\((\d+)\/(\d+)\/(\d+)\)/;

// Table line:
// Table '3456789012 42' 9-max Seat #6 is the button
export const TABLE = /^Table\s+'(\d+)\s+(\d+)'\s+(\d+)-max\s+Seat\s+#(\d+)\s+is the button/;

// Seat line:
// Seat 1: Player1 (8245 in chips)
export const SEAT = /^Seat\s+(\d+):\s+(.+?)\s+\((\d+)\s+in chips\)/;

// Dealt cards:
// Dealt to HeroName [Qs Qd]
export const DEALT = /^Dealt to\s+(.+?)\s+\[(\w{2})\s+(\w{2})\]/;

// Section markers
export const SECTION = /^\*\*\*\s+(.+?)\s+\*\*\*/;

// Board lines:
// *** FLOP *** [8h 5c 2s]
export const FLOP = /^\*\*\*\s+FLOP\s+\*\*\*\s+\[(\w{2})\s+(\w{2})\s+(\w{2})\]/;

// *** TURN *** [8h 5c 2s] [Kd]
export const TURN = /^\*\*\*\s+TURN\s+\*\*\*\s+\[.*?\]\s+\[(\w{2})\]/;

// *** RIVER *** [8h 5c 2s Kd] [3h]
export const RIVER = /^\*\*\*\s+RIVER\s+\*\*\*\s+\[.*?\]\s+\[(\w{2})\]/;

// Actions — PokerStars uses "PlayerName:" prefix
// Player1: folds
// Player2: calls 660
// HeroName: raises 360 to 660
// HeroName: bets 825
// HeroName: checks
// Player1: posts the ante 40
// Player8: posts small blind 150
// Player1: posts big blind 300
export const ACTION_FOLD = /^(.+?):\s+folds/;
export const ACTION_CHECK = /^(.+?):\s+checks/;
export const ACTION_CALL = /^(.+?):\s+calls\s+([\d.]+)/;
export const ACTION_RAISE = /^(.+?):\s+raises\s+([\d.]+)\s+to\s+([\d.]+)/;
export const ACTION_BET = /^(.+?):\s+bets\s+([\d.]+)/;
export const ACTION_ANTE = /^(.+?):\s+posts the ante\s+([\d.]+)/;
export const ACTION_BLIND_SB = /^(.+?):\s+posts small blind\s+([\d.]+)/;
export const ACTION_BLIND_BB = /^(.+?):\s+posts big blind\s+([\d.]+)/;

// All-in marker — appended to action lines
// "and is all-in" at end of line
export const ALLIN_MARKER = /and is all-in/;

// Showdown:
// HeroName: shows [Qs Qd] (a pair of Queens)
// Player6: mucks hand
export const SHOWS = /^(.+?):\s+shows\s+\[(\w{2})\s+(\w{2})\]/;
export const MUCKS = /^(.+?):\s+mucks hand/;

// Collected:
// HeroName collected 7010 from pot
// HeroName collected 7010 from side pot
// HeroName collected 7010 from main pot
export const COLLECTED = /^(.+?)\s+collected\s+([\d.]+)\s+from\s+(?:main\s+|side\s+)?pot/;

// Summary:
// Total pot 7010 | Rake 0
export const TOTAL_POT = /^Total pot\s+([\d.]+)/;

// Summary seat lines:
// Seat 3: HeroName showed [Qs Qd] and won (7010)
// Seat 6: Player6 (button) mucked
export const SUMMARY_SEAT_WON = /^Seat\s+\d+:\s+(.+?)(?:\s+\(.+?\))?\s+(?:showed .+ and )?won\s+\(([\d.]+)\)/;

// Uncalled bet:
// Uncalled bet (500) returned to Player1
export const UNCALLED_BET = /^Uncalled bet \(([\d.]+)\) returned to (.+)/;
