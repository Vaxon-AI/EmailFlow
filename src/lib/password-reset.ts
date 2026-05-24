import crypto from 'crypto'

const DEFAULT_TOKEN_TTL_MINUTES = 60
const MS_PER_MINUTE = 60 * 1000

/** SHA-256 of the plaintext token. Never store or return the plaintext. */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function getConfiguredTokenTtlMinutes() {
  const minutes = parseInt(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? String(DEFAULT_TOKEN_TTL_MINUTES), 10)
  return Number.isNaN(minutes) || minutes <= 0 ? DEFAULT_TOKEN_TTL_MINUTES : minutes
}

/** Token TTL in milliseconds. Defaults to 60 minutes. */
export function getTokenTtlMs(): number {
  return getConfiguredTokenTtlMinutes() * MS_PER_MINUTE
}

/** Minimum seconds between reset requests for the same user. */
export const RATE_LIMIT_SECONDS = 60
