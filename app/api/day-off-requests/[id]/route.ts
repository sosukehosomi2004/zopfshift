import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { getFiscalMonthFromDate } from '@/lib/period-month'

const updateSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
})

type Params = { params: Promise<{ id: string }> }

// PATCH /api/day-off-requests/[id] - 管理者による承認/却下
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const before = await prisma.dayOffRequest.findUnique({ where: { id } })
  if (!before) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.dayOffRequest.update({
    where: { id },
    data: { status: parsed.data.status },
  })

  // 承認 → 却下/PENDING に変更: 承認で生成された事前確定セルを取り消す
  // 該当日・該当従業員の workplace=null セルを削除 (申請由来のセルのみ。memo の値で識別可)
  let revertedPreAssignments = 0
  if (before.status === 'APPROVED' && parsed.data.status !== 'APPROVED') {
    const memoMatch = before.type === 'PAID_LEAVE' ? '有' : null
    const reverted = await prisma.preAssignment.deleteMany({
      where: {
        employeeId: updated.employeeId,
        date: updated.date,
        workplace: null,
        memo: memoMatch,
      },
    })
    revertedPreAssignments = reverted.count
  }

  // 承認時: 既存の確定済みシフトと事前確定セルに反映
  let updatedAssignments = 0
  let upsertedPreAssignments = 0
  if (parsed.data.status === 'APPROVED') {
    // 1) ShiftAssignment: workplace !== null (出勤) のものを 休み に変更
    const conflictingAssignments = await prisma.shiftAssignment.findMany({
      where: {
        employeeId: updated.employeeId,
        date: updated.date,
        workplace: { not: null },
      },
    })
    for (const a of conflictingAssignments) {
      if (a.memo) {
        await prisma.shiftAssignment.update({
          where: { id: a.id },
          data: { workplace: null, workplaceSlotId: null, isMoved: true },
        })
      } else {
        await prisma.shiftAssignment.delete({ where: { id: a.id } })
      }
      updatedAssignments++
    }

    // 2) PreAssignment: 該当日を含む全シフト期間に「休み」確定セルを upsert
    const periods = await prisma.shiftPeriod.findMany({
      where: {
        startDate: { lte: updated.date },
        endDate: { gte: updated.date },
      },
      select: { id: true },
    })
    // セル表記は規約上「有」(有休) または null (公休→"/"表示) のみ。
    // 申請者のメモ内容はシフト表に出さない (申請管理画面で確認する想定)。
    const memo = updated.type === 'PAID_LEAVE' ? '有' : null
    for (const p of periods) {
      // Exclusion が残っていれば解除 (申請承認は強い意思表示なので優先)
      await prisma.preAssignmentExclusion.deleteMany({
        where: {
          shiftPeriodId: p.id,
          employeeId: updated.employeeId,
          date: updated.date,
        },
      })
      await prisma.preAssignment.upsert({
        where: {
          shiftPeriodId_employeeId_date: {
            shiftPeriodId: p.id,
            employeeId: updated.employeeId,
            date: updated.date,
          },
        },
        update: { workplace: null, memo },
        create: {
          shiftPeriodId: p.id,
          employeeId: updated.employeeId,
          date: updated.date,
          workplace: null,
          memo,
        },
      })
      upsertedPreAssignments++
    }
  }

  return NextResponse.json({
    ...updated,
    updatedAssignments,
    updatedPreAssignments: upsertedPreAssignments,
    revertedPreAssignments,
  })
}

// DELETE /api/day-off-requests/[id] - 申請取り消し（PENDING時のみ）
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.dayOffRequest.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // スタッフは自分の申請のみ、かつPENDINGのみ、かつ締切前のみ取り消し可能
  if (session.user.role === 'STAFF') {
    if (existing.employeeId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (existing.status !== 'PENDING') {
      return NextResponse.json({ error: 'Cannot cancel non-pending request' }, { status: 400 })
    }
    const { fiscalYear, month } = getFiscalMonthFromDate(existing.date)
    const window = await prisma.requestWindow.findUnique({
      where: { fiscalYear_month: { fiscalYear, month } },
    })
    if (window && window.deadline.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: `${fiscalYear}年${month}月度の申請締切を過ぎているため取り消しできません` },
        { status: 400 },
      )
    }
  }

  await prisma.dayOffRequest.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
