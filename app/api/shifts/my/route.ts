import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// GET /api/shifts/my?startDate=&endDate= - 自分の確定済みシフト
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  // 確定済みシフト期間の、選択された候補の割当を取得
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      employeeId: session.user.id,
      shiftCandidate: {
        isSelected: true,
        shiftPeriod: { status: 'CONFIRMED' },
      },
      ...(startDate && endDate ? {
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      } : {}),
    },
    select: {
      date: true,
      workplace: true,
    },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(assignments)
}
