import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendPasswordResetEmail(to: string, resetLink: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject: 'Reset your EmailFlow password',
    text: `You requested a password reset. Click the link below to set a new password (expires in 1 hour):\n\n${resetLink}\n\nIf you did not request this, you can ignore this email.`,
    html: `
      <p>You requested a password reset.</p>
      <p>Click the link below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  })
}

export async function sendPasswordSetupEmail(to: string, setupLink: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject: 'Set up your EmailFlow password',
    text: `You requested to set up a password for your EmailFlow account. Click the link below to create your password (expires in 1 hour):\n\n${setupLink}\n\nIf you did not request this, you can ignore this email.`,
    html: `
      <p>You requested to set up a password for your EmailFlow account.</p>
      <p>Click the link below to create your password. This link expires in <strong>1 hour</strong>.</p>
      <p><a href="${setupLink}">${setupLink}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  })
}

export async function sendSuspiciousActivityEmail(input: {
  to: string
  reason: 'rotated_token_replay'
  ipAddress: string
  deviceName: string
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: input.to,
    subject: 'Security alert: suspicious activity on your EmailFlow account',
    text: [
      'We detected suspicious activity on your account.',
      '',
      'An old session token was replayed after it had already been rotated. This may indicate that someone else has access to your session.',
      '',
      `Device: ${input.deviceName}`,
      `IP Address: ${input.ipAddress || 'Unavailable'}`,
      '',
      'For your protection, ALL active sessions have been signed out.',
      'Please sign in again and change your password if you did not initiate this.',
    ].join('\n'),
    html: `
      <p><strong>We detected suspicious activity on your account.</strong></p>
      <p>An old session token was replayed after it had already been rotated. This may indicate that someone else has access to your session.</p>
      <p><strong>Device:</strong> ${input.deviceName}</p>
      <p><strong>IP Address:</strong> ${input.ipAddress || 'Unavailable'}</p>
      <p>For your protection, <strong>all active sessions have been signed out</strong>.</p>
      <p>Please sign in again. If this wasn't you, change your password immediately.</p>
    `,
  })
}

export async function sendStepUpOtpEmail(input: {
  to: string
  otp: string
  action: string
}) {
  const actionLabel: Record<string, string> = {
    change_password: 'change your password',
    disable_totp: 'disable two-factor authentication',
    delete_account: 'delete your account',
  }
  const label = actionLabel[input.action] ?? 'perform a sensitive account action'

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: input.to,
    subject: 'Your EmailFlow verification code',
    text: [
      `Your verification code to ${label} is:`,
      '',
      `  ${input.otp}`,
      '',
      'This code expires in 10 minutes. Do not share it with anyone.',
      "If you didn't request this, you can ignore this email.",
    ].join('\n'),
    html: `
      <p>Your verification code to <strong>${label}</strong> is:</p>
      <p style="font-size:2rem;letter-spacing:0.25em;font-weight:bold">${input.otp}</p>
      <p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  })
}

export async function sendNewDeviceLoginEmail(input: {
  to: string
  loginTime: Date
  browser: string
  os: string
  ipAddress: string
  deviceName: string
}) {
  const loginTimeText = input.loginTime.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: input.to,
    subject: 'New device sign-in to your EmailFlow account',
    text: [
      'We noticed a sign-in from a new device.',
      '',
      `Time: ${loginTimeText}`,
      `Device: ${input.deviceName}`,
      `Browser: ${input.browser}`,
      `OS: ${input.os}`,
      `IP Address: ${input.ipAddress || 'Unavailable'}`,
      '',
      "If this was you, no action is needed. If this wasn't you, please reset your password and review active sessions immediately.",
    ].join('\n'),
    html: `
      <p>We noticed a sign-in from a new device.</p>
      <p><strong>Time:</strong> ${loginTimeText}</p>
      <p><strong>Device:</strong> ${input.deviceName}</p>
      <p><strong>Browser:</strong> ${input.browser}</p>
      <p><strong>OS:</strong> ${input.os}</p>
      <p><strong>IP Address:</strong> ${input.ipAddress || 'Unavailable'}</p>
      <p>If this was you, no action is needed. If this wasn't you, please reset your password and review active sessions immediately.</p>
    `,
  })
}
