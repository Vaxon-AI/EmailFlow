'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface TourStep {
  target: string // CSS selector
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'inside-top'
}

interface GuidedTourProps {
  steps: TourStep[]
  open: boolean
  onClose: () => void
  onComplete: () => void
}

export function GuidedTour({ steps, open, onClose, onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)
  const resizeRef = useRef<number | null>(null)

  const updateRect = useCallback(() => {
    const step = steps[currentStep]
    if (!step) return
    const el = document.querySelector(step.target)
    if (el) {
      const rect = el.getBoundingClientRect()
      setTargetRect(rect)
      
      // Basic visibility check and scroll
      const isVisible = (
        rect.top >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight)
      )

      if (!isVisible) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else {
      setTargetRect(null)
    }
  }, [currentStep, steps])

  useEffect(() => {
    setTimeout(() => setMounted(true), 0)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => updateRect(), 0)
      
      // Delay second update to catch any layout shifts after scroll
      const timer = setTimeout(updateRect, 500)

      const handleResize = () => {
        if (resizeRef.current) cancelAnimationFrame(resizeRef.current)
        resizeRef.current = requestAnimationFrame(updateRect)
      }
      window.addEventListener('resize', handleResize)
      window.addEventListener('scroll', handleResize, true)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('scroll', handleResize, true)
      }
    }
  }, [open, updateRect])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      onComplete()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1)
    }
  }

  const handleSkip = () => {
    onClose()
  }

  const step = steps[currentStep]

  const tooltipPosition = useMemo(() => {
    if (!targetRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

    const placement = step?.placement || 'bottom'
    const gap = 12

    switch (placement) {
      case 'inside-top':
        return {
          top: Math.max(gap + 20, targetRect.top + gap + 40),
          left: targetRect.left + targetRect.width / 2,
          transform: 'translateX(-50%)',
        }
      case 'top':
        return {
          top: targetRect.top - gap,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translate(-50%, -100%)',
        }
      case 'bottom':
        return {
          top: targetRect.bottom + gap,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translateX(-50%)',
        }
      case 'left':
        return {
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.left - gap,
          transform: 'translate(-100%, -50%)',
        }
      case 'right':
        return {
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.right + gap,
          transform: 'translateY(-50%)',
        }
      default:
        return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }
  }, [targetRect, step])

  if (!open || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-hidden pointer-events-none">
      {/* Click Blocker: Prevents interaction with the entire page */}
      <div className="fixed inset-0 pointer-events-auto bg-transparent" />

      {/* Background Dimming with Rounded Hole */}
      {targetRect && (
        <div 
          className="fixed pointer-events-none z-[100] transition-all duration-300"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            borderRadius: '12px',
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.4)',
          }}
        />
      )}
      {!targetRect && (
        <div className="fixed inset-0 bg-slate-900/40 pointer-events-none z-[100]" />
      )}

      {/* Highlight Box (Glow only) */}
      {targetRect && (
        <div 
          className="fixed rounded-[12px] animate-tour-glow pointer-events-none z-[101]"
          style={{
            top: targetRect.top - 2,
            left: targetRect.left - 2,
            width: targetRect.width + 4,
            height: targetRect.height + 4,
          }}
        />
      )}

      {/* Tooltip */}
      <div 
        className="fixed bg-white rounded-xl shadow-2xl border border-slate-200 p-5 w-[320px] pointer-events-auto animate-in fade-in zoom-in duration-200 z-[102]"
        style={tooltipPosition}
      >
        <button 
          onClick={handleSkip}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-900 leading-tight">
              {step?.title}
            </h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              {step?.content}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === currentStep ? "w-4 bg-brand-600" : "w-1.5 bg-slate-200"
                  )} 
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleBack}
                disabled={currentStep === 0}
                className="h-8 px-2 text-slate-500 hover:text-slate-900"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button 
                size="sm" 
                onClick={handleNext}
                className="h-8 bg-brand-600 hover:bg-brand-700 text-white"
              >
                {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                {currentStep < steps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Arrow (optional, can be added with more complex logic) */}
      </div>

      <style jsx global>{`
        @keyframes tour-glow {
          0%, 100% { 
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.4), 0 0 15px rgba(255, 255, 255, 0.2);
          }
          50% { 
            box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.2), 0 0 25px rgba(255, 255, 255, 0.5);
          }
        }
        .animate-tour-glow {
          animation: tour-glow 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>,
    document.body
  )
}
