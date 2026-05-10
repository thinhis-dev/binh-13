// Suit and Rank
export type Suit = 'S' | 'H' | 'D' | 'C' // Spades, Hearts, Diamonds, Clubs
export type Rank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'T'
  | 'J'
  | 'Q'
  | 'K'
  | 'A'

// Use 'T' for 10 — aligns with pokersolver's format.
// Card id = rank + suit, e.g. "AS", "TH", "2C", "KD"
export type Card = {
  id: string
  rank: Rank
  suit: Suit
}

// Player (safe public view — never includes hand cards of opponents)
export type Player = {
  id: string
  name: string
  connected: boolean
}

// How many rounds to play
export type GameMode =
  | { type: 'single' }
  | { type: 'best_of'; rounds: 3 | 5 | 7 }
  | { type: 'custom'; roundCount: number }

export type RoomStatus = 'waiting' | 'arranging' | 'locked' | 'finished'

export type Room = {
  code: string
  status: RoomStatus
  players: Player[]
  mode: GameMode
  currentRound: number
  createdAt: number
  expiresAt: number
}

// Each player submits this after arranging their 13 cards
export type PlayerArrangement = {
  playerId: string
  group1: [Card, Card, Card, Card, Card] // Back — must be strongest (poker)
  group2: [Card, Card, Card, Card, Card] // Middle (poker)
  group3: [Card, Card, Card] // Front (simplified: trips > pair > high)
}

export type GroupResult = 'p1' | 'p2' | 'draw'

export type GroupComparison = {
  result: GroupResult
  p1Hand: string // human-readable, e.g. "Full House, Queens full of Nines"
  p2Hand: string
  p1Foul: boolean
  p2Foul: boolean
}

export type RoundResult = {
  group1: GroupComparison
  group2: GroupComparison
  group3: GroupComparison
  winner: 'p1' | 'p2' | 'draw'
  p1Score: number // 0–3 groups won
  p2Score: number
  p1Foul: boolean
  p2Foul: boolean
  arrangements: {
    p1: PlayerArrangement
    p2: PlayerArrangement
  }
}

export type SessionResult = {
  mode: GameMode
  rounds: RoundResult[]
  p1RoundsWon: number
  p2RoundsWon: number
  sessionWinner: 'p1' | 'p2' | 'draw' | null // null while in progress
}
