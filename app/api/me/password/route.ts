import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'パスワードは6文字以上で入力してください'),
})

// PATCH /api/me/password - 自分のパスワード変更
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { currentPassword, newPassword } = parsed.data

  const employee = await prisma.employee.findUnique({ where: { id: session.user.id } })
  if (!employee) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
  }

  const valid = await bcrypt.compare(currentPassword, employee.password)
  if (!valid) {
    return NextResponse.json({ error: '現在のパスワードが正しくありません' }, { status: 400 })
  }

  if (currentPassword === newPassword) {
    return NextResponse.json({ error: '新しいパスワードは現在のパスワードと異なるものにしてください' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.employee.update({
    where: { id: employee.id },
    data: { password: hashed, mustChangePassword: false },
  })

  return NextResponse.json({ success: true })
}
