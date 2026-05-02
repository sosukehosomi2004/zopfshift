import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// POST /api/shift-periods/[id]/finalize - シフト確定 (ADJUSTING → CONFIRMED)
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
  if (period.status !== 'ADJUSTING') {
    return NextResponse.json(
      { error: '手動調整中のシフトのみ確定できます' },
      { status: 400 },
    )
  }

  await prisma.shiftPeriod.update({
    where: { id },
    data: { status: 'CONFIRMED' },
  })

  return NextResponse.json({ success: true })
}
