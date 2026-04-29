import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// GET /api/shift-periods/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const period = await prisma.shiftPeriod.findUnique({
    where: { id },
    include: {
      candidates: {
        orderBy: { candidateIndex: 'asc' },
        include: { _count: { select: { assignments: true } } },
      },
    },
  })

  if (!period) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(period)
}
