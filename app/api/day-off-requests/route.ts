import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { getFiscalMonthFromDate } from '@/lib/period-month'

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

  // 締切チェック: 該当日が属する月度のRequestWindowを探し、deadlineを過ぎていれば拒否
  const { fiscalYear, month } = getFiscalMonthFromDate(date)
  const window = await prisma.requestWindow.findUnique({
    where: { fiscalYear_month: { fiscalYear, month } },
  })
  // ADMIN は締切無視で作成可能 (代理申請)
  if (session.user.role !== 'ADMIN') {
    if (!window) {
      return NextResponse.json(
        { error: `${fiscalYear}年${month}月度の申請受付ウィンドウがまだ開設されていません` },
        { status: 400 },
      )
    }
    if (window.deadline.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: `${fiscalYear}年${month}月度の申請締切を過ぎています` },
        { status: 400 },
      )
    }
    // 容量制限・連続禁止・申請禁止指定は撤去（労基法上の有休権侵害になりうるため）。
    // 締切のみチェック。容量に達しても申請はブロックせず、UI 側で警告のみ表示する。
  }

  const request = await prisma.dayOffRequest.create({
    data: {
      employeeId: session.user.id,
      date,
      type: parsed.data.type,
      memo: parsed.data.memo,
    },
  })

  // 新規申請 (PENDING) も即時に PreAssignment(休み) として下書きに反映
  // PAID_LEAVE は memo='有'、DAY_OFF は memo=null
  const memo = parsed.data.type === 'PAID_LEAVE' ? '有' : null
  const periods = await prisma.shiftPeriod.findMany({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true },
  })
  for (const p of periods) {
    await prisma.preAssignmentExclusion.deleteMany({
      where: { shiftPeriodId: p.id, employeeId: session.user.id, date },
    })
    await prisma.preAssignment.upsert({
      where: {
        shiftPeriodId_employeeId_date: {
          shiftPeriodId: p.id,
          employeeId: session.user.id,
          date,
        },
      },
      update: { workplace: null, memo },
      create: {
        shiftPeriodId: p.id,
        employeeId: session.user.id,
        date,
        workplace: null,
        memo,
      },
    })
  }

  return NextResponse.json(request, { status: 201 })
}
