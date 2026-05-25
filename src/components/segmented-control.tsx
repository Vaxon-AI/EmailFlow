import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SegmentedOption<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
  badge?: ReactNode
  /**
   * Content shown only when this option is active. The slot animates from
   * width 0 → auto, so the active tab visibly grows to reveal the trailing
   * element (e.g. a kebab menu). Clicks inside `trailing` are stopPropagated
   * so they don't toggle the segment.
   */
  trailing?: ReactNode
}

type SegmentedControlProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  className?: string
  disabled?: boolean
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  disabled,
}: SegmentedControlProps<T>) {
  // Fallback so we never render with zero highlighted tabs if `value` falls out
  // of `options` (e.g. a count-driven tab disappears while it was active).
  const hasMatch = options.some((o) => o.value === value)
  const effectiveValue = hasMatch ? value : options[0]?.value

  return (
    <div className={cn("inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm transition-colors duration-200", className)}>
      {options.map((option) => {
        const active = option.value === effectiveValue
        const hasTrailing = !!option.trailing
        const showTrailing = active && hasTrailing

        // Use <div role="button"> instead of <button> when there's trailing
        // content, since trailing usually contains its own <button> (e.g. a
        // dropdown trigger) and HTML disallows nested buttons.
        const Wrapper = hasTrailing ? "div" : "button"
        const handleSelect = () => {
          if (disabled) return
          onChange(option.value)
        }
        const wrapperProps = hasTrailing
          ? {
              role: "button" as const,
              tabIndex: disabled ? -1 : 0,
              "aria-disabled": disabled || undefined,
              onClick: handleSelect,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (disabled) return
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  handleSelect()
                }
              },
            }
          : { type: "button" as const, onClick: handleSelect, disabled }

        return (
          <Wrapper
            key={option.value}
            {...wrapperProps}
            className={cn(
              "group/segment inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-[background-color,color,padding-right,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200",
              active
                ? "translate-y-0 bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                : "text-gray-500 hover:bg-brand-50 hover:text-brand-700",
              showTrailing && "pr-1.5",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            {option.icon}
            <span>{option.label}</span>
            {option.badge}
            {hasTrailing && (
              <span
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "flex items-center overflow-hidden transition-[max-width,opacity,margin-left] duration-200 ease-out",
                  showTrailing
                    ? "ml-1 max-w-6 opacity-100"
                    : "ml-0 max-w-0 opacity-0"
                )}
                aria-hidden={!showTrailing}
              >
                {option.trailing}
              </span>
            )}
          </Wrapper>
        )
      })}
    </div>
  )
}
