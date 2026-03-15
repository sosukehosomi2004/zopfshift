import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const { auth } = NextAuth(authConfig)

// 管理者専用パス
const MANAGER_PATHS = ['/dashboard']
// スタッフ専用パス
const STAFF_PATHS = ['/staff/myshift', '/staff/request']

export default auth((req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const { pathname } = req.nextUrl
  const role = req.auth?.user?.role ?? null

  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const isStaff = role === 'STAFF'
  const isManager = role === 'OWNER' || role === 'MANAGER'

  // STAFFが管理者ページにアクセス → マイシフトへ
  if (isStaff && MANAGER_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/staff/myshift', req.url))
  }

  // OWNER/MANAGERがスタッフ専用ページにアクセス → ダッシュボードへ
  if (isManager && STAFF_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
