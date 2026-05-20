import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// POST /api/shift-periods/[id]/to-draft
// REVIEW / ADJUSTING / CONFIRMED → DRAFT。候補シフトを全削除して再編集可能にする。
// PreAssignment は保持 (これが下書きの本体)。
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

  await prisma.shiftPeriod.update({
    where: { id },
    data: { status: 'DRAFT' },
  })

  return NextResponse.json({ success: true })
}
