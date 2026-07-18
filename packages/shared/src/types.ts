// Suit and Rank
export type Suit = 'S' | 'H' | 'D' | 'C' // Spades, Hearts, Diamonds, Clubs
export type Rank
  = | '2'
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
export interface Card {
  id: string
  rank: Rank
  suit: Suit
}

export interface PlayerStats {
  games: number
  wins: number
  losses: number
  draws: number
  fouls: number
  sweeps: number
}

export interface PlayerProfile {
  playerId: number
  name: string
  avatar: string
  createdAt: number
  stats: PlayerStats
}

export const AVATARS = ['default', 'fox', 'panda', 'owl', 'tiger', 'rabbit'] as const
export type Avatar = (typeof AVATARS)[number]

export interface SessionCreatedPayload {
  playerId: number
  name: string
  token: string
}

export interface SessionRestorePayload {
  token: string
}

export interface SessionRestoredPayload {
  playerId: number
  name: string
  avatar: string
}

// Player (safe public view — never includes hand cards of opponents)
export interface Player {
  id: number
  name: string
  seat: 1 | 2
  connected: boolean
}

// How many rounds to play
export type GameMode
  = | { type: 'single' }
    | { type: 'best_of', rounds: 3 | 5 | 7 }
    | { type: 'custom', roundCount: number }

export type RoomStatus
  = | 'waiting'
    | 'playing'
    | 'arranging'
    | 'locked'
    | 'finished'

export interface Room {
  code: string
  status: RoomStatus
  createdBy: number
  players: Player[]
  settings?: RoomSettings
  mode?: GameMode
  currentRound?: number
  createdAt?: number
  expiresAt?: number
}

export interface RoomSettings {
  timerSeconds: number // 0 = unlimited
  autoStart: boolean
  allowFoul: boolean
  showHandStrength: boolean
  revealOnSubmit: boolean
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  timerSeconds: 60,
  autoStart: true,
  allowFoul: true,
  showHandStrength: true,
  revealOnSubmit: false,
}

export interface RoomMessage {
  playerId: number
  name: string
  text: string
  at: number
}

// Each player submits this after arranging their 13 cards
export interface PlayerArrangement {
  playerId: number
  group1: [Card, Card, Card, Card, Card] // Back — must be strongest (poker)
  group2: [Card, Card, Card, Card, Card] // Middle (poker)
  group3: [Card, Card, Card] // Front (simplified: trips > pair > high)
}

export type GroupResult = 'p1' | 'p2' | 'draw'

export interface GroupComparison {
  result: GroupResult
  p1Hand: string // human-readable, e.g. "Full House, Queens full of Nines"
  p2Hand: string
  p1Foul: boolean
  p2Foul: boolean
}

export interface RoundResult {
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
  surrendered?: boolean
  surrenderedBy?: number // playerId of the player who surrendered
}

export interface SessionResult {
  mode: GameMode
  rounds: RoundResult[]
  p1RoundsWon: number
  p2RoundsWon: number
  sessionWinner: 'p1' | 'p2' | 'draw' | null // null while in progress
}

export interface RematchState {
  requested: boolean // whether current player has requested
  opponentRequested: boolean // whether opponent has requested
}
