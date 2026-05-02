import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const { auth } = NextAuth(authConfig)

const PUBLIC_PATHS = ['/login', '/signup']
const STAFF_PATHS = ['/staff/myshift', '/staff/request']
const FORCE_CHANGE_PATH = '/account/change-password'

export default auth((req: NextRequest & { auth: { user?: { role?: string; mustChangePassword?: boolean } } | null }) => {
  const { pathname } = req.nextUrl

  // 公開ページはスキップ
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 未ログイン → ログインページへ
  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // 強制パスワード変更が必要 → 専用ページへ
  const mustChange = req.auth?.user?.mustChangePassword === true
  if (mustChange && !pathname.startsWith(FORCE_CHANGE_PATH)) {
    return NextResponse.redirect(new URL(FORCE_CHANGE_PATH, req.url))
  }
  // 変更済みなのに強制ページへアクセス → 通常画面へ
  if (!mustChange && pathname.startsWith(FORCE_CHANGE_PATH)) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const role = req.auth?.user?.role ?? null
  const isStaff = role === 'STAFF'
  const isAdmin = role === 'ADMIN'

  // STAFFが管理者ページにアクセス → マイシフトへ
  if (isStaff && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/staff/myshift', req.url))
  }

  // ADMINがスタッフ専用ページにアクセス → シフト管理へ
  if (isAdmin && STAFF_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/dashboard/shift-periods', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
