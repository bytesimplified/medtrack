import Dexie from 'dexie'
import { DATABASE_NAME, DATABASE_VERSION, SCHEMA_V1 } from './schema'

/** Construct without opening or seeding; callers control errors and lifecycle. */
export class MedTrackDatabase extends Dexie {
  constructor(name = DATABASE_NAME) {
    super(name)
    this.version(DATABASE_VERSION).stores(SCHEMA_V1)
  }
}

export const db = new MedTrackDatabase()
