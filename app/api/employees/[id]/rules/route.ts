import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { expandRecurringRules } from '@/lib/expand-recurring-rules'

type Params = { params: Promise<{ id: string }> }

const createSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    dayCategory: z.enum(['HOLIDAY', 'WEEKEND_OR_HOLIDAY', 'WEEKDAY']).nullable().optional(),
    excludeHolidays: z.boolean().nullable().optional(),
    ruleType: z.enum(['ALWAYS_OFF', 'ALWAYS_WORK']),
    workplace: z.enum(['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER']).nullable().optional(),
    memo: z.string().max(100).nullable().optional(),
  })
  .refine(
    (v) =>
      (v.dayOfWeek !== null && v.dayOfWeek !== undefined) !==
      (v.dayCategory !== null && v.dayCategory !== undefined),
    { message: 'dayOfWeek または dayCategory のどちらか一方をセットしてください' },
  )
  .refine(
    (v) =>
      v.dayOfWeek === null || v.dayOfWeek === undefined ||
      (v.excludeHolidays === true || v.excludeHolidays === false),
    { message: '曜日指定時は excludeHolidays (祝日扱い) を指定してください' },
  )
  .refine(
    (v) => v.ruleType !== 'ALWAYS_OFF' || !v.workplace,
    { message: 'ALWAYS_OFFのときは workplace は不要です' },
  )

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const rules = await prisma.employeeRecurringRule.findMany({
    where: { employeeId: id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(rules)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
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
  const rule = await prisma.employeeRecurringRule.create({
    data: {
      employeeId: id,
      dayOfWeek: data.dayOfWeek ?? null,
      dayCategory: data.dayCategory ?? null,
      excludeHolidays: data.excludeHolidays ?? null,
      ruleType: data.ruleType,
      workplace: data.workplace ?? null,
      memo: data.memo ?? null,
    },
  })

  // 全DRAFT期間にこのルールを自動展開 (申請優先、既存セルは保持)
  const draftPeriods = await prisma.shiftPeriod.findMany({
    where: { status: 'DRAFT' },
    select: { id: true },
  })
  for (const p of draftPeriods) {
    await expandRecurringRules(p.id)
  }

  return NextResponse.json(rule, { status: 201 })
}
