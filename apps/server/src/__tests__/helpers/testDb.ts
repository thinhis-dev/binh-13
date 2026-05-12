import { closeDb, initDb } from '../../db'

export function resetTestDb(): void {
  closeDb()
  initDb()
}
