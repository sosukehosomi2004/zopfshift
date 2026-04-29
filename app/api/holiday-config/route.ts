import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const updateSchema = z.object({
  fiscalYear: z.number().int(),
  months: z.array(z.object({
    month: z.number().int().min(1).max(12),
    holidayCount: z.number().int().min(0),
  })).length(12),
})

// GET /api/holiday-config?fiscalYear=2026
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const fiscalYear = parseInt(searchParams.get('fiscalYear') ?? new Date().getFullYear().toString())

  const configs = await prisma.monthlyHolidayConfig.findMany({
    where: { fiscalYear },
    orderBy: { month: 'asc' },
  })

  return NextResponse.json({ fiscalYear, months: configs })
}

// PUT /api/holiday-config - 年度の公休数一括設定
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { fiscalYear, months } = parsed.data

  for (const m of months) {
    await prisma.monthlyHolidayConfig.upsert({
      where: { fiscalYear_month: { fiscalYear, month: m.month } },
      update: { holidayCount: m.holidayCount },
      create: { fiscalYear, month: m.month, holidayCount: m.holidayCount },
    })
  }

  const configs = await prisma.monthlyHolidayConfig.findMany({
    where: { fiscalYear },
    orderBy: { month: 'asc' },
  })

  return NextResponse.json({ fiscalYear, months: configs })
}
