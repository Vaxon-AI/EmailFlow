'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MonthYearPanel } from '@/components/month-year-panel'
import { getPriorityBand } from '@/types'
import { useDemoStore } from '@/lib/demo/store'
import { effectiveDeadline, type DemoTask } from '@/lib/demo/types'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function DemoCalendar({ tasks }: { tasks: DemoTask[] }) {
  const { updateTaskDates } = useDemoStore()
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = currentMonth.getDay()
  const daysInPrevMonth = new Date(year, month, 0).getDate()
  const todayStr = new Date().toDateString()

  const tasksByDate = useMemo(() => {
    const map: Record<string, DemoTask[]> = {}
    for (const task of tasks) {
      const raw = effectiveDeadline(task)
      if (!raw) continue
      const d = new Date(raw)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      ;(map[key] ??= []).push(task)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const ac = a.status === 'completed'
        const bc = b.status === 'completed'
        if (ac !== bc) return ac ? 1 : -1
        return b.priorityScore - a.priorityScore
      })
    }
    return map
  }, [tasks])

  const handleDrop = useCallback(
    (dayDate: Date) => (e: React.DragEvent) => {
      e.preventDefault()
      const taskId = e.dataTransfer.getData('text/plain')
      if (!taskId) return
      const deadline = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 17, 0)
      updateTaskDates(taskId, { userSetDeadline: deadline.toISOString() })
      toast.success('Deadline updated')
    },
    [updateTaskDates],
  )

  type Cell = { day: number; date: Date; isCurrentMonth: boolean }
  const cells: Cell[] = []
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    cells.push({ day, date: new Date(year, month - 1, day), isCurrentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: new Date(year, month, d), isCurrentMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const day = cells.length - firstDayOfWeek - daysInMonth + 1
    cells.push({ day, date: new Date(year, month + 1, day), isCurrentMonth: false })
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white p-0 shadow-sm">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger className="rounded-lg px-3 py-1.5 text-lg font-semibold text-gray-900 transition-colors hover:bg-brand-50 hover:text-brand-700">
              {currentMonth.toLocaleDateString('en', { month: 'long', year: 'numeric' })}
            </PopoverTrigger>
            <PopoverContent align="center" className="w-auto border-0 bg-transparent p-0 shadow-none">
              <MonthYearPanel
                value={currentMonth}
                onChange={(date) => {
                  setCurrentMonth(date)
                  setPickerOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 py-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-slate-600">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`
            const dayTasks = tasksByDate[key] || []
            const isToday = cell.date.toDateString() === todayStr
            return (
              <div
                key={idx}
                className={cn(
                  'min-h-[100px] border-b border-r border-slate-200/80 p-1.5 transition-colors',
                  !cell.isCurrentMonth
                    ? 'bg-slate-50/90'
                    : isToday
                      ? 'bg-brand-50/80 ring-1 ring-inset ring-brand-200'
                      : 'bg-white hover:bg-brand-50/60',
                )}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={handleDrop(cell.date)}
              >
                <div
                  className={cn(
                    'mb-1 text-right text-xs',
                    !cell.isCurrentMonth
                      ? 'text-slate-400'
                      : isToday
                        ? 'font-bold text-brand-700'
                        : 'text-slate-600',
                  )}
                >
                  {cell.day}
                </div>
                <div className="space-y-1">
                  {dayTasks.map((task) => {
                    const band = getPriorityBand(task.priorityScore)
                    const bg =
                      band === 'critical'
                        ? 'bg-critical border-critical-700/20'
                        : band === 'high'
                          ? 'bg-orange border-orange-700/20'
                          : band === 'medium'
                            ? 'bg-yellow border-yellow-700/20'
                            : 'bg-slate-500 border-slate-600/20'
                    return (
                      <Link
                        key={task.id}
                        href={`/demo/tasks/${task.id}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', task.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        className={cn(
                          'block cursor-grab truncate rounded-md border px-1.5 py-1 text-[10px] font-semibold leading-tight text-white shadow-sm transition-[filter,box-shadow,transform] hover:-translate-y-px hover:brightness-95 hover:shadow-md active:cursor-grabbing',
                          bg,
                          task.status === 'completed' && 'opacity-50 line-through saturate-[0.75]',
                          !cell.isCurrentMonth && 'opacity-50',
                        )}
                        title={`${task.title} — drag to reschedule`}
                      >
                        {task.title}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <p className="border-t border-slate-100 px-4 py-2.5 text-[10px] text-gray-400">
          Drag tasks between dates to reschedule. Click a task to open its details.
        </p>
      </CardContent>
    </Card>
  )
}
