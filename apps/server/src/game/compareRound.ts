import type {
  GroupComparison,
  GroupResult,
  InstantWinKind,
  PlayerArrangement,
  RoundResult,
} from '@binh-13/shared'
import {
  compareInstantWin,
  compareThreeCard,
  detectInstantWin,
  evaluateThreeCard,
  INSTANT_WIN_NAME,
  THREE_CARD_CATEGORY_NAME,
} from '@binh-13/shared'
import { compareFiveCard, describeFiveCard } from './evaluator'
import { validateArrangement } from './foulCheck'

/**
 * Compares two full player arrangements and returns the complete round result.
 *
 * Logic:
 * 1. Check both players for an instant-win hand. It overrides the foul check: the stronger
 *    kind wins all 3 groups, and an equal kind is a draw at 0-0.
 * 2. Check both players for fouls.
 * 3. Foul player(s) lose all 3 groups automatically.
 * 4. If neither fouls, compare each group independently.
 * 5. Player who wins 2+ groups wins the round. Ties are possible.
 */
export function compareRound(
  p1: PlayerArrangement,
  p2: PlayerArrangement,
): RoundResult {
  const p1InstantWin = detectInstantWin(p1)
  const p2InstantWin = detectInstantWin(p2)
  if (p1InstantWin || p2InstantWin)
    return buildInstantWinResult(p1, p2, p1InstantWin, p2InstantWin)

  const p1Foul = !validateArrangement(p1)
  const p2Foul = !validateArrangement(p2)

  if (p1Foul || p2Foul) {
    return buildFoulResult(p1, p2, p1Foul, p2Foul)
  }

  return buildNormalResult(p1, p2)
}

function buildInstantWinResult(
  p1: PlayerArrangement,
  p2: PlayerArrangement,
  p1InstantWin: InstantWinKind | null,
  p2InstantWin: InstantWinKind | null,
): RoundResult {
  let groupResult: GroupResult
  if (p1InstantWin && p2InstantWin)
    groupResult = toGroupResult(compareInstantWin(p1InstantWin, p2InstantWin))
  else
    groupResult = p1InstantWin ? 'p1' : 'p2'

  // A player without a kind keeps a real foul status, so fouls still count in the stats.
  const p1Foul = !p1InstantWin && !validateArrangement(p1)
  const p2Foul = !p2InstantWin && !validateArrangement(p2)

  function handName(
    kind: InstantWinKind | null,
    foul: boolean,
    normalName: string,
  ) {
    if (kind)
      return INSTANT_WIN_NAME[kind]
    return foul ? 'Foul' : normalName
  }

  function group(
    p1Name: string,
    p2Name: string,
  ): GroupComparison {
    return {
      result: groupResult,
      p1Hand: handName(p1InstantWin, p1Foul, p1Name),
      p2Hand: handName(p2InstantWin, p2Foul, p2Name),
      p1Foul,
      p2Foul,
    }
  }

  return {
    group1: group(describeFiveCard(p1.group1), describeFiveCard(p2.group1)),
    group2: group(describeFiveCard(p1.group2), describeFiveCard(p2.group2)),
    group3: group(frontHandName(p1.group3), frontHandName(p2.group3)),
    winner: groupResult,
    p1Score: groupResult === 'p1' ? 3 : 0,
    p2Score: groupResult === 'p2' ? 3 : 0,
    p1Foul,
    p2Foul,
    p1InstantWin,
    p2InstantWin,
    arrangements: { p1, p2 },
  }
}

function buildFoulResult(
  p1: PlayerArrangement,
  p2: PlayerArrangement,
  p1Foul: boolean,
  p2Foul: boolean,
): RoundResult {
  let groupResult: GroupResult
  let p1Score: number
  let p2Score: number

  if (p1Foul && p2Foul) {
    groupResult = 'draw'
    p1Score = 0
    p2Score = 0
  }
  else if (p1Foul) {
    groupResult = 'p2'
    p1Score = 0
    p2Score = 3
  }
  else {
    groupResult = 'p1'
    p1Score = 3
    p2Score = 0
  }

  const foulGroup: GroupComparison = {
    result: groupResult,
    p1Hand: p1Foul ? 'Foul' : describeFiveCard(p1.group1),
    p2Hand: p2Foul ? 'Foul' : describeFiveCard(p2.group1),
    p1Foul,
    p2Foul,
  }

  const winner: RoundResult['winner']
    = groupResult === 'p1' ? 'p1' : groupResult === 'p2' ? 'p2' : 'draw'

  return {
    group1: {
      ...foulGroup,
      p1Hand: p1Foul ? 'Foul' : describeFiveCard(p1.group1),
      p2Hand: p2Foul ? 'Foul' : describeFiveCard(p2.group1),
    },
    group2: {
      ...foulGroup,
      p1Hand: p1Foul ? 'Foul' : describeFiveCard(p1.group2),
      p2Hand: p2Foul ? 'Foul' : describeFiveCard(p2.group2),
    },
    group3: {
      ...foulGroup,
      p1Hand: p1Foul ? 'Foul' : frontHandName(p1.group3),
      p2Hand: p2Foul ? 'Foul' : frontHandName(p2.group3),
    },
    winner,
    p1Score,
    p2Score,
    p1Foul,
    p2Foul,
    p1InstantWin: null,
    p2InstantWin: null,
    arrangements: { p1, p2 },
  }
}

function buildNormalResult(
  p1: PlayerArrangement,
  p2: PlayerArrangement,
): RoundResult {
  const g1Cmp = compareFiveCard(p1.group1, p2.group1)
  const g2Cmp = compareFiveCard(p1.group2, p2.group2)
  const g3Cmp = compareThreeCard(
    evaluateThreeCard(p1.group3),
    evaluateThreeCard(p2.group3),
  )

  const group1 = buildFiveCardGroup(p1.group1, p2.group1, g1Cmp)
  const group2 = buildFiveCardGroup(p1.group2, p2.group2, g2Cmp)
  const group3 = buildThreeCardGroup(p1.group3, p2.group3, g3Cmp)

  let p1Score = 0
  let p2Score = 0
  for (const g of [group1, group2, group3]) {
    if (g.result === 'p1')
      p1Score++
    else if (g.result === 'p2')
      p2Score++
  }

  const winner: RoundResult['winner']
    = p1Score > p2Score ? 'p1' : p2Score > p1Score ? 'p2' : 'draw'

  return {
    group1,
    group2,
    group3,
    winner,
    p1Score,
    p2Score,
    p1Foul: false,
    p2Foul: false,
    p1InstantWin: null,
    p2InstantWin: null,
    arrangements: { p1, p2 },
  }
}

function toGroupResult(cmp: -1 | 0 | 1): GroupResult {
  if (cmp === 1)
    return 'p1'
  if (cmp === -1)
    return 'p2'
  return 'draw'
}

function buildFiveCardGroup(
  p1Cards: PlayerArrangement['group1'],
  p2Cards: PlayerArrangement['group1'],
  cmp: -1 | 0 | 1,
): GroupComparison {
  return {
    result: toGroupResult(cmp),
    p1Hand: describeFiveCard(p1Cards),
    p2Hand: describeFiveCard(p2Cards),
    p1Foul: false,
    p2Foul: false,
  }
}

function buildThreeCardGroup(
  p1Cards: PlayerArrangement['group3'],
  p2Cards: PlayerArrangement['group3'],
  cmp: -1 | 0 | 1,
): GroupComparison {
  return {
    result: toGroupResult(cmp),
    p1Hand: frontHandName(p1Cards),
    p2Hand: frontHandName(p2Cards),
    p1Foul: false,
    p2Foul: false,
  }
}

function frontHandName(cards: PlayerArrangement['group3']): string {
  const rank = evaluateThreeCard(cards)
  return THREE_CARD_CATEGORY_NAME[rank.category]
}
