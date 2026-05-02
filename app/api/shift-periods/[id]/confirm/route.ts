import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const confirmSchema = z.object({
  candidateId: z.string(),
})

type Params = { params: Promise<{ id: string }> }

// POST /api/shift-periods/[id]/confirm - 候補を選んで確定
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { candidateId } = parsed.data

  const candidate = await prisma.shiftCandidate.findUnique({ where: { id: candidateId } })
  if (!candidate || candidate.shiftPeriodId !== id) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  // 選択した候補をマーク
  await prisma.shiftCandidate.update({
    where: { id: candidateId },
    data: { isSelected: true },
  })

  // 選ばれなかった候補は削除（assignmentsもCascadeで消える）
  await prisma.shiftCandidate.deleteMany({
    where: {
      shiftPeriodId: id,
      id: { not: candidateId },
    },
  })

  // シフト期間を確定
  await prisma.shiftPeriod.update({
    where: { id },
    data: { status: 'CONFIRMED' },
  })

  return NextResponse.json({ success: true })
}
