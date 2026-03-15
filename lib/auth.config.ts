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
    jwt({ token, user }) {
      if (user && 'role' in user) {
        token.id = user.id
        token.role = user.role as string
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
}
