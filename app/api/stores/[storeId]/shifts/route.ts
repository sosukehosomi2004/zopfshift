import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const shiftSchema = z.object({
  userId: z.string(),
  positionId: z.string().optional().nullable(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  breakTime: z.number().int().min(0).default(60),
  memo: z.string().optional().nullable(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'ABSENT']).default('CONFIRMED'),
})

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  const shifts = await prisma.shift.findMany({
    where: {
      storeId: params.storeId,
      date: { gte: startDate, lte: endDate },
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      position: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  return NextResponse.json(shifts)
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = shiftSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { date, startTime, endTime, breakTime } = parsed.data

  // バリデーション: 終了 > 開始
  if (startTime >= endTime) {
    return NextResponse.json({ error: '終了時間は開始時間より後にしてください' }, { status: 400 })
  }

  // バリデーション: 休憩時間が勤務時間を超えないこと
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const workMinutes = (eh * 60 + em) - (sh * 60 + sm)
  if (breakTime >= workMinutes) {
    return NextResponse.json({ error: '休憩時間が勤務時間を超えています' }, { status: 400 })
  }

  const shift = await prisma.shift.create({
    data: {
      storeId: params.storeId,
      userId: parsed.data.userId,
      positionId: parsed.data.positionId ?? null,
      date: new Date(date),
      startTime,
      endTime,
      breakTime,
      memo: parsed.data.memo ?? null,
      status: parsed.data.status,
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      position: { select: { id: true, name: true, color: true } },
    },
  })

  return NextResponse.json(shift, { status: 201 })
}
