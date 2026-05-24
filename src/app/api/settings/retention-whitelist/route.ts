/**
 * GET  /api/settings/retention-whitelist      — list all protection rules
 * POST /api/settings/retention-whitelist      — add a rule
 *   Body: { ruleType: 'CONTACT' | 'DOMAIN' | 'LABEL', value: string }
 */

import { getAuthUser, success, error, errorFromException, parseJsonBody } from '@/lib/api-helpers'
import * as retentionRepo from '@/repositories/retention-repo'
import type { ProtectionRuleType } from '@prisma/client'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const VALID_RULE_TYPES: ProtectionRuleType[] = ['CONTACT', 'DOMAIN', 'LABEL']
const retentionWhitelistSchema = z.object({
  ruleType: z.enum(VALID_RULE_TYPES, {
    message: `ruleType must be one of: ${VALID_RULE_TYPES.join(', ')}`,
  }),
  value: z.string().trim().min(1, 'value is required and must be a non-empty string'),
})

export async function GET() {
  try {
    const user = await getAuthUser()
    const rules = await retentionRepo.getProtectionRulesWithIds(user.id)
    return success(rules)
  } catch (err) {
    return errorFromException(err, 'FETCH_FAILED', 'Failed to fetch whitelist rules', 500)
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser()
    const { ruleType, value } = await parseJsonBody(req, retentionWhitelistSchema, {
      code: 'INVALID_INPUT',
    })

    const rule = await retentionRepo.addProtectionRule(user.id, ruleType, value)
    return success(rule)
  } catch (err) {
    // Unique constraint violation → duplicate rule
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      return error('DUPLICATE_RULE', 'This rule already exists', 409)
    }
    return errorFromException(err, 'CREATE_FAILED', 'Failed to add whitelist rule', 500)
  }
}
