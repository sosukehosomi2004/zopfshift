import type { NextAuthConfig } from 'next-auth'

// Edge Runtime で動作する設定（Prisma不使用）
export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const publicPaths = ['/', '/login', '/signup']
      const isPublic = publicPaths.includes(nextUrl.pathname)

      if (isPublic) return true
      if (!isLoggedIn) return false
      return true
    },
    jwt({ token, user, trigger, session }) {
      if (user && 'role' in user) {
        token.id = user.id
        token.role = user.role as string
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false
      }
      // session.update() でフラグを上書き可能 (パスワード変更後の解除に使う)
      if (trigger === 'update' && session?.mustChangePassword !== undefined) {
        token.mustChangePassword = session.mustChangePassword
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.mustChangePassword = (token.mustChangePassword as boolean | undefined) ?? false
      }
      return session
    },
  },
}
