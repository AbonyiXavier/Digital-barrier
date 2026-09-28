/**
 * The delivery port.
 *
 * Adapters are selected by env (`NOTIFICATION_CHANNELS`), so the whole partner
 * journey can be walked locally with no email provider and no Expo account, and
 * going live is a config change rather than a code change.
 */

export type NotificationKind =
  | 'partner-invite'
  | 'partner-responded'
  | 'request-created'
  | 'request-resolved'
  | 'protection-changed'
  | 'feed-failed'
  | 'weekly-digest'
  | 'data-export';

export interface NotificationMessage {
  kind: NotificationKind;
  /** Email address, for channels that send mail. */
  email?: string;
  /** App user whose devices should be pushed to. */
  userId?: string;
  subject: string;
  body: string;
  /**
   * An action link, if the message has one. For a partner invite this is the
   * magic link — the stub channel prints it in full so the flow is walkable.
   */
  url?: string;
}

export interface NotificationChannel {
  readonly name: 'stub' | 'email' | 'push';
  send(message: NotificationMessage): Promise<void>;
}

/** DI token for the set of active channels. */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
