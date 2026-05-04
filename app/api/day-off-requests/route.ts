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

    const dateStr = parsed.data.date
    // 祝日扱い判定 (土日 or 祝日テーブルにある日)
    const dow = date.getDay()
    const holiday = await prisma.holiday.findFirst({ where: { date } })
    const isHolidayLike = dow === 0 || dow === 6 || !!holiday

    // 日別上書き取得
    const overrides = (window.dayOverrides as Record<string, { capacity?: number; blocked?: boolean }>) ?? {}
    const dayConfig = overrides[dateStr]

    // ブロック日チェック
    if (dayConfig?.blocked) {
      return NextResponse.json({ error: 'この日は申請不可に設定されています' }, { status: 400 })
    }

    // キャパシティチェック
    const capacity = dayConfig?.capacity ?? (isHolidayLike ? window.holidayCapacity : window.weekdayCapacity)
    const existingCount = await prisma.dayOffRequest.count({
      where: { date, status: { in: ['PENDING', 'APPROVED'] } },
    })
    if (existingCount >= capacity) {
      return NextResponse.json(
        { error: `この日は満員です (${existingCount}/${capacity}名)` },
        { status: 400 },
      )
    }

    // 連続禁止チェック
    const blocks = (window.consecutiveBlocks as Array<{ startDate: string; endDate: string }>) ?? []
    for (const block of blocks) {
      // 申請日がこの範囲内か?
      if (dateStr < block.startDate || dateStr > block.endDate) continue
      // 前後の日が同じ範囲内 + 同じ従業員の申請があるか?
      const prevDate = new Date(date)
      prevDate.setDate(prevDate.getDate() - 1)
      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)
      const prevDateStr = prevDate.toISOString().split('T')[0]
      const nextDateStr = nextDate.toISOString().split('T')[0]
      const adjacent: string[] = []
      if (prevDateStr >= block.startDate && prevDateStr <= block.endDate) adjacent.push(prevDateStr)
      if (nextDateStr >= block.startDate && nextDateStr <= block.endDate) adjacent.push(nextDateStr)
      if (adjacent.length === 0) continue
      const conflict = await prisma.dayOffRequest.findFirst({
        where: {
          employeeId: session.user.id,
          date: { in: adjacent.map((d) => new Date(d)) },
          status: { in: ['PENDING', 'APPROVED'] },
        },
      })
      if (conflict) {
        return NextResponse.json(
          { error: `${block.startDate}〜${block.endDate} の期間内では連続した日への申請はできません` },
          { status: 400 },
        )
      }
    }
  }

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
