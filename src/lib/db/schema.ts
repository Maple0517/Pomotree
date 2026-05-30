export const dexieSchema = {
  tasks: "id, parentId, status, sortOrder, createdAt, updatedAt, completedAt, archivedAt",
  focusSessions: "id, taskId, originalTaskId, status, startedAt, endedAt, createdAt, updatedAt",
  timerPauses: "id, sessionId, startedAt, endedAt",
  interruptions: "id, sessionId, taskId, status, convertedToTaskId, createdAt, updatedAt",
  userSettings: "id",
} as const;

export const dexieSchemaV2 = {
  tasks: "id, parentId, status, sortOrder, createdAt, updatedAt, completedAt, archivedAt, *labelIds",
  taskLabels: "id, &normalizedName, sortOrder, createdAt, updatedAt",
  focusSessions: dexieSchema.focusSessions,
  timerPauses: dexieSchema.timerPauses,
  interruptions: dexieSchema.interruptions,
  userSettings: dexieSchema.userSettings,
} as const;
