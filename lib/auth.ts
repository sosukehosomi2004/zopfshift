import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authConfig } from '@/lib/auth.config'

const loginSchema = z.object({
  employeeNumber: z.string().min(1).max(20),
  password: z.string().min(6),
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { employeeNumber, password } = parsed.data

        const employee = await prisma.employee.findUnique({ where: { employeeNumber } })
        if (!employee || !employee.isActive) return null

        const isValid = await bcrypt.compare(password, employee.password)
        if (!isValid) return null

        return {
          id: employee.id,
          name: `${employee.lastName} ${employee.firstName}`,
          role: employee.role as string,
          mustChangePassword: employee.mustChangePassword,
        }
      },
    }),
  ],
})
