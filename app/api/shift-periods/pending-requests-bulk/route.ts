import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// GET /api/shift-periods/pending-requests-bulk?ids=id1,id2,id3
// 複数期間にまたがる PENDING 申請を返す
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const idsParam = req.nextUrl.searchParams.get('ids')
  if (!idsParam) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }
  const ids = idsParam.split(',').filter(Boolean)
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  const periods = await prisma.shiftPeriod.findMany({
    where: { id: { in: ids } },
    select: { id: true, label: true, startDate: true, endDate: true },
  })

  // 各期間の PENDING 申請をまとめて返す（期間の startDate/endDate でフィルタ）
  const result: Array<{
    periodId: string
    periodLabel: string
    requests: Array<{
      id: string
      date: string
      type: string
      memo: string | null
      status: string
      createdAt: string
      employee: { id: string; lastName: string; firstName: string; primaryWorkplace: string }
    }>
  }> = []

  for (const p of periods) {
    const requests = await prisma.dayOffRequest.findMany({
      where: {
        status: 'PENDING',
        date: { gte: p.startDate, lte: p.endDate },
      },
      include: {
        employee: {
          select: { id: true, lastName: true, firstName: true, primaryWorkplace: true },
        },
      },
      orderBy: [{ date: 'asc' }],
    })
    result.push({
      periodId: p.id,
      periodLabel: p.label,
      requests: requests.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
        type: r.type,
        memo: r.memo,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        employee: r.employee,
      })),
    })
  }

  return NextResponse.json(result)
}
