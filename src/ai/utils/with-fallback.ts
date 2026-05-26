import { getModel, getFallbackModel, type ModelTier } from '../provider'

type Model = ReturnType<typeof getModel>

export async function withFallback<T>(
  label: string,
  tier: ModelTier,
  run: (model: Model) => Promise<T>,
): Promise<T> {
  try {
    return await run(getModel(tier))
  } catch (error) {
    console.warn(`${label} primary model failed, trying fallback:`, error)
    return await run(getFallbackModel(tier))
  }
}
