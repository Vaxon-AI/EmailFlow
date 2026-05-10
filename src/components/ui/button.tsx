"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:border-brand-300 focus-visible:ring-brand-200/80",
        outline:
          "border-border bg-background hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 aria-expanded:border-brand-300 aria-expanded:bg-brand-50 aria-expanded:text-brand-700 dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-brand-100/80 text-brand-700 hover:bg-brand-100 aria-expanded:bg-brand-100 aria-expanded:text-brand-700",
        brandSoft:
          "border-brand-200 bg-brand-50/80 text-brand-700 shadow-sm hover:-translate-y-px hover:border-brand-300 hover:bg-brand-100/80 hover:text-brand-700 hover:shadow-md focus-visible:border-brand-300 focus-visible:ring-brand-200/80 aria-expanded:border-brand-300 aria-expanded:bg-brand-100/80 aria-expanded:text-brand-700",
        utility:
          "border-slate-200 bg-white text-slate-600 shadow-sm hover:-translate-y-px hover:border-brand-200 hover:bg-brand-50/70 hover:text-brand-700 hover:shadow-md focus-visible:border-brand-300 focus-visible:ring-brand-200/70 aria-expanded:border-brand-300 aria-expanded:bg-brand-50 aria-expanded:text-brand-700",
        success:
          "border-success/20 bg-success/10 text-success shadow-sm hover:-translate-y-px hover:border-success/30 hover:bg-success/15 hover:shadow-md focus-visible:border-success/40 focus-visible:ring-success/20 aria-expanded:border-success/30 aria-expanded:bg-success/15",
        warning:
          "border-warning-200 bg-yellow-50/80 text-warning-700 shadow-sm hover:-translate-y-px hover:border-warning-200 hover:bg-warning-100/70 hover:text-warning-700 hover:shadow-md focus-visible:border-warning-200 focus-visible:ring-warning/20 aria-expanded:border-warning-200 aria-expanded:bg-warning-100/70 aria-expanded:text-warning-700",
        ghost:
          "hover:bg-brand-50 hover:text-brand-700 aria-expanded:bg-brand-50 aria-expanded:text-brand-700 dark:hover:bg-muted/50",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive shadow-sm hover:-translate-y-px hover:border-destructive/30 hover:bg-destructive/20 hover:shadow-md focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
