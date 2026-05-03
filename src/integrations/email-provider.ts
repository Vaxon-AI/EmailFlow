// ============================================================
// Email Provider Interface
// All email providers (Gmail, Outlook, etc.) implement this interface
// To add a new provider: create a folder, implement EmailProvider
// ============================================================

export interface EmailMessage {
  providerMessageId: string
  threadId: string | null
  subject: string
  sender: string
  recipients: string[]
  bodyPreview: string
  bodyFull: string
  receivedAt: Date
  hasAttachments: boolean

  /**
   * Provider-specific labels (e.g. Gmail's INBOX, IMPORTANT, etc.)
   * Each provider maps their native labels to this array.
   */
  labels: string[]

  /**
   * Normalized categories that ALL providers map to.
   * Used by pre-filter to skip AI for obvious cases.
   * Each provider is responsible for mapping their system to these values.
   *
   * - "spam": provider already flagged as junk/spam
   * - "promotions": marketing, deals, newsletters
   * - "social": social media notifications
   * - "updates": automated notifications (shipping, receipts, alerts)
   */
  providerCategories: NormalizedCategory[]
}

export type NormalizedCategory = 'spam' | 'promotions' | 'social' | 'updates'

export interface FetchNewEmailsOptions {
  /**
   * If provided, fetch emails received after this date.
   * If omitted, falls back to the user's persisted syncStartDate
   * (created on first sync, defaults to 7 days ago).
   */
  since?: Date

  /**
   * Hard cap on number of messages requested from the provider.
   * Used to keep AI quota and DB writes bounded for free-plan users.
   * Default: provider-specific (Gmail uses 100, the API page size).
   */
  maxResults?: number
}

export interface EmailProvider {
  /** Unique name for this provider (e.g. 'gmail', 'outlook') */
  name: string

  /** Fetch new emails (excluding already-known message IDs). */
  fetchNewEmails(userId: string, options?: FetchNewEmailsOptions): Promise<EmailMessage[]>

  /** Disconnect the provider and clean up tokens */
  disconnect(userId: string): Promise<void>
}
