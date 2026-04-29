import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const updateSkillsSchema = z.object({
  skillIds: z.array(z.string()),
})

type Params = { params: Promise<{ id: string }> }

// PUT /api/employees/[id]/skills - スキル一括更新
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = updateSkillsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // 全削除→再作成
  await prisma.employeeSkill.deleteMany({ where: { employeeId: id } })

  if (parsed.data.skillIds.length > 0) {
    await prisma.employeeSkill.createMany({
      data: parsed.data.skillIds.map((skillId) => ({ employeeId: id, skillId })),
    })
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { skills: { include: { skill: true } } },
  })

  return NextResponse.json(employee)
}
