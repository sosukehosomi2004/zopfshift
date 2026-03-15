import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userStores = await prisma.userStore.findMany({
    where: { storeId: params.storeId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          nameKana: true,
          email: true,
          role: true,
          avatarUrl: true,
          phone: true,
          createdAt: true,
        },
      },
    },
    orderBy: { user: { name: 'asc' } },
  })

  // 月間シフト時間を集計
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const shifts = await prisma.shift.findMany({
    where: {
      storeId: params.storeId,
      date: { gte: startOfMonth, lte: endOfMonth },
      userId: { in: userStores.map((us: { userId: string }) => us.userId) },
    },
  })

  const shiftMinutes = new Map<string, number>()
  for (const shift of shifts) {
    const [sh, sm] = shift.startTime.split(':').map(Number)
    const [eh, em] = shift.endTime.split(':').map(Number)
    const worked = (eh * 60 + em) - (sh * 60 + sm) - shift.breakTime
    shiftMinutes.set(shift.userId, (shiftMinutes.get(shift.userId) ?? 0) + worked)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = userStores.map((us: any) => ({
    ...us.user,
    storeRole: us.role,
    color: us.color,
    maxHours: us.maxHours,
    minHours: us.minHours,
    monthlyMinutes: shiftMinutes.get(us.userId) ?? 0,
  }))

  return NextResponse.json(result)
}

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
  color: z.string().default('#718096'),
})

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, email, role, color } = parsed.data

  // 既存ユーザーか確認
  let user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    // 仮パスワードで作成（実際はメール招待に変更）
    const tempPassword = await bcrypt.hash('password123', 10)
    user = await prisma.user.create({
      data: { name, email, password: tempPassword, role: 'STAFF' },
    })
  }

  // 既にこの店舗に所属しているか確認
  const existing = await prisma.userStore.findUnique({
    where: { userId_storeId: { userId: user.id, storeId: params.storeId } },
  })
  if (existing) {
    return NextResponse.json({ error: 'このスタッフはすでに登録されています' }, { status: 409 })
  }

  await prisma.userStore.create({
    data: { userId: user.id, storeId: params.storeId, role, color },
  })

  return NextResponse.json({ ok: true, userId: user.id }, { status: 201 })
}
