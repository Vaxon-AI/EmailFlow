import { vi } from 'vitest'

// @sentry/nextjs requires Next.js runtime internals that are not available in
// the Node test environment. Mock it globally so any source file that imports
// Sentry still loads correctly without a real Next.js server.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn(),
  init: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setExtra: vi.fn(),
}))
