'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MonthYearPanel } from '@/components/month-year-panel'
import { getPriorityBand } from '@/types'
import { toast } from 'sonner'
import type { MutationLike, TaskItem } from './task-page-types'

export function TaskCalendarView({ tasks, updateTask }: { tasks: TaskItem[]; updateTask: MutationLike }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = currentMonth.getDay()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1))
  const todayStr = new Date().toDateString()

  const tasksByDate = useMemo(() => {
    const map: Record<string, TaskItem[]> = {}
    for (const task of tasks) {
      const raw = task.userSetDeadline || task.explicitDeadline || task.inferredDeadline
      if (!raw) continue
      const date = new Date(raw)
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      if (!map[key]) map[key] = []
      map[key].push(task)
    }

    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        const aCompleted = a.status === 'completed'
        const bCompleted = b.status === 'completed'
        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1
        return (b.priorityScore ?? 0) - (a.priorityScore ?? 0)
      })
    }

    return map
  }, [tasks])

  const handleDrop = useCallback((dayDate: Date) => {
    return (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const taskId = e.dataTransfer.getData('text/plain')
      if (!taskId) return

      const year = dayDate.getFullYear()
      const month = String(dayDate.getMonth() + 1).padStart(2, '0')
      const day = String(dayDate.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      const task = tasks.find((item) => item.id === taskId)
      const shouldAdjustStart = task?.startDate && new Date(task.startDate) > dayDate

      updateTask.mutate(
        { id: taskId, data: { userSetDeadline: dateStr, ...(shouldAdjustStart ? { startDate: dateStr } : {}) } },
        { onSuccess: () => toast.success('Deadline updated') }
      )
    }
  }, [tasks, updateTask])

  type CellData = { day: number; date: Date; isCurrentMonth: boolean }
  const cells: CellData[] = []

  for (let index = firstDayOfWeek - 1; index >= 0; index--) {
    const day = daysInPrevMonth - index
    cells.push({ day, date: new Date(year, month - 1, day), isCurrentMonth: false })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, date: new Date(year, month, day), isCurrentMonth: true })
  }

  while (cells.length % 7 !== 0) {
    const day = cells.length - firstDayOfWeek - daysInMonth + 1
    cells.push({ day, date: new Date(year, month + 1, day), isCurrentMonth: false })
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white shadow-sm">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={prevMonth}>
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
          <Button variant="ghost" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 py-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
            <div key={label} className="text-center text-xs font-semibold text-slate-600">{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell, index) => {
            const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`
            const dayTasks = tasksByDate[key] || []
            const isToday = cell.date.toDateString() === todayStr

            return (
              <div
                key={index}
                className={`min-h-[100px] border-b border-r border-slate-200/80 p-1.5 transition-colors ${
                  !cell.isCurrentMonth ? 'bg-slate-50/90' :
                  isToday ? 'bg-brand-50/80 ring-1 ring-inset ring-brand-200' : 'bg-white hover:bg-brand-50/60'
                }`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={handleDrop(cell.date)}
              >
                <div className={`mb-1 text-right text-xs ${
                  !cell.isCurrentMonth ? 'text-slate-400' :
                  isToday ? 'font-bold text-brand-700' : 'text-slate-600'
                }`}
                >
                  {cell.day}
                </div>
                <div className="space-y-1">
                  {dayTasks.map((task) => {
                    const band = getPriorityBand(task.priorityScore || 0)
                    const isCompleted = task.status === 'completed'
                    const bgColor = band === 'critical' ? 'bg-critical border-critical-700/20 text-white'
                      : band === 'high' ? 'bg-orange border-orange-700/20 text-white'
                      : band === 'medium' ? 'bg-yellow border-yellow-700/20 text-white'
                      : 'bg-slate-500 border-slate-600/20 text-white'

                    return (
                      <Link
                        key={task.id}
                        href={`/dashboard/tasks/${task.id}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', task.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        className={`block cursor-grab truncate rounded-md border px-1.5 py-1 text-[10px] font-semibold leading-tight shadow-sm transition-[filter,box-shadow,transform] hover:-translate-y-px hover:brightness-95 hover:shadow-md active:cursor-grabbing ${bgColor} ${
                          isCompleted ? 'opacity-50 line-through saturate-[0.75]' : ''
                        } ${
                          !cell.isCurrentMonth ? 'opacity-50' : ''
                        }`}
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
          Drag tasks between dates to reschedule. Click a task to open details.
        </p>
      </CardContent>
    </Card>
  )
}
