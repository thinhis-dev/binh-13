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

export function handArea(page: Page) {
  return page.getByTestId('hand-area')
}

export function handCards(page: Page) {
  return handArea(page).locator('[data-card-id]')
}

export function cardInHand(page: Page, cardId: string) {
  return handArea(page).locator(`[data-card-id="${cardId}"]`)
}

export function sortButton(page: Page) {
  return handArea(page).getByRole('button', { name: 'Sort' })
}

export function groupSlot(page: Page, key: GroupKey) {
  return page.getByTestId(`group-slot-${key}`)
}

export function emptySlotIn(page: Page, key: GroupKey) {
  return groupSlot(page, key).getByTestId('empty-slot')
}

export function cardInGroup(page: Page, key: GroupKey, cardId: string) {
  return groupSlot(page, key).locator(`[data-card-id="${cardId}"]`)
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
