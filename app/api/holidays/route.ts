import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const bulkSchema = z.object({
  holidays: z.array(z.object({
    date: z.string(), // YYYY-MM-DD
    name: z.string().min(1),
  })),
})

// GET /api/holidays?year=2026
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? new Date().getFullYear().toString())

  const start = new Date(`${year}-01-01`)
  const end = new Date(`${year}-12-31`)

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(holidays)
}

// PUT /api/holidays - 祝日一括登録
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  for (const h of parsed.data.holidays) {
    const date = new Date(h.date)
    await prisma.holiday.upsert({
      where: { date },
      update: { name: h.name },
      create: { date, name: h.name },
    })
  }

  return NextResponse.json({ success: true, count: parsed.data.holidays.length })
}
