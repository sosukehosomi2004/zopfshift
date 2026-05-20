import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const updateEmployeeSchema = z.object({
  lastName: z.string().min(1).optional(),
  firstName: z.string().optional(),
  lastNameRomaji: z.string().min(1).optional(),
  firstNameRomaji: z.string().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME']).optional(),
  primaryWorkplace: z.enum(['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER']).optional(),
  secondaryWorkplaces: z.array(z.enum(['FACTORY', 'CAFE', 'FLOOR'])).optional(),
  availableShiftTimes: z.array(z.enum(['EARLY', 'DAYTIME', 'CLOSE'])).optional(),
  isActive: z.boolean().optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  retiredAt: z.string().nullable().optional(), // YYYY-MM-DD or null
})

type Params = { params: Promise<{ id: string }> }

// GET /api/employees/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      secondaryWorkplaces: true,
      availableShiftTimes: true,
      skills: { include: { skill: true } },
    },
  })

  if (!employee) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(employee)
}

// PATCH /api/employees/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = updateEmployeeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // 工場は正社員のみチェック
  if (data.primaryWorkplace === 'FACTORY' && data.employmentType === 'PART_TIME') {
    return NextResponse.json({ error: 'Factory only allows full-time employees' }, { status: 400 })
  }

  // 自分自身を STAFF に降格しようとした場合はブロック (ロックアウト防止)
  if (data.role === 'STAFF' && session.user.id === id) {
    return NextResponse.json({ error: '自分自身の管理者権限は外せません' }, { status: 400 })
  }

  // 移動可能な勤務場所の更新（指定されたら全削除→再作成）
  if (data.secondaryWorkplaces !== undefined) {
    await prisma.employeeSecondaryWorkplace.deleteMany({ where: { employeeId: id } })
    if (data.secondaryWorkplaces.length > 0) {
      await prisma.employeeSecondaryWorkplace.createMany({
        data: data.secondaryWorkplaces.map((w) => ({ employeeId: id, workplace: w })),
      })
    }
  }

  // 対応可能時間帯の更新
  if (data.availableShiftTimes !== undefined) {
    await prisma.employeeShiftTime.deleteMany({ where: { employeeId: id } })
    if (data.availableShiftTimes.length > 0) {
      await prisma.employeeShiftTime.createMany({
        data: data.availableShiftTimes.map((t) => ({ employeeId: id, timeSlot: t })),
      })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secondaryWorkplaces: _, availableShiftTimes: __, retiredAt, ...rest } = data
  const updateData: Record<string, unknown> = { ...rest }
  if (retiredAt !== undefined) {
    updateData.retiredAt = retiredAt ? new Date(retiredAt) : null
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: updateData,
    include: {
      secondaryWorkplaces: true,
      availableShiftTimes: true,
      skills: { include: { skill: true } },
    },
  })

  return NextResponse.json(employee)
}

// DELETE /api/employees/[id] (論理削除)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.employee.update({
    where: { id },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true })
}
