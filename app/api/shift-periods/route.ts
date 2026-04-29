import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const createSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
})

// GET /api/shift-periods
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const periods = await prisma.shiftPeriod.findMany({
    orderBy: { startDate: 'desc' },
    include: { _count: { select: { candidates: true } } },
  })

  return NextResponse.json(periods)
}

// POST /api/shift-periods - シフト期間作成
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

  const { year, month } = parsed.data

  // 期間: month月21日 〜 (month+1)月20日
  const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-21`)
  let endYear = year
  let endMonth = month + 1
  if (endMonth > 12) {
    endMonth = 1
    endYear++
  }
  const endDate = new Date(`${endYear}-${String(endMonth).padStart(2, '0')}-20`)

  const label = `${endYear}年${endMonth}月度`

  // 重複チェック
  const existing = await prisma.shiftPeriod.findFirst({
    where: { startDate, endDate },
  })
  if (existing) {
    return NextResponse.json({ error: 'この期間のシフトは既に存在します' }, { status: 409 })
  }

  const period = await prisma.shiftPeriod.create({
    data: { startDate, endDate, label },
  })

  return NextResponse.json(period, { status: 201 })
}
