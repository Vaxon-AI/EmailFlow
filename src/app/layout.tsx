import type { Metadata } from 'next'
import './globals.css'
import { QueryProviders } from '@/components/providers'
import { Toaster } from '@/components/ui/sonner'
import { RootTransition } from '@/components/root-transition'

export const metadata: Metadata = {
  title: 'EmailFlow AI',
  description: 'AI-Powered Email-to-Task Orchestration',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full bg-gray-50 antialiased">
        <QueryProviders>
          <RootTransition>{children}</RootTransition>
          <Toaster />
        </QueryProviders>
      </body>
    </html>
  )
}
