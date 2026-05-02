import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth-password'
import { setSessionCookie } from '@/lib/auth-token'
import { createUserSession } from '@/lib/auth-sessions'

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        passwordHash,
      },
    })

    const { rawToken } = await createUserSession({
      userId: user.id,
      userEmail: user.email,
      request: req,
      sendNewDeviceAlert: false,
    })
    await setSessionCookie(rawToken)

    return NextResponse.json({
      success: true,
      data: { id: user.id, email: user.email, name: user.name },
    })
  } catch (err) {
    console.error('[api/auth/register]', err)
    return NextResponse.json(
      { success: false, error: 'Registration failed' },
      { status: 500 }
    )
  }
}
