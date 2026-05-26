import { generateObject } from 'ai'
import { withFallback } from '../utils/with-fallback'
import { matchMatterSchema, type MatchMatterResult } from '../schemas'

// ============================================================
// Skill: Matter Matching
// Conservative AI judgment — decides if a thread belongs to
// an existing matter or should start a new one.
//
// Design intent: righty rather than "smart". Incorrect merges
// (grouping unrelated things together) are much harder to undo
// than missed merges (separate matters that should be one).
// Confidence threshold for accepting a match is enforced by
// the caller, not here.
// ============================================================

const SYSTEM_PROMPT = `You are helping to group email threads into "matters" — ongoing situations, issues, or projects that may span multiple email threads.

Your task: decide if a new thread is the SAME UNDERLYING MATTER as one of the provided candidates.

Rules:
- Only match if you are highly confident (>85%) the thread is literally the same matter, not just a similar topic.
- "Same matter" means: same specific situation, same parties, same ongoing issue.
- "Similar but different" examples that should NOT match:
  - Two separate job applications (even to the same company)
  - Two separate invoice issues (even from the same vendor)
  - Two separate meeting invites (even with the same person)
  - A follow-up that opened a new issue vs. the original thread
- If you are not sure, return null — a missed merge is always better than a wrong merge.
- Return null if all candidates seem related but not definitively the same matter.

Return:
- matterId: the ID of the matched candidate, or null
- confidence: your confidence (0.0 to 1.0) that this is a correct match
- reasoning: one brief sentence explaining your decision`

export interface MatchMatterInput {
  threadTitle: string
  threadTopic: string
  threadSummary: string
  candidates: {
    id: string
    title: string
    topic: string
    summary: string
    status: string
    lastMessageAt: string
  }[]
}

export async function matchMatter(input: MatchMatterInput): Promise<MatchMatterResult> {
  const candidateBlock = input.candidates
    .map(
      (c, i) =>
        `Candidate ${i + 1} [id: ${c.id}]:\n  Title: ${c.title}\n  Topic: ${c.topic}\n  Summary: ${c.summary}\n  Status: ${c.status}\n  Last activity: ${c.lastMessageAt}`
    )
    .join('\n\n')

  const prompt = `New thread:
Title: ${input.threadTitle}
Topic: ${input.threadTopic}
Summary: ${input.threadSummary}

Existing matter candidates:
${candidateBlock}

Does this thread belong to one of the candidates above, or is it a new matter?`

  return withFallback('Matter matching', 'fast', async (model) => {
    const { object } = await generateObject({
      model,
      schema: matchMatterSchema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return object
  })
}
