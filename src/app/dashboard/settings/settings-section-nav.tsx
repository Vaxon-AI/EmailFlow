'use client'

import { Mail, Shield, User, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SettingsSection = 'account' | 'email' | 'privacy'

type SettingsSectionItem = {
  id: SettingsSection
  label: string
  icon: LucideIcon
}

const SETTINGS_SECTIONS: SettingsSectionItem[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'privacy', label: 'Security & Privacy', icon: Shield },
]

type SettingsSectionNavProps = {
  activeSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}

export function SettingsSectionNav({ activeSection, onSectionChange }: SettingsSectionNavProps) {
  return (
    <>
      <aside className="absolute left-0 top-0 hidden h-full w-44 lg:block">
        <div className="sticky top-6">
          <nav>
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Settings
            </p>
            <div className="space-y-0.5">
              {SETTINGS_SECTIONS.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => onSectionChange(section.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-gray-100 font-medium text-gray-900'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-gray-700' : 'text-gray-400')} />
                    {section.label}
                  </button>
                )
              })}
            </div>
          </nav>
        </div>
      </aside>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = section.icon
          const isActive = activeSection === section.id
          return (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                isActive
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {section.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
