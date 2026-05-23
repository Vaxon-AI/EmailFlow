'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { ScorePicker } from '@/components/score-picker'
import { useDemoStore } from '@/lib/demo/store'

export function DemoCreateTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { projects, identities, createTask } = useDemoStore()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [identityId, setIdentityId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [urgency, setUrgency] = useState(3)
  const [impact, setImpact] = useState(3)
  const [startDate, setStartDate] = useState('')
  const [deadline, setDeadline] = useState('')
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [subtasks, setSubtasks] = useState<string[]>([])

  // Identity → project filter. Picking an identity narrows the project
  // select; leaving identity blank shows all projects grouped by identity.
  const visibleProjects = useMemo(
    () => (identityId ? projects.filter((p) => p.identityId === identityId) : projects),
    [identityId, projects],
  )

  if (!open) return null

  const reset = () => {
    setTitle('')
    setSummary('')
    setIdentityId('')
    setProjectId('')
    setUrgency(3)
    setImpact(3)
    setStartDate('')
    setDeadline('')
    setSubtaskDraft('')
    setSubtasks([])
  }

  const addSubtask = () => {
    const trimmed = subtaskDraft.trim()
    if (!trimmed) return
    setSubtasks((prev) => [...prev, trimmed])
    setSubtaskDraft('')
  }

  const removeSubtask = (index: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = () => {
    if (!title.trim()) {
      toast.error('Give the task a title first')
      return
    }
    const deadlineIso = deadline ? new Date(`${deadline}T17:00:00`).toISOString() : null
    const startIso = startDate ? new Date(`${startDate}T09:00:00`).toISOString() : null
    createTask({
      title: title.trim(),
      summary: summary.trim(),
      actionItems: subtasks,
      urgency,
      impact,
      projectId: projectId || null,
      startDate: startIso,
      deadline: deadlineIso,
    })
    toast.success('Task created')
    reset()
    onClose()
  }

  // Clear project if it no longer matches the selected identity.
  const handleIdentityChange = (id: string) => {
    setIdentityId(id)
    if (id && projectId) {
      const stillValid = projects.some((p) => p.id === projectId && p.identityId === id)
      if (!stillValid) setProjectId('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">New task</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="text-xs font-medium text-gray-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="What needs doing?"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Summary</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Optional context"
              className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Identity</label>
              <select
                value={identityId}
                onChange={(e) => handleIdentityChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
              >
                <option value="">Any identity</option>
                {identities.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
              >
                <option value="">No project</option>
                {identityId
                  ? visibleProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                  : identities.map((identity) => (
                      <optgroup key={identity.id} label={identity.name}>
                        {projects
                          .filter((p) => p.identityId === identity.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ScorePicker label="Urgency" value={urgency} onChange={setUrgency} />
            <ScorePicker label="Impact" value={impact} onChange={setImpact} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Subtasks</label>
            <div className="mt-1 space-y-1.5">
              {subtasks.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-1.5 text-sm text-gray-700"
                >
                  <span className="flex-1 truncate">{item}</span>
                  <button
                    type="button"
                    onClick={() => removeSubtask(index)}
                    aria-label={`Remove subtask ${index + 1}`}
                    className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  value={subtaskDraft}
                  onChange={(e) => setSubtaskDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSubtask()
                    }
                  }}
                  placeholder="Add a subtask…"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={addSubtask}
                  disabled={!subtaskDraft.trim()}
                  aria-label="Add subtask"
                  className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Create task
          </button>
        </div>
      </div>
    </div>
  )
}
