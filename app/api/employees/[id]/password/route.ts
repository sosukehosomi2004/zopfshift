import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const schema = z.object({
  newPassword: z.string().min(6, 'パスワードは6文字以上で入力してください'),
})

type Params = { params: Promise<{ id: string }> }

// PATCH /api/employees/[id]/password - 管理者によるパスワードリセット
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const employee = await prisma.employee.findUnique({ where: { id } })
  if (!employee) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 10)
  await prisma.employee.update({
    where: { id },
    data: { password: hashed, mustChangePassword: true },
  })

  return NextResponse.json({ success: true })
}
