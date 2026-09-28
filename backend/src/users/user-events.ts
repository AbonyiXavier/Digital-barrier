/**
 * An outbox event this module emits that `OUTBOX_EVENT` does not declare.
 *
 * `src/outbox/outbox.events.ts` is owned elsewhere and has no member for a data
 * export, so the row is written through Prisma directly with this event type and
 * the notifications consumer handles it by name. The clean fix is one line in
 * `OUTBOX_EVENT`; see the module notes.
 */
export const USER_EVENT = {
  EXPORT_REQUESTED: 'user.export_requested',
} as const;

export type UserEventType = (typeof USER_EVENT)[keyof typeof USER_EVENT];
