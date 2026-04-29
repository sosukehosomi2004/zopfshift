import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// GET /api/skills - スキル一覧
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const workplace = searchParams.get('workplace')

  const where: Record<string, unknown> = {}
  if (workplace) where.workplace = workplace

  const skills = await prisma.skill.findMany({
    where,
    orderBy: [{ workplace: 'asc' }, { sortOrder: 'asc' }],
  })

  return NextResponse.json(skills)
}
