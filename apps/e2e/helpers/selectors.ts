import type { Page } from '@playwright/test'

export type GroupKey = 'group1' | 'group2' | 'group3'

/** Generic destructive-error banner shared by Home / Profile / Lobby. */
export function errorBanner(page: Page) {
  return page.getByTestId('error-banner')
}

export function roomCode(page: Page) {
  return page.getByTestId('room-code')
}

export function roundResult(page: Page) {
  return page.getByTestId('round-result')
}

/** Skips the row-by-row reveal on the result page. */
export function skipRevealButton(page: Page) {
  return page.getByRole('button', { name: 'Skip', exact: true })
}

/** The swap board: Front, Middle, and Back rows. */
export function board(page: Page) {
  return page.getByTestId('board')
}

export function boardCards(page: Page) {
  return board(page).locator('[data-card-id]')
}

export function cardOnBoard(page: Page, cardId: string) {
  return board(page).locator(`[data-card-id="${cardId}"]`)
}

export function groupRow(page: Page, key: GroupKey) {
  return page.getByTestId(`group-row-${key}`)
}

export function rowCards(page: Page, key: GroupKey) {
  return groupRow(page, key).locator('[data-card-id]')
}

/** The card that the dragged card is over during a drag. */
export function dropTarget(page: Page) {
  return board(page).locator('[data-drop-over="true"]')
}

export function sortButton(page: Page) {
  return page.getByRole('button', { name: 'Sort', exact: true })
}

export function hintButton(page: Page) {
  return page.getByRole('button', { name: 'Hint', exact: true })
}

export function sortedDealSwitch(page: Page) {
  return page.getByRole('switch', { name: 'Sorted deal' })
}

export function submitArrangementButton(page: Page) {
  return page.getByRole('button', { name: 'Submit Arrangement' })
}

export function selfSubmittedIndicator(page: Page) {
  return page.getByTestId('self-submitted')
}

export function opponentSubmittedIndicator(page: Page) {
  return page.getByTestId('opponent-submitted')
}

export function foulWarning(page: Page) {
  return page.getByText('Possible foul', { exact: false })
}

export function surrenderTriggerButton(page: Page) {
  return page.getByRole('button', { name: 'Surrender', exact: true })
}

export function surrenderDialog(page: Page) {
  return page.getByRole('alertdialog')
}

export function rematchButton(page: Page) {
  return page.getByRole('button', { name: 'Rematch' })
}

export function rematchWaitingIndicator(page: Page) {
  return page.getByRole('button', { name: 'Waiting for opponent' })
}

export function rematchOpponentBanner(page: Page) {
  return page.getByTestId('rematch-opponent-banner')
}

export function rematchCancelledNotice(page: Page) {
  return page.getByTestId('rematch-cancelled-notice')
}

export function acceptRematchButton(page: Page) {
  return rematchOpponentBanner(page).getByRole('button', { name: 'Accept' })
}

export function declineRematchButton(page: Page) {
  return rematchOpponentBanner(page).getByRole('button', { name: 'Decline' })
}
