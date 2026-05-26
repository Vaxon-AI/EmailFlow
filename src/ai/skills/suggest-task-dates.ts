import { generateObject } from 'ai'
import { withFallback } from '../utils/with-fallback'
import { taskDateSuggestionSchema, type TaskDateSuggestionResult } from '../schemas'

// ============================================================
// Skill: Task Date Suggestion
// Given a task title/summary, today, and recent same-project tasks,
// propose a startDate and dueDate. Returns null/null when there is
// no signal — never invent dates.
// ============================================================

const SYSTEM_PROMPT = `You are an assistant that suggests sensible startDate and dueDate for a new task.

Rules:
- Output dates in YYYY-MM-DD format, or null when there is no signal.
- Never fabricate a deadline. If neither the task wording nor the recent project tasks give a clear signal, return { startDate: null, dueDate: null }.
- Honor explicit time words in the title or summary first ("by Friday", "before next Monday", "this week").
- If the title is a routine action with no time signal but recent same-project tasks have consistent durations (e.g. all completed within ~7 days of creation), propose dueDate = today + that median.
- startDate defaults to today unless the wording clearly says otherwise ("starting next week", "after the launch").
- Prefer null over an arbitrary guess. A confident null is better than a wrong date.
- reasoning: one short sentence explaining the choice. Keep it under 120 chars. Null when both dates are null.
- Today's date is provided; treat all relative phrasing as relative to it.`

export interface SuggestTaskDatesInput {
  title: string
  summary?: string
  today: string
  recentTasks: {
    title: string
    startDate: string | null
    dueDate: string | null
  }[]
  projectName?: string
}

export async function suggestTaskDates(input: SuggestTaskDatesInput): Promise<TaskDateSuggestionResult> {
  const recentTasksBlock = input.recentTasks.length > 0
    ? input.recentTasks
        .slice(0, 10)
        .map((t) => `- "${t.title}" (start: ${t.startDate ?? '—'}, due: ${t.dueDate ?? '—'})`)
        .join('\n')
    : '(no recent tasks in this project)'

  const prompt = `Today: ${input.today}
${input.projectName ? `Project: ${input.projectName}\n` : ''}New task title: ${input.title}
${input.summary ? `Summary: ${input.summary}\n` : ''}
Recent tasks in the same project (with their dates if any):
${recentTasksBlock}

Suggest startDate and dueDate.`

  return withFallback('Task date suggestion', 'fast', async (model) => {
    const { object } = await generateObject({
      model,
      schema: taskDateSuggestionSchema,
      system: SYSTEM_PROMPT,
      prompt,
    })
    return object
  })
}
