import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { expandRecurringRules } from '@/lib/expand-recurring-rules'

type Params = { params: Promise<{ id: string }> }

// GET /api/shift-periods/[id]/pre-assignments - 事前確定一覧
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // DRAFT期間ならルールを自動展開 (新しいルールがあれば PreAssignment に反映)
  // expandRecurringRules は idempotent (既存セルは保持) かつ申請優先
  const period = await prisma.shiftPeriod.findUnique({ where: { id } })
  if (period?.status === 'DRAFT') {
    await expandRecurringRules(id)
  }

  const preAssignments = await prisma.preAssignment.findMany({
    where: { shiftPeriodId: id },
    include: {
      employee: {
        select: {
          id: true,
          employeeNumber: true,
          lastName: true,
          firstName: true,
          employmentType: true,
          primaryWorkplace: true,
        },
      },
    },
    orderBy: [{ date: 'asc' }],
  })

  return NextResponse.json(preAssignments)
}

// PATCH /api/shift-periods/[id]/pre-assignments - セル更新
const patchSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  workplace: z.enum(['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER']).nullable(),
  memo: z.string().max(1).optional().nullable(),
  // 削除（事前確定をクリア）
  clear: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { employeeId, date, workplace, memo, clear } = parsed.data
  const dateObj = new Date(date)

  if (clear) {
    // 事前確定を取り消す: PreAssignment削除 + Exclusionを記録 (再自動展開を防止)
    await prisma.preAssignment.deleteMany({
      where: { shiftPeriodId: id, employeeId, date: dateObj },
    })
    await prisma.preAssignmentExclusion.upsert({
      where: {
        shiftPeriodId_employeeId_date: {
          shiftPeriodId: id,
          employeeId,
          date: dateObj,
        },
      },
      update: {},
      create: { shiftPeriodId: id, employeeId, date: dateObj },
    })
  } else {
    // PreAssignment作成 → Exclusionが残っていれば解除
    await prisma.preAssignmentExclusion.deleteMany({
      where: { shiftPeriodId: id, employeeId, date: dateObj },
    })
    await prisma.preAssignment.upsert({
      where: {
        shiftPeriodId_employeeId_date: {
          shiftPeriodId: id,
          employeeId,
          date: dateObj,
        },
      },
      update: { workplace, memo: memo ?? null },
      create: {
        shiftPeriodId: id,
        employeeId,
        date: dateObj,
        workplace,
        memo: memo ?? null,
      },
    })
  }

  return NextResponse.json({ success: true })
}
