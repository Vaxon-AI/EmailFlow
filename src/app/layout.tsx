import type { Metadata, Viewport } from 'next'
import { GoogleAnalytics } from '@next/third-parties/google'
import './globals.css'
import { QueryProviders } from '@/components/providers'
import { Toaster } from '@/components/ui/sonner'
import { RootTransition } from '@/components/root-transition'

export const metadata: Metadata = {
  title: 'EmailFlow AI',
  description: 'AI-Powered Email-to-Task Orchestration',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
      {process.env.NODE_ENV === 'production' && (
        <GoogleAnalytics gaId="G-KJ5KQP6DCQ" />
      )}
    </html>
  )
}
