'use client'

// ============================================================
// Demo store — the entire demo runs on this in-memory React context.
//
// HARD RULE: nothing in here (or anywhere under the demo) makes a network
// request, calls /api/*, or imports an AI SDK. The "AI" actions below just
// reveal pre-written content from content.ts after a short fake delay.
//
// State is seeded once on mount. Leaving the demo or reloading remounts the
// provider → fresh seed → the demo resets to its initial state.
// ============================================================

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { DEMO_EMAILS } from './content'
import { buildDigestContent, computeDigestStats, seedDemoData } from './seed'
import type {
  ChartHistoryPoint,
  DemoData,
  DemoDigest,
  DemoEmail,
  DemoEmailCategory,
  DemoIdentity,
  DemoMatter,
  DemoProject,
  DemoTask,
  DemoTaskStatus,
} from './types'

const EMAIL_TEMPLATES = new Map(DEMO_EMAILS.map((e) => [e.id, e]))

const DAY_MS = 86_400_000

/** Module-level id sequence — demo ids only need to be unique within a session. */
let idSeq = 0
function makeId(prefix: string): string {
  idSeq += 1
  return `${prefix}-new-${idSeq}`
}

/** Fake "AI is working" delay, in ms. */
function thinkDelay() {
  return 900 + Math.floor(Math.random() * 700)
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ---------- timeline shape (consumed by GanttTimeline) ----------

export interface TimelineTask {
  id: string
  title: string
  status: DemoTaskStatus
  priorityScore?: number | null
  startDate?: string | null
  explicitDeadline?: string | null
  inferredDeadline?: string | null
  userSetDeadline?: string | null
  project?: { id: string; name: string; identity: { id: string; name: string } | null } | null
  matter?: { id: string; title: string } | null
}

export interface CreateTaskInput {
  title: string
  summary?: string
  actionItems?: string[]
  urgency: number
  impact: number
  projectId?: string | null
  matterId?: string | null
  startDate?: string | null
  deadline?: string | null
}

// ---------- store contract ----------

export interface DemoStore {
  identities: DemoIdentity[]
  projects: DemoProject[]
  matters: DemoMatter[]
  emails: DemoEmail[]
  tasks: DemoTask[]
  digests: DemoDigest[]
  /** Per-day synthetic counts that ONLY feed the dashboard momentum chart. */
  chartHistory: ChartHistoryPoint[]
  /** The demo's "now" — fixed at seed time so render stays pure. */
  now: Date

  // lookups
  getEmail: (id: string) => DemoEmail | undefined
  getTask: (id: string) => DemoTask | undefined
  getProject: (id: string | null | undefined) => DemoProject | undefined
  getIdentity: (id: string | null | undefined) => DemoIdentity | undefined
  getMatter: (id: string | null | undefined) => DemoMatter | undefined
  emailsForTask: (taskId: string) => { email: DemoEmail; relationship: 'primary' | 'follow_up' }[]
  tasksForEmail: (emailId: string) => DemoTask[]
  toTimelineTasks: (tasks: DemoTask[]) => TimelineTask[]

  // task actions
  setTaskStatus: (id: string, status: DemoTaskStatus) => void
  updateTask: (id: string, patch: Partial<DemoTask>) => void
  updateTaskDates: (id: string, dates: { startDate?: string; userSetDeadline?: string }) => void
  toggleActionItem: (taskId: string, index: number) => void
  createTask: (input: CreateTaskInput) => DemoTask
  /** Hard-delete from the in-memory array — mirrors real `taskRepo.deleteManyTasks`. */
  deleteTask: (id: string) => void

  // email actions
  classifyEmail: (emailId: string, category: DemoEmailCategory) => void
  setEmailActioned: (emailId: string, value: boolean) => void
  reassignEmailProject: (emailId: string, projectId: string | null) => void
  updateEmail: (emailId: string, patch: Partial<DemoEmail>) => void

  // simulated "AI" actions — pre-written content, no API
  simulateReclassify: (emailId: string) => Promise<DemoEmailCategory>
  simulateExtractTask: (emailId: string) => Promise<DemoTask>
  simulateReplyDraft: (emailId: string) => Promise<string>
  simulateGenerateDigest: (period: 'daily' | 'weekly') => Promise<void>

  reset: () => void
}

const DemoContext = createContext<DemoStore | null>(null)

export function useDemoStore(): DemoStore {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('useDemoStore must be used inside <DemoProvider>')
  return ctx
}

// ---------- provider ----------

export function DemoProvider({ children }: { children: ReactNode }) {
  // Seed on the client only (after mount) so server/client dates never
  // disagree (the seed uses Date.now() + Math.random()), and so every fresh
  // mount re-seeds = "reset to initial". This is a deliberate one-shot
  // client-only initialisation, not derived state.
  const [data, setData] = useState<DemoData | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client-only seed
    setData(seedDemoData(new Date()))
  }, [])

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
          <p className="text-sm text-gray-500">Loading demo workspace…</p>
        </div>
      </div>
    )
  }

  return (
    <DemoStoreInner data={data} setData={setData}>
      {children}
    </DemoStoreInner>
  )
}

function DemoStoreInner({
  data,
  setData,
  children,
}: {
  data: DemoData
  setData: Dispatch<SetStateAction<DemoData | null>>
  children: ReactNode
}) {
  const store = useMemo<DemoStore>(() => {
    const identityById = new Map(data.identities.map((i) => [i.id, i]))
    const projectById = new Map(data.projects.map((p) => [p.id, p]))
    const matterById = new Map(data.matters.map((m) => [m.id, m]))
    const emailById = new Map(data.emails.map((e) => [e.id, e]))
    const taskById = new Map(data.tasks.map((t) => [t.id, t]))

    const patchTask = (id: string, patch: Partial<DemoTask>) =>
      setData((d) =>
        d ? { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) } : d,
      )
    const patchEmail = (id: string, patch: Partial<DemoEmail>) =>
      setData((d) =>
        d ? { ...d, emails: d.emails.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : d,
      )

    const createTask = (input: CreateTaskInput): DemoTask => {
      const id = makeId('tk')
      const now = new Date()
      const deadline = input.deadline ?? new Date(now.getTime() + 3 * DAY_MS).toISOString()
      const task: DemoTask = {
        id,
        title: input.title,
        summary: input.summary ?? '',
        actionItems: input.actionItems ?? [],
        checkedActionItems: [],
        status: 'active',
        urgency: input.urgency,
        impact: input.impact,
        priorityScore: input.urgency * input.impact,
        priorityReason: 'Created in the demo workspace.',
        startDate: input.startDate ?? now.toISOString(),
        explicitDeadline: null,
        inferredDeadline: null,
        userSetDeadline: deadline,
        isUserEdited: true,
        userNotes: null,
        createdAt: now.toISOString(),
        completedAt: null,
        source: 'manual',
        projectId: input.projectId ?? null,
        matterId: input.matterId ?? null,
      }
      setData((d) => (d ? { ...d, tasks: [task, ...d.tasks] } : d))
      return task
    }

    const simulateExtractTask = async (emailId: string): Promise<DemoTask> => {
      await wait(thinkDelay())
      const email = emailById.get(emailId)
      const spec = EMAIL_TEMPLATES.get(emailId)?.extractTask
      const now = new Date()
      const id = makeId('tk')
      const deadlineDays = spec?.deadlineOffset ?? 3
      const task: DemoTask = {
        id,
        title: spec?.title ?? `Follow up: ${email?.subject ?? 'email'}`,
        summary: spec?.summary ?? email?.bodyPreview ?? '',
        actionItems: spec?.actionItems ?? ['Review the email', 'Decide on next steps'],
        checkedActionItems: [],
        status: 'ai_suggestion',
        urgency: spec?.urgency ?? 3,
        impact: spec?.impact ?? 3,
        priorityScore: (spec?.urgency ?? 3) * (spec?.impact ?? 3),
        priorityReason: spec?.priorityReason ?? 'Extracted from an email thread.',
        startDate: now.toISOString(),
        explicitDeadline: null,
        inferredDeadline: new Date(now.getTime() + deadlineDays * DAY_MS).toISOString(),
        userSetDeadline: null,
        isUserEdited: false,
        userNotes: null,
        createdAt: now.toISOString(),
        completedAt: null,
        source: 'email',
        projectId: spec?.projectId ?? email?.projectId ?? null,
        matterId: spec?.matterId ?? email?.matterId ?? null,
      }
      setData((d) =>
        d
          ? {
              ...d,
              tasks: [task, ...d.tasks],
              links: [...d.links, { taskId: id, emailId, relationship: 'primary' as const }],
              emails: d.emails.map((e) =>
                e.id === emailId ? { ...e, awaitingReview: false, actioned: true } : e,
              ),
            }
          : d,
      )
      return task
    }

    const simulateReplyDraft = async (emailId: string): Promise<string> => {
      await wait(thinkDelay())
      const tpl = EMAIL_TEMPLATES.get(emailId)
      const draft =
        tpl?.replyDraft ??
        'Hi,\n\nThanks for your email — I have received it and will follow up shortly.\n\nBest,\nYou'
      patchEmail(emailId, { aiReplyDraft: draft, aiReplyGeneratedAt: new Date().toISOString() })
      return draft
    }

    const simulateReclassify = async (emailId: string): Promise<DemoEmailCategory> => {
      await wait(thinkDelay())
      const tpl = EMAIL_TEMPLATES.get(emailId)
      // The "AI" lands on the email's authored category (or 'awareness').
      let category: DemoEmailCategory = 'awareness'
      if (tpl?.extractTask) category = 'action'
      else if (tpl?.classification && tpl.classification !== 'uncertain') category = tpl.classification
      patchEmail(emailId, {
        classification: category,
        awaitingReview: false,
        classConfidence: 0.92,
        classReasoning: 'Re-classified with full thread context.',
      })
      return category
    }

    const simulateGenerateDigest = async (period: 'daily' | 'weekly'): Promise<void> => {
      await wait(thinkDelay())
      setData((d) => {
        if (!d) return d
        const now = new Date()
        const current = d.digests.find((x) => x.isCurrent && x.period === period)
        const start = new Date(current?.periodStart ?? now)
        const end = new Date(current?.periodEnd ?? now)
        const stats = computeDigestStats(d.emails, d.tasks, start, end)
        return {
          ...d,
          digests: d.digests.map((dg) =>
            dg.isCurrent && dg.period === period
              ? {
                  ...dg,
                  stats,
                  content: buildDigestContent(period, stats, d.tasks, now),
                  createdAt: now.toISOString(),
                }
              : dg,
          ),
        }
      })
    }

    return {
      identities: data.identities,
      projects: data.projects,
      matters: data.matters,
      emails: data.emails,
      tasks: data.tasks,
      digests: data.digests,
      chartHistory: data.chartHistory,
      now: new Date(data.seededAt),

      getEmail: (id) => emailById.get(id),
      getTask: (id) => taskById.get(id),
      getProject: (id) => (id ? projectById.get(id) : undefined),
      getIdentity: (id) => (id ? identityById.get(id) : undefined),
      getMatter: (id) => (id ? matterById.get(id) : undefined),

      emailsForTask: (taskId) =>
        data.links
          .filter((l) => l.taskId === taskId)
          .map((l) => ({ email: emailById.get(l.emailId), relationship: l.relationship }))
          .filter((x): x is { email: DemoEmail; relationship: 'primary' | 'follow_up' } => !!x.email),

      tasksForEmail: (emailId) =>
        data.links
          .filter((l) => l.emailId === emailId)
          .map((l) => taskById.get(l.taskId))
          .filter((t): t is DemoTask => !!t),

      toTimelineTasks: (tasks) =>
        tasks.map((t) => {
          const project = t.projectId ? projectById.get(t.projectId) : undefined
          const identity = project?.identityId ? identityById.get(project.identityId) : undefined
          const matter = t.matterId ? matterById.get(t.matterId) : undefined
          return {
            id: t.id,
            title: t.title,
            status: t.status,
            priorityScore: t.priorityScore,
            startDate: t.startDate,
            explicitDeadline: t.explicitDeadline,
            inferredDeadline: t.inferredDeadline,
            userSetDeadline: t.userSetDeadline,
            project: project
              ? {
                  id: project.id,
                  name: project.name,
                  identity: identity ? { id: identity.id, name: identity.name } : null,
                }
              : null,
            matter: matter ? { id: matter.id, title: matter.title } : null,
          }
        }),

      setTaskStatus: (id, status) =>
        patchTask(id, {
          status,
          completedAt: status === 'completed' ? new Date().toISOString() : null,
        }),
      updateTask: patchTask,
      updateTaskDates: (id, dates) =>
        patchTask(id, {
          ...(dates.startDate ? { startDate: dates.startDate } : {}),
          ...(dates.userSetDeadline
            ? { userSetDeadline: dates.userSetDeadline, isUserEdited: true }
            : {}),
        }),
      toggleActionItem: (taskId, index) => {
        const task = taskById.get(taskId)
        if (!task) return
        const checked = task.checkedActionItems.includes(index)
          ? task.checkedActionItems.filter((i) => i !== index)
          : [...task.checkedActionItems, index]
        patchTask(taskId, { checkedActionItems: checked })
      },
      createTask,
      deleteTask: (id) =>
        setData((d) =>
          d
            ? {
                ...d,
                tasks: d.tasks.filter((t) => t.id !== id),
                links: d.links.filter((l) => l.taskId !== id),
              }
            : d,
        ),

      classifyEmail: (emailId, category) =>
        patchEmail(emailId, { classification: category, awaitingReview: false }),
      setEmailActioned: (emailId, value) => patchEmail(emailId, { actioned: value }),
      reassignEmailProject: (emailId, projectId) => patchEmail(emailId, { projectId }),
      updateEmail: (emailId, patch) => patchEmail(emailId, patch),

      simulateReclassify,
      simulateExtractTask,
      simulateReplyDraft,
      simulateGenerateDigest,

      reset: () => setData(seedDemoData(new Date())),
    }
  }, [data, setData])

  return <DemoContext.Provider value={store}>{children}</DemoContext.Provider>
}
