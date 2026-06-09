'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/use-auth'

type ErrorLog = {
  id: string
  userId: string | null
  action: string
  error: string
  stack: string | null
  createdAt: string
}

export default function AdminErrorsPage() {
  const router = useRouter()
  const { user, isLoading } = useAuth()
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [fetching, setFetching] = useState(false)
  const [selected, setSelected] = useState<ErrorLog | null>(null)

  async function fetchLogs() {
    setFetching(true)
    try {
      const res = await fetch('/api/admin/errors')
      const json = await res.json()
      setLogs(json.data ?? [])
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (isLoading) return
    if (!user) {
      router.replace('/auth/signin')
      return
    }
    if (!user.isAdmin) {
      router.replace('/dashboard')
      return
    }
    void fetchLogs()
  }, [isLoading, user, router])

  if (isLoading || !user) return null

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950">Error Logs</h1>
          <p className="mt-1 text-sm text-gray-500">Recent application errors captured in the local ErrorLog table.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={fetching} className="gap-1.5">
          {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {fetching && logs.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading error logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-gray-500">
            <AlertTriangle className="h-4 w-4 text-gray-400" />
            No errors recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">User ID</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelected(log)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {log.userId ?? <span className="text-gray-400">None</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{log.action}</td>
                    <td className="max-w-md truncate px-4 py-3 text-critical">{log.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.action}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-1 font-medium text-gray-500">Error</p>
              <p className="text-critical">{selected?.error}</p>
            </div>
            {selected?.stack ? (
              <div>
                <p className="mb-1 font-medium text-gray-500">Stack</p>
                <pre className="max-h-96 overflow-auto rounded-md bg-gray-950 p-3 text-xs leading-relaxed text-gray-100">
                  {selected.stack}
                </pre>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
