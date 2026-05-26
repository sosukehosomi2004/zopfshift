import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

type SnapshotEntry = {
  employeeId: string
  date: string // YYYY-MM-DD
  workplace: 'FACTORY' | 'CAFE' | 'FLOOR' | 'L' | 'OFFICE' | 'OTHER' | null
  memo: string | null
  color: string | null
}

// POST /api/shift-periods/[id]/to-draft
// ADJUSTING / CONFIRMED → DRAFT。候補シフトを削除して再編集可能にする。
// シフト生成押下前にスナップショットされた draftSnapshot から PreAssignment を復元する。
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const period = await prisma.shiftPeriod.findUnique({ where: { id } })
  if (!period) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ShiftCandidate を削除 (Cascade で ShiftAssignment も削除)
  await prisma.shiftCandidate.deleteMany({ where: { shiftPeriodId: id } })

  // 現在の PreAssignment を全削除し、スナップショットから復元
  const snapshot = (period.draftSnapshot ?? null) as SnapshotEntry[] | null
  if (snapshot && Array.isArray(snapshot)) {
    await prisma.preAssignment.deleteMany({ where: { shiftPeriodId: id } })
    if (snapshot.length > 0) {
      await prisma.preAssignment.createMany({
        data: snapshot.map((s) => ({
          shiftPeriodId: id,
          employeeId: s.employeeId,
          date: new Date(s.date),
          workplace: s.workplace,
          memo: s.memo,
          color: s.color,
        })),
      })
    }
  }

  await prisma.shiftPeriod.update({
    where: { id },
    data: { status: 'DRAFT' },
  })

  return NextResponse.json({ success: true, restoredCount: snapshot?.length ?? 0 })
}
