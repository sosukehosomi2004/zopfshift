import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

// GET /api/staffing-rules - 勤務場所×曜日タイプの稼働人数ルール一覧
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const rules = await prisma.workplaceStaffingRule.findMany({
    orderBy: [{ workplace: 'asc' }, { dayType: 'asc' }],
  })
  return NextResponse.json(rules)
}

// PUT /api/staffing-rules - 一括更新
const putSchema = z.object({
  rules: z.array(
    z.object({
      workplace: z.enum(['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER']),
      dayType: z.enum(['WEEKDAY_MON_THU', 'FRIDAY', 'HOLIDAY']),
      requiredCount: z.number().int().min(0).max(99),
      minFullTimeCount: z.number().int().min(0).max(99).nullable().optional(),
      baseFullTimeCount: z.number().int().min(0).max(99).nullable().optional(),
    }),
  ),
})

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  for (const r of parsed.data.rules) {
    await prisma.workplaceStaffingRule.upsert({
      where: { workplace_dayType: { workplace: r.workplace, dayType: r.dayType } },
      update: {
        requiredCount: r.requiredCount,
        minFullTimeCount: r.minFullTimeCount ?? null,
        baseFullTimeCount: r.baseFullTimeCount ?? null,
      },
      create: {
        workplace: r.workplace,
        dayType: r.dayType,
        requiredCount: r.requiredCount,
        minFullTimeCount: r.minFullTimeCount ?? null,
        baseFullTimeCount: r.baseFullTimeCount ?? null,
      },
    })
  }
  return NextResponse.json({ success: true, count: parsed.data.rules.length })
}
