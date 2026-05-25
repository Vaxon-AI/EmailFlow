'use client'

import './landing-tokens.css'
import { CineNav } from './landing-nav'
import { CineHero } from './landing-hero'
import { CinePinnedStory } from './landing-pinned-story'
import { CineMetrics } from './landing-metrics'
import { CineMatrix } from './landing-matrix'
import { CineCTA, CineFooter } from './landing-cta-footer'

export default function LandingPage() {
  // overflow-x: clip clips horizontal overflow from hero decorations without
  // creating a scroll container — unlike overflow: hidden, it does NOT break
  // position: sticky on descendants (CinePinnedStory pins its inner panel).
  return (
    <div className="landing-cine" style={{ overflowX: 'clip' }}>
      <CineNav />
      <CineHero />
      <CinePinnedStory />
      <CineMetrics />
      <CineMatrix />
      <CineCTA />
      <CineFooter />
    </div>
  )
}
