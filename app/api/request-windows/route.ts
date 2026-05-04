import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { computeDefaultDeadline, getFiscalMonthFromDate } from '@/lib/period-month'

// GET /api/request-windows - 申請受付ウィンドウ一覧 (各ウィンドウの日別申請数を含む)
// 取得時に「現月度から12ヶ月分」のウィンドウを自動作成 (idempotent)
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 12ヶ月分の自動補充 (現月度から先12ヶ月)
  const now = getFiscalMonthFromDate(new Date())
  for (let i = 0; i < 12; i++) {
    let m = now.month + i
    let y = now.fiscalYear
    while (m > 12) { m -= 12; y += 1 }
    const exists = await prisma.requestWindow.findUnique({
      where: { fiscalYear_month: { fiscalYear: y, month: m } },
    })
    if (!exists) {
      await prisma.requestWindow.create({
        data: {
          fiscalYear: y,
          month: m,
          deadline: computeDefaultDeadline(y, m),
        },
      })
    }
  }

  const windows = await prisma.requestWindow.findMany({
    orderBy: [{ fiscalYear: 'desc' }, { month: 'desc' }],
  })

  // 各ウィンドウの期間内の日別申請数を集計
  const result = await Promise.all(
    windows.map(async (w) => {
      const startMonth = w.month === 1 ? 12 : w.month - 1
      const startYear = w.month === 1 ? w.fiscalYear - 1 : w.fiscalYear
      const start = new Date(`${startYear}-${String(startMonth).padStart(2, '0')}-21`)
      const end = new Date(`${w.fiscalYear}-${String(w.month).padStart(2, '0')}-20`)
      const requests = await prisma.dayOffRequest.findMany({
        where: {
          date: { gte: start, lte: end },
          status: { in: ['PENDING', 'APPROVED'] },
        },
        select: { date: true },
      })
      const dayCounts: Record<string, number> = {}
      for (const r of requests) {
        const k = r.date.toISOString().split('T')[0]
        dayCounts[k] = (dayCounts[k] ?? 0) + 1
      }
      return { ...w, dayCounts }
    }),
  )
  return NextResponse.json(result)
}

const createSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  deadline: z.string(), // ISO datetime string
})

// POST /api/request-windows - 受付ウィンドウ作成
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data
  const deadline = new Date(data.deadline)
  if (isNaN(deadline.getTime())) {
    return NextResponse.json({ error: 'deadline が正しくありません' }, { status: 400 })
  }
  const existing = await prisma.requestWindow.findUnique({
    where: { fiscalYear_month: { fiscalYear: data.fiscalYear, month: data.month } },
  })
  if (existing) {
    return NextResponse.json({ error: 'この月の受付ウィンドウは既に存在します' }, { status: 409 })
  }
  const window = await prisma.requestWindow.create({
    data: { fiscalYear: data.fiscalYear, month: data.month, deadline },
  })
  return NextResponse.json(window, { status: 201 })
}
