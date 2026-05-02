import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

// Path is relative to classify-email.ts (src/ai/skills/), not to the test file
vi.mock('@/ai/provider', () => ({
  getModel: vi.fn().mockReturnValue('mock-model'),
  getFallbackModel: vi.fn().mockReturnValue('fallback-model'),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { generateObject } from 'ai'
import { classifyEmail } from '../classify-email'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockGenerateObject = vi.mocked(generateObject)

const INPUT = {
  subject: 'Please review the contract',
  sender: 'partner@law.com',
  date: '2026-05-01',
  bodyPreview: 'Could you review and sign the attached contract by Friday?',
}

const CLASSIFICATION_RESULT = {
  category: 'action' as const,
  confidence: 0.95,
  reasoning: 'Email contains explicit request with a deadline.',
  isWorkRelated: true,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('classifyEmail', () => {
  it('returns the classification result from the primary model', async () => {
    mockGenerateObject.mockResolvedValue({ object: CLASSIFICATION_RESULT } as never)
    const result = await classifyEmail(INPUT)
    expect(result).toEqual(CLASSIFICATION_RESULT)
    expect(mockGenerateObject).toHaveBeenCalledTimes(1)
  })

  it('calls generateObject with the correct system and prompt fields', async () => {
    mockGenerateObject.mockResolvedValue({ object: CLASSIFICATION_RESULT } as never)
    await classifyEmail(INPUT)
    const [callArgs] = mockGenerateObject.mock.calls
    expect(callArgs[0].system).toContain('email triage')
    expect(callArgs[0].prompt).toContain(INPUT.subject)
    expect(callArgs[0].prompt).toContain(INPUT.sender)
  })

  it('includes memory context in the prompt when provided', async () => {
    mockGenerateObject.mockResolvedValue({ object: CLASSIFICATION_RESULT } as never)
    await classifyEmail({ ...INPUT, memory: 'User prefers to ignore newsletters' })
    const prompt = mockGenerateObject.mock.calls[0][0].prompt as string
    expect(prompt).toContain('User prefers to ignore newsletters')
  })

  it('does not include memory header when memory is not provided', async () => {
    mockGenerateObject.mockResolvedValue({ object: CLASSIFICATION_RESULT } as never)
    await classifyEmail(INPUT)
    const prompt = mockGenerateObject.mock.calls[0][0].prompt as string
    expect(prompt).not.toContain('User preferences')
  })

  it('falls back to getFallbackModel when the primary model throws', async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error('Primary model unavailable'))
      .mockResolvedValueOnce({ object: CLASSIFICATION_RESULT } as never)
    const result = await classifyEmail(INPUT)
    expect(result).toEqual(CLASSIFICATION_RESULT)
    expect(mockGenerateObject).toHaveBeenCalledTimes(2)
  })

  it('propagates the error when both models fail', async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error('Primary failed'))
      .mockRejectedValueOnce(new Error('Fallback failed'))
    await expect(classifyEmail(INPUT)).rejects.toThrow('Fallback failed')
  })
})
