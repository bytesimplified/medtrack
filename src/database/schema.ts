/** Never edit a released schema version; append a new version and migration. */
export const DATABASE_VERSION = 2
export const DATABASE_NAME = 'medtrack'
export const SCHEMA_V1 = {
  medicines: 'id, name, createdAt',
  doseSchedules:
    'id, medicineId, seriesId, &[seriesId+version], [medicineId+effectiveFrom]',
  doseOccurrences:
    'id, medicineId, &[scheduleId+scheduledDate], scheduledDate, [medicineId+scheduledDate], [scheduledDate+status]',
  doseEvents: 'id, &operationId, occurrenceId, [occurrenceId+recordedAt]',
  stockTransactions:
    'id, &operationId, medicineId, &doseEventId, &reversesTransactionId, [medicineId+createdAt]',
  reminderPreferences: 'id, &scheduleId',
} as const

export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  medicines: `${SCHEMA_V1.medicines}, updatedAt`,
} as const
