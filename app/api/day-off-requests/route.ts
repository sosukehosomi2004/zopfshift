import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const createSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  type: z.enum(['DAY_OFF', 'PAID_LEAVE']),
  memo: z.string().optional(),
})

// GET /api/day-off-requests?employeeId=&status=&startDate=&endDate=
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get('employeeId')
  const status = searchParams.get('status')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const where: Record<string, unknown> = {}

  // スタッフは自分の申請のみ
  if (session.user.role === 'STAFF') {
    where.employeeId = session.user.id
  } else if (employeeId) {
    where.employeeId = employeeId
  }

  if (status) where.status = status
  if (startDate || endDate) {
    where.date = {}
    if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate)
    if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate)
  }

  const requests = await prisma.dayOffRequest.findMany({
    where,
    include: { employee: { select: { id: true, lastName: true, firstName: true, primaryWorkplace: true } } },
    orderBy: [{ date: 'asc' }],
  })

  return NextResponse.json(requests)
}

// POST /api/day-off-requests
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const date = new Date(parsed.data.date)

  const request = await prisma.dayOffRequest.create({
    data: {
      employeeId: session.user.id,
      date,
      type: parsed.data.type,
      memo: parsed.data.memo,
    },
  })

  return NextResponse.json(request, { status: 201 })
}
