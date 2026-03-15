import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getIO } from '@/lib/socket'
import { z } from 'zod'

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const userId = searchParams.get('userId') // スタッフ自身のフィルター用

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  const requests = await prisma.shiftRequest.findMany({
    where: {
      storeId: params.storeId,
      date: { gte: startDate, lte: endDate },
      ...(userId ? { userId } : {}),
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      segments: {
        include: { position: { select: { id: true, name: true, color: true } } },
        orderBy: { startTime: 'asc' },
      },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(requests)
}

const requestSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  memo: z.string().optional().nullable(),
})

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { date, startTime, endTime, memo } = parsed.data
  const dateObj = new Date(date)

  // 同一日・同一ユーザーの希望は上書き
  const existing = await prisma.shiftRequest.findFirst({
    where: {
      storeId: params.storeId,
      userId: session.user.id,
      date: { gte: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()),
               lte: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59) },
    },
  })

  let request
  if (existing) {
    request = await prisma.shiftRequest.update({
      where: { id: existing.id },
      data: { startTime, endTime, memo: memo ?? null, status: 'PENDING' },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    })
  } else {
    request = await prisma.shiftRequest.create({
      data: {
        storeId: params.storeId,
        userId: session.user.id,
        date: dateObj,
        startTime,
        endTime,
        memo: memo ?? null,
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    })
  }

  getIO()?.to(`store:${params.storeId}`).emit('request:new', request)

  return NextResponse.json(request, { status: 201 })
}
