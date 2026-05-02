import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// GET /api/workplace-slots - 勤務場所スロット定義一覧 (読み取り専用)
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const slots = await prisma.workplaceSlot.findMany({
    orderBy: [{ workplace: 'asc' }, { sortOrder: 'asc' }],
    include: {
      skills: { include: { skill: true } },
      rules: true,
    },
  })
  return NextResponse.json(slots)
}
