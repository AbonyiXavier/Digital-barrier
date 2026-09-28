/** Every queue in the system, in one place. */
export const QUEUE = {
  /** Fans an outbox event out to the notification channels. */
  NOTIFICATIONS: 'notifications',
  /** Downloads, validates and publishes blocklist feeds. */
  FEEDS: 'feeds',
  /** Scheduled housekeeping: expiring requests, marking devices offline. */
  MAINTENANCE: 'maintenance',
  /** Terminal failures. Nothing consumes this; it exists so nothing is lost. */
  DEAD_LETTER: 'dead-letter',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];
