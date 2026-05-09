'use client'

import { useState, useEffect, useRef } from 'react'
import { Pencil } from 'lucide-react'

type Props = {
  name: string
  className?: string
  onSave: (newName: string) => Promise<void>
}

export function InlineEditableName({ name, className, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setValue(name)
  }, [name, editing])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = async () => {
    const trimmed = value.trim()
    if (!trimmed || trimmed === name) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.stopPropagation(); setValue(name); setEditing(false) }
        }}
        onClick={(e) => e.stopPropagation()}
        className={`min-w-0 rounded bg-white px-1 py-0.5 outline-none ring-1 ring-brand-500 ${className ?? ''}`}
        style={{ width: `${Math.max(value.length, 4)}ch` }}
      />
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`${className ?? ''} cursor-default`}
        title="Double-click to rename"
        onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      >
        {name}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="opacity-0 transition-opacity group-hover:opacity-100"
        title="Rename"
      >
        <Pencil className="h-2.5 w-2.5 text-slate-400 hover:text-slate-600" />
      </button>
    </span>
  )
}
