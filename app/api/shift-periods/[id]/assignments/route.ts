import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

// PATCH /api/shift-periods/[id]/assignments
// 手動編集: 1セルを更新（出勤先変更 / 休みに / メモ更新 / 色更新）
const patchSchema = z.object({
  employeeId: z.string(),
  date: z.string(),
  workplace: z.enum(['FACTORY', 'CAFE', 'FLOOR', 'L', 'OFFICE', 'OTHER']).nullable(),
  workplaceSlotId: z.string().nullable().optional(),
  memo: z.string().max(1).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
})

type Params = { params: Promise<{ id: string }> }

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

  const { employeeId, date, workplace, workplaceSlotId, memo, color } = parsed.data

  const period = await prisma.shiftPeriod.findUnique({
    where: { id },
    include: {
      candidates: { where: { isSelected: true }, take: 1 },
    },
  })

  if (!period || period.status !== 'ADJUSTING') {
    return NextResponse.json(
      { error: '手動調整中のシフトのみ編集可能です (確定済みは確定取消が必要)' },
      { status: 400 },
    )
  }

  const candidate = period.candidates[0]
  if (!candidate) {
    return NextResponse.json({ error: '選択された候補がありません' }, { status: 400 })
  }

  const dateObj = new Date(date)

  const existing = await prisma.shiftAssignment.findUnique({
    where: {
      shiftCandidateId_employeeId_date: {
        shiftCandidateId: candidate.id,
        employeeId,
        date: dateObj,
      },
    },
  })

  // 休み（workplace=null）でもメモか色があればassignmentを保持
  if (workplace === null && !memo && !color) {
    if (existing) {
      await prisma.shiftAssignment.delete({ where: { id: existing.id } })
    }
  } else if (existing) {
    await prisma.shiftAssignment.update({
      where: { id: existing.id },
      data: {
        workplace,
        workplaceSlotId: workplaceSlotId ?? null,
        memo: memo ?? null,
        color: color ?? null,
        isMoved: true,
      },
    })
  } else {
    await prisma.shiftAssignment.create({
      data: {
        shiftCandidateId: candidate.id,
        employeeId,
        date: dateObj,
        workplace,
        workplaceSlotId: workplaceSlotId ?? null,
        memo: memo ?? null,
        color: color ?? null,
        isMoved: true,
      },
    })
  }

  return NextResponse.json({ success: true })
}
