import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// GET /api/shift-periods/[id]/pending-requests - 期間内の申請（全ステータス）
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const period = await prisma.shiftPeriod.findUnique({ where: { id } })
  if (!period) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const requests = await prisma.dayOffRequest.findMany({
    where: {
      date: { gte: period.startDate, lte: period.endDate },
    },
    include: {
      employee: {
        select: { id: true, lastName: true, firstName: true, primaryWorkplace: true },
      },
    },
    orderBy: [{ status: 'asc' }, { date: 'asc' }],
  })

  return NextResponse.json(requests)
}
