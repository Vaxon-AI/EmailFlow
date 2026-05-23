import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // ── User ──────────────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: 'demo@emailflow.ai' },
    update: {
      name: 'Demo User',
      timezone: 'Asia/Shanghai',
      syncEnabled: true,
      lastSyncAt: new Date(),
    },
    create: {
      id: 'demo',
      email: 'demo@emailflow.ai',
      name: 'Demo User',
      timezone: 'Asia/Shanghai',
      syncEnabled: true,
      lastSyncAt: new Date(),
    },
  })

  await prisma.session.upsert({
    where: { tokenHash: hashToken('demo-session-token') },
    update: {
      userId: user.id,
      deviceName: 'Desktop · Seeded browser',
      deviceType: 'desktop',
      browser: 'Seeded browser',
      os: 'Seeded OS',
      ipAddress: '127.0.0.1',
      userAgent: 'seed-script',
      lastActiveAt: new Date(),
      expiresAt: daysFromNow(30),
      revokedAt: null,
      status: 'active',
    },
    create: {
      tokenHash: hashToken('demo-session-token'),
      userId: user.id,
      deviceName: 'Desktop · Seeded browser',
      deviceType: 'desktop',
      browser: 'Seeded browser',
      os: 'Seeded OS',
      ipAddress: '127.0.0.1',
      userAgent: 'seed-script',
      lastActiveAt: new Date(),
      expiresAt: daysFromNow(30),
      status: 'active',
    },
  })

  // ── Identities ────────────────────────────────────────────────────────────
  // Two distinct "hats" this user wears
  const idCorpPM = await prisma.userIdentity.upsert({
    where: { userId_name: { userId: user.id, name: 'PM at TechCorp' } },
    update: {
      description: 'Product Manager at TechCorp — full-time role managing the core platform.',
      status: 'active',
      keywords: ['TechCorp', 'product', 'roadmap', 'Q1', 'sprint', 'OKR'],
      hints: ['techcorp.com', 'team.co', 'clientcorp.com'],
      confidence: 1.0,
    },
    create: {
      id: 'identity-corp',
      userId: user.id,
      name: 'PM at TechCorp',
      description: 'Product Manager at TechCorp — full-time role managing the core platform.',
      status: 'active',
      keywords: ['TechCorp', 'product', 'roadmap', 'Q1', 'sprint', 'OKR'],
      hints: ['techcorp.com', 'team.co', 'clientcorp.com'],
      confidence: 1.0,
    },
  })

  const idFounder = await prisma.userIdentity.upsert({
    where: { userId_name: { userId: user.id, name: 'Founder — SideApp' } },
    update: {
      description: 'Co-founder of SideApp, an early-stage B2B SaaS startup.',
      status: 'active',
      keywords: ['SideApp', 'startup', 'fundraising', 'investor', 'growth', 'launch'],
      hints: ['sideapp.io', 'startup.io', 'investor.vc'],
      confidence: 0.95,
    },
    create: {
      id: 'identity-founder',
      userId: user.id,
      name: 'Founder — SideApp',
      description: 'Co-founder of SideApp, an early-stage B2B SaaS startup.',
      status: 'active',
      keywords: ['SideApp', 'startup', 'fundraising', 'investor', 'growth', 'launch'],
      hints: ['sideapp.io', 'startup.io', 'investor.vc'],
      confidence: 0.95,
    },
  })

  // ── Projects ──────────────────────────────────────────────────────────────
  const projQ1 = await prisma.projectContext.upsert({
    where: { userId_name: { userId: user.id, name: 'Q1 Planning & Reporting' } },
    update: { identityId: idCorpPM.id, description: 'Q1 OKR delivery, board reporting, and client review cycle.', status: 'active', keywords: ['Q1', 'board', 'report', 'review', 'OKR'], confidence: 1.0 },
    create: { id: 'proj-q1', userId: user.id, identityId: idCorpPM.id, name: 'Q1 Planning & Reporting', description: 'Q1 OKR delivery, board reporting, and client review cycle.', status: 'active', keywords: ['Q1', 'board', 'report', 'review', 'OKR'], confidence: 1.0 },
  })

  const projInfra = await prisma.projectContext.upsert({
    where: { userId_name: { userId: user.id, name: 'Infrastructure & Vendors' } },
    update: { identityId: idCorpPM.id, description: 'Vendor contracts, cloud hosting, and infrastructure ops.', status: 'active', keywords: ['CloudHost', 'contract', 'invoice', 'hosting', 'DevOps'], confidence: 0.92 },
    create: { id: 'proj-infra', userId: user.id, identityId: idCorpPM.id, name: 'Infrastructure & Vendors', description: 'Vendor contracts, cloud hosting, and infrastructure ops.', status: 'active', keywords: ['CloudHost', 'contract', 'invoice', 'hosting', 'DevOps'], confidence: 0.92 },
  })

  const projTeamOps = await prisma.projectContext.upsert({
    where: { userId_name: { userId: user.id, name: 'Team Operations' } },
    update: { identityId: idCorpPM.id, description: 'Sprint ceremonies, team updates, HR admin, and offsites.', status: 'active', keywords: ['sprint', 'standup', 'HR', 'timesheet', 'offsite'], confidence: 0.9 },
    create: { id: 'proj-team-ops', userId: user.id, identityId: idCorpPM.id, name: 'Team Operations', description: 'Sprint ceremonies, team updates, HR admin, and offsites.', status: 'active', keywords: ['sprint', 'standup', 'HR', 'timesheet', 'offsite'], confidence: 0.9 },
  })

  const projFundraising = await prisma.projectContext.upsert({
    where: { userId_name: { userId: user.id, name: 'Fundraising & BD' } },
    update: { identityId: idFounder.id, description: 'Series A fundraising process and business development pipeline.', status: 'active', keywords: ['investor', 'Series A', 'deck', 'partnership', 'BD'], confidence: 0.93 },
    create: { id: 'proj-fundraising', userId: user.id, identityId: idFounder.id, name: 'Fundraising & BD', description: 'Series A fundraising process and business development pipeline.', status: 'active', keywords: ['investor', 'Series A', 'deck', 'partnership', 'BD'], confidence: 0.93 },
  })

  const projProduct = await prisma.projectContext.upsert({
    where: { userId_name: { userId: user.id, name: 'Product & Growth' } },
    update: { identityId: idFounder.id, description: 'Product development, user onboarding, and early growth metrics.', status: 'active', keywords: ['launch', 'user interview', 'onboarding', 'signup', 'growth'], confidence: 0.91 },
    create: { id: 'proj-product', userId: user.id, identityId: idFounder.id, name: 'Product & Growth', description: 'Product development, user onboarding, and early growth metrics.', status: 'active', keywords: ['launch', 'user interview', 'onboarding', 'signup', 'growth'], confidence: 0.91 },
  })

  // ── Emails ────────────────────────────────────────────────────────────────
  const WORK  = 'demo@emailflow.ai'
  const SIDE  = 'demo.sideapp@gmail.com'
  const HOME  = 'demo.personal@gmail.com'

  const emails = [
    // ── PM @ TechCorp — Q1 Planning ──────────────────────────────────────
    {
      providerMessageId: 'msg-001',
      threadId: 'thread-001',
      accountEmail: WORK,
      subject: 'Q1 Report — Please review and submit feedback by EOD Friday',
      sender: 'Sarah Chen <sarah@clientcorp.com>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'Please review the Q1 report and send your feedback by Friday EOD.',
      bodyFull: 'Hi, please review the attached Q1 report and submit feedback by Friday EOD. Focus especially on page 3 revenue projections and page 7 cost breakdown. The board needs this before the Monday session.',
      receivedAt: daysAgo(0),
      labels: JSON.stringify(['INBOX', 'IMPORTANT']),
      hasAttachments: true,
      classification: 'action',
      classConfidence: 0.95,
      classReasoning: 'Explicit deliverable with clear Friday deadline',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-010',
      threadId: 'thread-001',
      accountEmail: WORK,
      subject: 'Re: Q1 Report — page 3 revenue numbers look off',
      sender: 'James Liu <james@techcorp.com>',
      recipients: JSON.stringify([WORK, 'sarah@clientcorp.com']),
      bodyPreview: 'Just flagging — the page 3 projections seem to be using last quarter\'s baseline, not the updated one.',
      bodyFull: 'Hi all, I reviewed the draft. The revenue projections on page 3 appear to use the old Q4 baseline rather than the updated H2 actuals. Can someone confirm before we send back to Sarah? This will affect the board narrative.',
      receivedAt: hoursAgo(3),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.91,
      classReasoning: 'Follow-up requiring decision before deadline',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-011',
      threadId: 'thread-011',
      accountEmail: WORK,
      subject: 'Sprint 13 planning — notes and action items',
      sender: 'Mike Johnson <mike@team.co>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'Attached are the sprint 13 planning notes. Engineering capacity is 34 points this sprint.',
      bodyFull: 'Hey team, attached are the full notes from today\'s sprint planning. Engineering capacity is 34 points. We\'ve committed to 3 features and 5 bugs. Reminder: retro is Thursday 3pm. No blockers raised today.',
      receivedAt: daysAgo(1),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: true,
      classification: 'awareness',
      classConfidence: 0.89,
      classReasoning: 'Informational sprint notes, no action required',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-012',
      threadId: 'thread-012',
      accountEmail: WORK,
      subject: 'OKR mid-quarter check-in — your input needed by Thursday',
      sender: 'Emily Park <emily.park@techcorp.com>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'Please fill in your team\'s KR progress scores before Thursday\'s leadership sync.',
      bodyFull: 'Hi, as part of the mid-quarter OKR review, please update your KR progress scores in the shared spreadsheet by Thursday morning. Leadership sync is at 2pm Thursday and we need your inputs beforehand. Link: [spreadsheet].',
      receivedAt: daysAgo(1),
      labels: JSON.stringify(['INBOX', 'IMPORTANT']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.93,
      classReasoning: 'Explicit input deadline for leadership sync',
      isWorkRelated: true,
    },
    // ── PM @ TechCorp — Infrastructure & Vendors ─────────────────────────
    {
      providerMessageId: 'msg-006',
      threadId: 'thread-006',
      accountEmail: WORK,
      subject: 'Contract draft ready — confirm clauses 3 and 7 by Tuesday',
      sender: 'Legal Team <legal@vendor.com>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'Please review clauses 3 and 7 before Tuesday.',
      bodyFull: 'Attached is the updated contract draft. Please review clauses 3 and 7 and confirm by Tuesday so we can proceed to countersignature.',
      receivedAt: daysAgo(1),
      labels: JSON.stringify(['INBOX', 'IMPORTANT']),
      hasAttachments: true,
      classification: 'action',
      classConfidence: 0.92,
      classReasoning: 'Legal review with explicit deadline',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-007',
      threadId: 'thread-007',
      accountEmail: WORK,
      subject: 'Invoice #2048 due in 3 days — CloudHost',
      sender: 'CloudHost Billing <billing@cloudhost.io>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'Hosting invoice is due in 3 days. Pay to avoid interruption.',
      bodyFull: 'Invoice #2048 for $1,240 USD hosting services is due in 3 days. Please pay promptly to avoid any service interruption. Log in to the billing portal to complete payment.',
      receivedAt: daysAgo(0),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: true,
      classification: 'action',
      classConfidence: 0.89,
      classReasoning: 'Payment deadline with service continuity risk',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-013',
      threadId: 'thread-013',
      accountEmail: WORK,
      subject: 'CloudHost — Updated Service Agreement (effective next month)',
      sender: 'CloudHost Legal <legal@cloudhost.io>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'We\'ve updated our Service Agreement. It takes effect in 30 days.',
      bodyFull: 'Dear customer, we\'ve updated our Service Agreement to reflect new data processing requirements under regional privacy regulations. The new agreement takes effect in 30 days. No action required unless you wish to dispute a clause. Full text attached.',
      receivedAt: daysAgo(3),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: true,
      classification: 'awareness',
      classConfidence: 0.87,
      classReasoning: 'Legal update, no immediate action required',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-017',
      threadId: 'thread-017',
      accountEmail: WORK,
      subject: 'GitHub Actions — CI quota 85% used this month',
      sender: 'GitHub <noreply@github.com>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'Your organization has used 85% of the included GitHub Actions minutes.',
      bodyFull: 'Your GitHub organization TechCorp has used 85% of the included Actions minutes for this billing cycle. At current usage you\'ll hit the limit in ~4 days. Consider upgrading your plan or reviewing scheduled workflows to reduce consumption.',
      receivedAt: daysAgo(0),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.82,
      classReasoning: 'Quota warning requiring review before service disruption',
      isWorkRelated: true,
    },
    // ── PM @ TechCorp — Team Operations ──────────────────────────────────
    {
      providerMessageId: 'msg-004',
      threadId: 'thread-004',
      accountEmail: WORK,
      subject: 'Reminder: Submit timesheet today before 6pm',
      sender: 'HR <hr@techcorp.com>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'Please submit your weekly timesheet before 6pm today.',
      bodyFull: 'Friendly reminder to submit your weekly timesheet before 6pm today so payroll can be processed on time. Late submissions may delay your reimbursement.',
      receivedAt: daysAgo(0),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.93,
      classReasoning: 'Same-day deadline and explicit action required',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-002',
      threadId: 'thread-002',
      accountEmail: WORK,
      subject: 'Weekly team status update — Sprint 12',
      sender: 'Mike Johnson <mike@team.co>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'Frontend is 80% complete, backend ready, QA starts Monday.',
      bodyFull: 'Weekly update: frontend is 80% complete, backend API endpoints are functional, QA starts next Monday. No blockers and budget is on track. Velocity this sprint: 31 points.',
      receivedAt: daysAgo(1),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'awareness',
      classConfidence: 0.91,
      classReasoning: 'Informational status update',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-018',
      threadId: 'thread-018',
      accountEmail: WORK,
      subject: 'Q2 Team Offsite — confirm attendance by Friday',
      sender: 'Priya Sharma <priya@techcorp.com>',
      recipients: JSON.stringify([WORK]),
      bodyPreview: 'We\'re planning the Q2 offsite for the week of May 12. Please confirm your attendance.',
      bodyFull: 'Hi team, we\'re planning the Q2 offsite for the week of May 12 in Melbourne. Please fill in the attendance form by this Friday so we can book accommodation. The agenda will include strategy sessions, team workshops, and a Thursday dinner.',
      receivedAt: daysAgo(2),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.88,
      classReasoning: 'RSVP required before Friday deadline',
      isWorkRelated: true,
    },
    // ── Founder @ SideApp — Fundraising & BD ─────────────────────────────
    {
      providerMessageId: 'msg-009',
      threadId: 'thread-009',
      accountEmail: SIDE,
      subject: 'Partnership opportunity — let\'s schedule a call',
      sender: 'Alex Wong <alex@startup.io>',
      recipients: JSON.stringify([SIDE]),
      bodyPreview: 'Would you be open to a 30-minute call next week to discuss a partnership?',
      bodyFull: 'Hi, I came across SideApp and would love to explore a potential integration partnership. We have ~8k users in your target segment. Would you be open to a 30-minute call next week?',
      receivedAt: daysAgo(2),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'uncertain',
      classConfidence: 0.52,
      classReasoning: 'Could be genuine opportunity or cold outreach',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-014',
      threadId: 'thread-014',
      accountEmail: SIDE,
      subject: 'Investor update requested — Series A deck review',
      sender: 'Rachel Kim <rkim@horizon.vc>',
      recipients: JSON.stringify([SIDE]),
      bodyPreview: 'Following our call last week — can you share the updated deck before our IC meets on Thursday?',
      bodyFull: 'Hi, following up from our call last week. Our investment committee meets Thursday and I\'d like to share your updated deck before then. If you can send it by Wednesday EOD that would be ideal. Also please include the latest MRR and churn figures if available.',
      receivedAt: daysAgo(1),
      labels: JSON.stringify(['INBOX', 'IMPORTANT']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.96,
      classReasoning: 'IC-deadline pitch material request, high stakes',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-020',
      threadId: 'thread-020',
      accountEmail: SIDE,
      subject: 'Re: SideApp — intro to 3 potential enterprise leads',
      sender: 'David Tan <david@vc-network.com>',
      recipients: JSON.stringify([SIDE]),
      bodyPreview: 'Happy to make those intros — I\'ve cc\'d Marcus, Preet, and Joanna. Take it from here.',
      bodyFull: 'Hi, as discussed — I\'ve looped in Marcus (FinoTech), Preet (LegalSoft), and Joanna (RetailX). All three are evaluating workflow automation tools and could be a strong fit for SideApp. I\'d suggest reaching out to each individually with a tailored pitch. Good luck!',
      receivedAt: hoursAgo(6),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.91,
      classReasoning: 'Warm introductions requiring timely follow-up',
      isWorkRelated: true,
    },
    // ── Founder @ SideApp — Product & Growth ─────────────────────────────
    {
      providerMessageId: 'msg-015',
      threadId: 'thread-015',
      accountEmail: SIDE,
      subject: 'User interview notes — 5 new signups this week',
      sender: 'Co-founder <cofounder@sideapp.io>',
      recipients: JSON.stringify([SIDE]),
      bodyPreview: 'Ran 3 interviews this week. Key insight: users want better CSV export.',
      bodyFull: 'Hey, ran 3 user interviews this week. Main takeaways: (1) users love the dashboard but find CSV export clunky, (2) most discovered us via ProductHunt, (3) one user suggested a Zapier integration would unblock their use case. 5 new signups total this week — best week yet.',
      receivedAt: daysAgo(0),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'awareness',
      classConfidence: 0.88,
      classReasoning: 'Internal growth update, no immediate action',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-016',
      threadId: 'thread-016',
      accountEmail: SIDE,
      subject: 'Weekly co-founder sync — agenda for tomorrow',
      sender: 'Co-founder <cofounder@sideapp.io>',
      recipients: JSON.stringify([SIDE]),
      bodyPreview: 'Agenda: investor update, onboarding flow v2, and churn analysis.',
      bodyFull: 'For tomorrow\'s sync: (1) status on Rachel Kim investor follow-up, (2) review onboarding flow v2 wireframes, (3) walk through June churn analysis, (4) decide on Zapier integration priority. I\'ll bring the Figma link.',
      receivedAt: daysAgo(1),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.84,
      classReasoning: 'Co-founder meeting requiring prep',
      isWorkRelated: true,
    },
    {
      providerMessageId: 'msg-021',
      threadId: 'thread-021',
      accountEmail: SIDE,
      subject: 'Onboarding flow v2 — design review comments',
      sender: 'Co-founder <cofounder@sideapp.io>',
      recipients: JSON.stringify([SIDE]),
      bodyPreview: 'Left comments on the Figma file. Step 3 still feels like too many fields.',
      bodyFull: 'Hey, left detailed comments on the Figma file. Main concern: step 3 still has 6 required fields which is going to kill completion rate. Can we move "company size" to post-onboarding? Also the CTA copy on step 1 needs to be more specific — "Get started" isn\'t strong enough.',
      receivedAt: hoursAgo(2),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.87,
      classReasoning: 'Design feedback requiring response and iteration',
      isWorkRelated: true,
    },
    // ── Personal / no project ─────────────────────────────────────────────
    {
      providerMessageId: 'msg-003',
      threadId: 'thread-003',
      accountEmail: HOME,
      subject: '50% OFF SALE 🔥 — Today only',
      sender: 'ShopMart <deals@shopmart.com>',
      recipients: JSON.stringify([HOME]),
      bodyPreview: 'Big discount today only.',
      bodyFull: 'Today only: up to 50% off electronics, home goods, and more. Use code FLASH50.',
      receivedAt: daysAgo(0),
      labels: JSON.stringify(['INBOX', 'PROMOTIONS']),
      hasAttachments: false,
      classification: 'ignore',
      classConfidence: 0.98,
      classReasoning: 'Promotional email',
      isWorkRelated: false,
    },
    {
      providerMessageId: 'msg-005',
      threadId: 'thread-005',
      accountEmail: HOME,
      subject: 'Password reset request for your account',
      sender: 'Security <security@service.com>',
      recipients: JSON.stringify([HOME]),
      bodyPreview: 'Click here to reset your password within 24 hours.',
      bodyFull: 'We received a password reset request for your account. If this was you, complete the reset within 24 hours. If not, ignore this email and consider enabling 2FA.',
      receivedAt: daysAgo(0),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'action',
      classConfidence: 0.86,
      classReasoning: 'Potential security action required',
      isWorkRelated: false,
    },
    {
      providerMessageId: 'msg-008',
      threadId: 'thread-008',
      accountEmail: HOME,
      subject: 'Flight booking confirmation ✈️ — SYD → MEL',
      sender: 'Airline <booking@airline.com>',
      recipients: JSON.stringify([HOME]),
      bodyPreview: 'Your flight to Melbourne has been confirmed. Departure next Tuesday 9:40am.',
      bodyFull: 'Your booking is confirmed. Departure is next Tuesday at 9:40am from Sydney (SYD) to Melbourne (MEL). Check-in opens 24 hours before departure. Booking reference: XJ4820.',
      receivedAt: daysAgo(2),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'awareness',
      classConfidence: 0.9,
      classReasoning: 'Travel confirmation, no action required',
      isWorkRelated: false,
    },
    {
      providerMessageId: 'msg-019',
      threadId: 'thread-019',
      accountEmail: HOME,
      subject: 'Product management in 2025 — this month\'s digest',
      sender: 'Lenny\'s Newsletter <hello@lennysnewsletter.com>',
      recipients: JSON.stringify([HOME]),
      bodyPreview: 'This month: AI for PMs, roadmap templates, and a chat with Spotify\'s CPO.',
      bodyFull: 'In this issue: using AI to run better discovery interviews, the best roadmap format for enterprise, and a long-form conversation with Spotify\'s CPO on prioritisation. Plus the usual job board and community highlights.',
      receivedAt: daysAgo(3),
      labels: JSON.stringify(['INBOX']),
      hasAttachments: false,
      classification: 'ignore',
      classConfidence: 0.79,
      classReasoning: 'Newsletter — no action needed',
      isWorkRelated: false,
    },
  ]

  for (const e of emails) {
    const existing = await prisma.email.findFirst({
      where: {
        userId: user.id,
        providerMessageId: e.providerMessageId,
      },
    })
    if (existing) {
      await prisma.email.update({
        where: { id: existing.id },
        data: { userId: user.id, ...e, processedAt: new Date() },
      })
    } else {
      await prisma.email.create({
        data: { userId: user.id, ...e, processedAt: new Date() },
      })
    }
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const taskBlueprints = [
    // Q1
    {
      msgId: 'msg-001',
      title: 'Review Q1 report and send feedback to Sarah',
      summary: 'Review key pages of the Q1 report and submit feedback before Friday EOD.',
      actionItems: ['Confirm correct baseline on page 3 revenue projections with James', 'Review page 7 cost breakdown', 'Reply to Sarah with final feedback'],
      urgency: 5, impact: 5, priorityScore: 25,
      priorityReason: 'Board meeting dependency and hard Friday deadline',
      startDate: daysAgo(0), explicitDeadline: nextWeekday(5), deadlineConfidence: 0.95, status: 'ai_suggestion',
    },
    {
      msgId: 'msg-012',
      title: 'Update mid-quarter OKR scores before Thursday sync',
      summary: 'Fill in KR progress scores in the shared spreadsheet before Thursday leadership sync.',
      actionItems: ['Open OKR spreadsheet', 'Update progress scores for each KR', 'Add brief comments on blockers'],
      urgency: 4, impact: 4, priorityScore: 16,
      priorityReason: 'Needed before leadership sync Thursday 2pm',
      startDate: daysAgo(0), explicitDeadline: nextWeekday(4), deadlineConfidence: 0.91, status: 'ai_suggestion',
    },
    // Infra
    {
      msgId: 'msg-006',
      title: 'Review contract clauses 3 and 7 — vendor agreement',
      summary: 'Review the updated contract draft and confirm before Tuesday.',
      actionItems: ['Read clause 3 carefully', 'Read clause 7 carefully', 'Reply to legal@vendor.com with approval or redlines'],
      urgency: 4, impact: 5, priorityScore: 20,
      priorityReason: 'Legal review blocking countersignature',
      startDate: daysAgo(0), explicitDeadline: nextWeekday(2), deadlineConfidence: 0.92, status: 'ai_suggestion',
    },
    {
      msgId: 'msg-007',
      title: 'Pay CloudHost invoice #2048',
      summary: 'Pay $1,240 hosting invoice to avoid service interruption.',
      actionItems: ['Log into CloudHost billing portal', 'Review invoice details', 'Complete payment'],
      urgency: 4, impact: 4, priorityScore: 16,
      priorityReason: 'Service continuity risk if unpaid',
      startDate: daysAgo(0), explicitDeadline: daysFromNow(3), deadlineConfidence: 0.9, status: 'ai_suggestion',
    },
    {
      msgId: 'msg-017',
      title: 'Review GitHub Actions usage and reduce CI quota burn',
      summary: 'CI quota at 85% — investigate and trim scheduled workflows before limit is hit.',
      actionItems: ['Review Actions usage breakdown by workflow', 'Identify high-cost scheduled workflows', 'Disable or reschedule non-critical pipelines'],
      urgency: 3, impact: 4, priorityScore: 12,
      priorityReason: 'Will hit quota in ~4 days, blocking CI',
      startDate: daysAgo(0), inferredDeadline: daysFromNow(3), deadlineConfidence: 0.8, status: 'ai_suggestion',
    },
    // Team Ops
    {
      msgId: 'msg-004',
      title: 'Submit weekly timesheet before 6pm',
      summary: 'Complete and submit timesheet to HR before end of day.',
      actionItems: ['Open timesheet system', 'Fill in this week\'s hours', 'Submit before 6pm'],
      urgency: 5, impact: 3, priorityScore: 15,
      priorityReason: 'Same-day hard deadline for payroll processing',
      startDate: daysAgo(0), explicitDeadline: todayAt(18, 0), deadlineConfidence: 0.98, status: 'ai_suggestion',
    },
    {
      msgId: 'msg-018',
      title: 'Confirm Q2 offsite attendance by Friday',
      summary: 'Fill in the offsite attendance form for the May 12 Melbourne trip.',
      actionItems: ['Check calendar for that week', 'Complete attendance form', 'Book travel if attending'],
      urgency: 3, impact: 2, priorityScore: 6,
      priorityReason: 'Accommodation booking depends on attendance count',
      startDate: daysAgo(0), explicitDeadline: nextWeekday(5), deadlineConfidence: 0.85, status: 'ai_suggestion',
    },
    // Fundraising
    {
      msgId: 'msg-014',
      title: 'Send updated Series A deck to Rachel Kim by Wednesday EOD',
      summary: 'Prepare updated pitch deck with latest MRR/churn figures for IC meeting Thursday.',
      actionItems: ['Update deck with latest MRR and churn figures', 'Add revised market size slide', 'Send to rkim@horizon.vc by Wednesday EOD'],
      urgency: 5, impact: 5, priorityScore: 25,
      priorityReason: 'Investor committee meeting Thursday — high stakes',
      startDate: daysAgo(0), explicitDeadline: nextWeekday(3), deadlineConfidence: 0.96, status: 'ai_suggestion',
    },
    {
      msgId: 'msg-020',
      title: 'Follow up with Marcus, Preet, and Joanna (warm intros)',
      summary: 'Reach out individually to three warm enterprise leads introduced by David Tan.',
      actionItems: ['Draft tailored pitch email for Marcus at FinoTech', 'Draft pitch for Preet at LegalSoft', 'Draft pitch for Joanna at RetailX'],
      urgency: 4, impact: 5, priorityScore: 20,
      priorityReason: 'Warm intros go cold fast — reach out within 48h',
      startDate: daysAgo(0), inferredDeadline: daysFromNow(2), deadlineConfidence: 0.88, status: 'ai_suggestion',
    },
    // Product
    {
      msgId: 'msg-016',
      title: 'Prepare for tomorrow\'s co-founder sync',
      summary: 'Review agenda items: investor update, onboarding v2 wireframes, churn analysis.',
      actionItems: ['Review Rachel Kim email status', 'Open onboarding v2 Figma and add notes', 'Pull June churn numbers from dashboard'],
      urgency: 3, impact: 3, priorityScore: 9,
      priorityReason: 'Sync is tomorrow — prep needed tonight',
      startDate: daysAgo(0), inferredDeadline: daysFromNow(1), deadlineConfidence: 0.9, status: 'ai_suggestion',
    },
    {
      msgId: 'msg-021',
      title: 'Respond to onboarding flow v2 design feedback',
      summary: 'Address co-founder\'s Figma comments — simplify step 3 and revise step 1 CTA copy.',
      actionItems: ['Move "company size" field to post-onboarding', 'Revise CTA copy on step 1', 'Reply on Figma with updated rationale'],
      urgency: 3, impact: 4, priorityScore: 12,
      priorityReason: 'Blocking next design iteration cycle',
      startDate: daysAgo(0), inferredDeadline: daysFromNow(2), deadlineConfidence: 0.85, status: 'ai_suggestion',
    },
    // Personal
    {
      msgId: 'msg-005',
      title: 'Check password reset — confirm if it was you',
      summary: 'Verify whether the password reset request was legitimate.',
      actionItems: ['Check if you requested the reset', 'Reset password if legitimate', 'Enable 2FA if suspicious'],
      urgency: 4, impact: 4, priorityScore: 16,
      priorityReason: 'Potential account security risk, 24h window',
      startDate: daysAgo(0), inferredDeadline: daysFromNow(1), deadlineConfidence: 0.8, status: 'ai_suggestion',
    },
  ]

  const createdTasks: Record<string, string> = {} // msgId → taskId

  for (const bp of taskBlueprints) {
    const sourceEmail = await prisma.email.findFirst({
      where: {
        userId: user.id,
        providerMessageId: bp.msgId,
      },
    })
    if (!sourceEmail) continue

    let task = await prisma.task.findFirst({ where: { userId: user.id, title: bp.title } })
    if (!task) {
      task = await prisma.task.create({
        data: {
          userId: user.id,
          title: bp.title,
          summary: bp.summary,
          actionItems: JSON.stringify(bp.actionItems),
          status: bp.status,
          urgency: bp.urgency,
          impact: bp.impact,
          priorityScore: bp.priorityScore,
          priorityReason: bp.priorityReason,
          startDate: bp.startDate,
          explicitDeadline: bp.explicitDeadline ?? null,
          inferredDeadline: bp.inferredDeadline ?? null,
          deadlineConfidence: bp.deadlineConfidence,
        },
      })
    }

    createdTasks[bp.msgId] = task.id

    await prisma.taskEmail.upsert({
      where: { taskId_emailId: { taskId: task.id, emailId: sourceEmail.id } },
      update: { relationship: 'source' },
      create: { taskId: task.id, emailId: sourceEmail.id, relationship: 'source' },
    })
    await prisma.email.update({
      where: { id: sourceEmail.id },
      data: { actioned: true },
    })
  }

  // Standalone tasks (not linked to email)
  const standalone = [
    { title: 'Prepare product walkthrough slides for client demo', summary: 'Create a concise slide deck for the upcoming client demo.', actionItems: ['Draft outline', 'Add screenshots', 'Rehearse 10-min run-through'], urgency: 2, impact: 3, priorityScore: 6, inferredDeadline: daysFromNow(4) },
    { title: 'Write SideApp blog post — Q1 growth retrospective', summary: 'Write a public growth retrospective to drive inbound and build credibility.', actionItems: ['Outline key metrics', 'Write 600-word draft', 'Review with co-founder'], urgency: 2, impact: 3, priorityScore: 6, inferredDeadline: daysFromNow(7) },
  ]
  for (const t of standalone) {
    const exists = await prisma.task.findFirst({ where: { userId: user.id, title: t.title } })
    if (!exists) {
      await prisma.task.create({
        data: { userId: user.id, title: t.title, summary: t.summary, actionItems: JSON.stringify(t.actionItems), status: 'ai_suggestion', urgency: t.urgency, impact: t.impact, priorityScore: t.priorityScore, inferredDeadline: t.inferredDeadline },
      })
    }
  }

  // ── Matters ───────────────────────────────────────────────────────────────
  const matterQ1 = await upsertMatter('matter-001', user.id, projQ1.id, {
    title: 'Q1 Board Report Review', topic: 'deadline',
    summary: 'Sarah Chen and James Liu need final Q1 report feedback before Friday board session.',
    status: 'open',
    nextAction: 'Confirm correct revenue baseline with James, then send consolidated feedback to Sarah.',
    threadCount: 1, emailCount: 2, lastMessageAt: hoursAgo(3),
    participants: ['sarah@clientcorp.com', 'james@techcorp.com', 'demo@emailflow.ai'],
    keywords: ['Q1', 'report', 'board', 'Friday', 'revenue'],
  })

  const matterOKR = await upsertMatter('matter-004', user.id, projQ1.id, {
    title: 'Mid-Quarter OKR Check-In', topic: 'deadline',
    summary: 'Emily Park needs KR progress scores before Thursday\'s leadership sync.',
    status: 'open',
    nextAction: 'Fill in KR scores in the spreadsheet before Thursday morning.',
    threadCount: 1, emailCount: 1, lastMessageAt: daysAgo(1),
    participants: ['emily.park@techcorp.com', 'demo@emailflow.ai'],
    keywords: ['OKR', 'Q1', 'KR', 'leadership sync', 'Thursday'],
  })

  const matterInfra = await upsertMatter('matter-002', user.id, projInfra.id, {
    title: 'CloudHost Contract & Invoice', topic: 'invoice',
    summary: 'Contract review due Tuesday; invoice #2048 due in 3 days; service agreement update incoming.',
    status: 'open',
    nextAction: 'Review contract clauses 3 & 7 first, then pay invoice #2048.',
    threadCount: 3, emailCount: 3, lastMessageAt: daysAgo(0),
    participants: ['legal@vendor.com', 'billing@cloudhost.io', 'legal@cloudhost.io', 'demo@emailflow.ai'],
    keywords: ['CloudHost', 'contract', 'invoice', 'billing', 'clauses'],
  })

  const matterCI = await upsertMatter('matter-005', user.id, projInfra.id, {
    title: 'GitHub Actions CI Quota', topic: 'deadline',
    summary: 'Actions quota at 85%, risk of hitting limit in ~4 days.',
    status: 'open',
    nextAction: 'Audit scheduled workflows and disable or reschedule non-critical ones.',
    threadCount: 1, emailCount: 1, lastMessageAt: daysAgo(0),
    participants: ['noreply@github.com', 'demo@emailflow.ai'],
    keywords: ['GitHub', 'CI', 'Actions', 'quota', 'DevOps'],
  })

  const matterTeamOps = await upsertMatter('matter-006', user.id, projTeamOps.id, {
    title: 'Timesheet & Sprint Updates', topic: 'other',
    summary: 'Timesheet due today 6pm; Sprint 13 notes received.',
    status: 'open',
    nextAction: 'Submit timesheet before 6pm.',
    threadCount: 2, emailCount: 2, lastMessageAt: daysAgo(0),
    participants: ['hr@techcorp.com', 'mike@team.co', 'demo@emailflow.ai'],
    keywords: ['timesheet', 'sprint', 'HR', 'weekly update'],
  })

  const matterOffsite = await upsertMatter('matter-007', user.id, projTeamOps.id, {
    title: 'Q2 Team Offsite — Melbourne', topic: 'meeting',
    summary: 'Attendance RSVP needed by Friday for May 12 Melbourne offsite.',
    status: 'open',
    nextAction: 'Check calendar and complete attendance form by Friday.',
    threadCount: 1, emailCount: 1, lastMessageAt: daysAgo(2),
    participants: ['priya@techcorp.com', 'demo@emailflow.ai'],
    keywords: ['offsite', 'Melbourne', 'Q2', 'RSVP'],
  })

  const matterInvestor = await upsertMatter('matter-003', user.id, projFundraising.id, {
    title: 'Series A — Horizon VC (Rachel Kim)', topic: 'approval',
    summary: 'Rachel Kim needs updated deck by Wednesday EOD for IC meeting Thursday.',
    status: 'open',
    nextAction: 'Update deck with latest MRR and churn, send to rkim@horizon.vc by Wednesday EOD.',
    threadCount: 1, emailCount: 1, lastMessageAt: daysAgo(1),
    participants: ['rkim@horizon.vc', 'demo@emailflow.ai'],
    keywords: ['Series A', 'investor', 'deck', 'IC', 'Horizon'],
  })

  const matterBD = await upsertMatter('matter-008', user.id, projFundraising.id, {
    title: 'Enterprise Intros — David Tan Network', topic: 'meeting',
    summary: 'Three warm enterprise leads introduced: FinoTech, LegalSoft, RetailX.',
    status: 'open',
    nextAction: 'Reach out to Marcus, Preet, and Joanna individually within 48 hours.',
    threadCount: 1, emailCount: 1, lastMessageAt: hoursAgo(6),
    participants: ['david@vc-network.com', 'demo@emailflow.ai'],
    keywords: ['enterprise', 'BD', 'intro', 'leads', 'follow-up'],
  })

  const matterPartnership = await upsertMatter('matter-009', user.id, projFundraising.id, {
    title: 'Partnership Inquiry — Alex Wong', topic: 'meeting',
    summary: 'Alex Wong (startup.io) proposing a 30-min partnership call.',
    status: 'waiting_reply',
    nextAction: 'Evaluate Alex\'s offer and decide whether to book a call.',
    threadCount: 1, emailCount: 1, lastMessageAt: daysAgo(2),
    participants: ['alex@startup.io', 'demo@emailflow.ai'],
    keywords: ['partnership', 'call', 'collaboration', 'integration'],
  })

  const matterOnboarding = await upsertMatter('matter-010', user.id, projProduct.id, {
    title: 'Onboarding Flow v2 Design', topic: 'project_update',
    summary: 'Co-founder left design feedback on Figma — step 3 needs simplification.',
    status: 'open',
    nextAction: 'Respond to Figma comments and revise step 3 and step 1 CTA.',
    threadCount: 2, emailCount: 2, lastMessageAt: hoursAgo(2),
    participants: ['cofounder@sideapp.io', 'demo@emailflow.ai'],
    keywords: ['onboarding', 'Figma', 'design', 'v2', 'UX'],
  })

  const matterGrowth = await upsertMatter('matter-011', user.id, projProduct.id, {
    title: 'Weekly Growth Update', topic: 'project_update',
    summary: '5 new signups, user interview insights: CSV export and Zapier integration are top requests.',
    status: 'open',
    nextAction: 'Discuss Zapier integration priority in co-founder sync.',
    threadCount: 1, emailCount: 1, lastMessageAt: daysAgo(0),
    participants: ['cofounder@sideapp.io', 'demo@emailflow.ai'],
    keywords: ['growth', 'signups', 'user interview', 'Zapier', 'CSV'],
  })

  // ── Threads ───────────────────────────────────────────────────────────────
  const threadDefs = [
    { id: 'tmem-001', threadId: 'thread-001', matterId: matterQ1.id,         title: 'Q1 Report Review Request',               topic: 'deadline',        status: 'open',          cls: 'action',    participants: ['sarah@clientcorp.com', 'james@techcorp.com'], emailCount: 2, lastAt: hoursAgo(3),  nextAction: 'Confirm baseline then send feedback.' },
    { id: 'tmem-011', threadId: 'thread-011', matterId: matterTeamOps.id,     title: 'Sprint 13 Planning Notes',                topic: 'other',           status: 'open',          cls: 'awareness', participants: ['mike@team.co'],                               emailCount: 1, lastAt: daysAgo(1),   nextAction: null },
    { id: 'tmem-012', threadId: 'thread-012', matterId: matterOKR.id,         title: 'Mid-Quarter OKR Scores Needed',           topic: 'deadline',        status: 'open',          cls: 'action',    participants: ['emily.park@techcorp.com'],                    emailCount: 1, lastAt: daysAgo(1),   nextAction: 'Fill in KR scores before Thursday.' },
    { id: 'tmem-006', threadId: 'thread-006', matterId: matterInfra.id,       title: 'Vendor Contract Clauses 3 & 7',           topic: 'approval',        status: 'open',          cls: 'action',    participants: ['legal@vendor.com'],                           emailCount: 1, lastAt: daysAgo(1),   nextAction: 'Review and confirm clauses.' },
    { id: 'tmem-007', threadId: 'thread-007', matterId: matterInfra.id,       title: 'CloudHost Invoice #2048',                 topic: 'invoice',         status: 'open',          cls: 'action',    participants: ['billing@cloudhost.io'],                       emailCount: 1, lastAt: daysAgo(0),   nextAction: 'Pay invoice.' },
    { id: 'tmem-013', threadId: 'thread-013', matterId: matterInfra.id,       title: 'CloudHost Service Agreement Update',      topic: 'other',           status: 'open',          cls: 'awareness', participants: ['legal@cloudhost.io'],                         emailCount: 1, lastAt: daysAgo(3),   nextAction: null },
    { id: 'tmem-017', threadId: 'thread-017', matterId: matterCI.id,          title: 'GitHub Actions Quota Warning',            topic: 'deadline',        status: 'open',          cls: 'action',    participants: ['noreply@github.com'],                         emailCount: 1, lastAt: daysAgo(0),   nextAction: 'Audit and reduce CI workflow usage.' },
    { id: 'tmem-004', threadId: 'thread-004', matterId: matterTeamOps.id,     title: 'Weekly Timesheet Reminder',               topic: 'deadline',        status: 'open',          cls: 'action',    participants: ['hr@techcorp.com'],                            emailCount: 1, lastAt: daysAgo(0),   nextAction: 'Submit timesheet before 6pm.' },
    { id: 'tmem-002', threadId: 'thread-002', matterId: matterTeamOps.id,     title: 'Sprint 12 Status Update',                 topic: 'other',           status: 'open',          cls: 'awareness', participants: ['mike@team.co'],                               emailCount: 1, lastAt: daysAgo(1),   nextAction: null },
    { id: 'tmem-018', threadId: 'thread-018', matterId: matterOffsite.id,     title: 'Q2 Offsite RSVP — Melbourne',             topic: 'meeting',         status: 'open',          cls: 'action',    participants: ['priya@techcorp.com'],                         emailCount: 1, lastAt: daysAgo(2),   nextAction: 'Confirm attendance by Friday.' },
    { id: 'tmem-014', threadId: 'thread-014', matterId: matterInvestor.id,    title: 'Series A Deck — Rachel Kim IC Deadline',  topic: 'approval',        status: 'open',          cls: 'action',    participants: ['rkim@horizon.vc'],                            emailCount: 1, lastAt: daysAgo(1),   nextAction: 'Send updated deck by Wednesday EOD.' },
    { id: 'tmem-020', threadId: 'thread-020', matterId: matterBD.id,          title: 'Warm Intro — 3 Enterprise Leads',         topic: 'meeting',         status: 'open',          cls: 'action',    participants: ['david@vc-network.com'],                       emailCount: 1, lastAt: hoursAgo(6),  nextAction: 'Follow up with Marcus, Preet, Joanna within 48h.' },
    { id: 'tmem-009', threadId: 'thread-009', matterId: matterPartnership.id, title: 'Partnership Inquiry — Alex Wong',          topic: 'meeting',         status: 'waiting_reply', cls: 'uncertain', participants: ['alex@startup.io'],                            emailCount: 1, lastAt: daysAgo(2),   nextAction: 'Evaluate and decide on response.' },
    { id: 'tmem-016', threadId: 'thread-016', matterId: matterOnboarding.id,  title: 'Co-founder Sync Agenda',                  topic: 'meeting',         status: 'open',          cls: 'action',    participants: ['cofounder@sideapp.io'],                       emailCount: 1, lastAt: daysAgo(1),   nextAction: 'Prep for sync tomorrow.' },
    { id: 'tmem-021', threadId: 'thread-021', matterId: matterOnboarding.id,  title: 'Onboarding v2 Figma Design Comments',     topic: 'project_update',  status: 'open',          cls: 'action',    participants: ['cofounder@sideapp.io'],                       emailCount: 1, lastAt: hoursAgo(2),  nextAction: 'Revise step 3 and CTA copy.' },
    { id: 'tmem-015', threadId: 'thread-015', matterId: matterGrowth.id,      title: 'Weekly Growth + User Interview Notes',    topic: 'project_update',  status: 'open',          cls: 'awareness', participants: ['cofounder@sideapp.io'],                       emailCount: 1, lastAt: daysAgo(0),   nextAction: null },
  ]

  for (const t of threadDefs) {
    await prisma.threadMemory.upsert({
      where: { userId_threadId: { userId: user.id, threadId: t.threadId } },
      update: { matterId: t.matterId, title: t.title, topic: t.topic, summary: t.title, status: t.status, nextAction: t.nextAction, lastClassification: t.cls, emailCount: t.emailCount, participants: t.participants, lastMessageAt: t.lastAt },
      create: { id: t.id, userId: user.id, threadId: t.threadId, matterId: t.matterId, title: t.title, topic: t.topic, summary: t.title, status: t.status, nextAction: t.nextAction, lastClassification: t.cls, emailCount: t.emailCount, participants: t.participants, lastMessageAt: t.lastAt },
    })
  }

  // Link tasks → matters
  const taskMatterLinks: Array<{ msgId: string; matterId: string; primary?: boolean }> = [
    { msgId: 'msg-001', matterId: matterQ1.id,         primary: true },
    { msgId: 'msg-012', matterId: matterOKR.id,        primary: true },
    { msgId: 'msg-006', matterId: matterInfra.id,      primary: true },
    { msgId: 'msg-007', matterId: matterInfra.id },
    { msgId: 'msg-017', matterId: matterCI.id,         primary: true },
    { msgId: 'msg-004', matterId: matterTeamOps.id,    primary: true },
    { msgId: 'msg-018', matterId: matterOffsite.id,    primary: true },
    { msgId: 'msg-014', matterId: matterInvestor.id,   primary: true },
    { msgId: 'msg-020', matterId: matterBD.id,         primary: true },
    { msgId: 'msg-009', matterId: matterPartnership.id, primary: true },
    { msgId: 'msg-016', matterId: matterOnboarding.id },
    { msgId: 'msg-021', matterId: matterOnboarding.id, primary: true },
  ]

  for (const link of taskMatterLinks) {
    const taskId = createdTasks[link.msgId]
    if (!taskId) continue
    if (link.primary) {
      await prisma.matterMemory.update({ where: { id: link.matterId }, data: { linkedPrimaryTaskId: taskId } })
    }
    await prisma.threadMemory.updateMany({ where: { userId: user.id, matterId: link.matterId, lastClassification: 'action' }, data: { linkedTaskId: taskId } })
  }

  // ── Digest ─────────────────────────────────────────────────────────────────
  const todayStart = startOfDay(new Date())
  const todayEnd   = endOfDay(new Date())
  const existingDigest = await prisma.digest.findFirst({ where: { userId: user.id, period: 'daily', periodStart: todayStart } })

  if (!existingDigest) {
    await prisma.digest.create({
      data: {
        userId: user.id, period: 'daily',
        periodStart: todayStart, periodEnd: todayEnd,
        content: buildDigestContent(),
        stats: JSON.stringify({ actionCount: 11, awarenessCount: 5, ignoredCount: 3, unresolvedCount: 2, taskTotal: taskBlueprints.length, taskPending: taskBlueprints.length }),
      },
    })
  }

  console.log('✅ Seed complete — demo user:', user.id)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertMatter(
  id: string, userId: string, projectContextId: string,
  data: { title: string; topic: string; summary: string; status: string; nextAction: string | null; threadCount: number; emailCount: number; lastMessageAt: Date; participants: string[]; keywords: string[] }
) {
  return prisma.matterMemory.upsert({
    where: { id },
    update: { ...data, projectContextId },
    create: { id, userId, projectContextId, ...data },
  })
}

function buildDigestContent() {
  return `## Daily Digest — ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}

### Urgent today
- **Submit timesheet before 6pm** — HR reminder, payroll depends on it
- **Confirm Q1 report baseline with James** — board report due Friday

### Due this week
- **Send Series A deck to Rachel Kim** — Wednesday EOD, IC meets Thursday
- **Review vendor contract clauses 3 & 7** — confirm by Tuesday
- **Pay CloudHost invoice #2048** — due in 3 days
- **Update OKR scores** — needed before Thursday 2pm leadership sync
- **Follow up with 3 enterprise leads** — warm intros, reach out within 48h

### Watching
- GitHub Actions quota at 85% — review CI workflows soon
- Q2 offsite RSVP due Friday
- Alex Wong partnership call — decide whether to respond

### Summary
20 emails processed — 11 action, 5 awareness, 3 ignored, 2 uncertain. 12 tasks extracted across 5 projects under 2 identities.`
}

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d }
function hoursAgo(n: number) { return new Date(Date.now() - n * 3600_000) }
function daysFromNow(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d }
function hashToken(token: string) { return crypto.createHash('sha256').update(token).digest('hex') }
function nextWeekday(target: number) { const d = new Date(); let diff = (target - d.getDay() + 7) % 7; if (!diff) diff = 7; d.setDate(d.getDate() + diff); return d }
function todayAt(h: number, m: number) { const d = new Date(); d.setHours(h, m, 0, 0); return d }
function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }
function endOfDay(d: Date)   { const r = new Date(d); r.setHours(23, 59, 59, 999); return r }

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
