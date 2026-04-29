import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const createEmployeeSchema = z.object({
  lastName: z.string().min(1),
  firstName: z.string(),
  lastNameRomaji: z.string().min(1),
  firstNameRomaji: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME']),
  primaryWorkplace: z.enum(['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER']),
  secondaryWorkplaces: z.array(z.enum(['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER'])).optional(),
  availableShiftTimes: z.array(z.enum(['EARLY', 'DAYTIME', 'CLOSE'])).optional(),
})

// GET /api/employees - 従業員一覧
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const workplace = searchParams.get('workplace')
  const employmentType = searchParams.get('employmentType')

  const where: Record<string, unknown> = { isActive: true }
  if (workplace) where.primaryWorkplace = workplace
  if (employmentType) where.employmentType = employmentType

  const employees = await prisma.employee.findMany({
    where,
    include: {
      secondaryWorkplaces: true,
      availableShiftTimes: true,
      skills: { include: { skill: true } },
    },
    orderBy: { employeeNumber: 'asc' },
  })

  return NextResponse.json(employees)
}

// POST /api/employees - 従業員登録
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createEmployeeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  const existing = await prisma.employee.findUnique({ where: { email: data.email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
  }

  // 工場は正社員のみ
  if (data.primaryWorkplace === 'FACTORY' && data.employmentType === 'PART_TIME') {
    return NextResponse.json({ error: 'Factory only allows full-time employees' }, { status: 400 })
  }

  const hashedPassword = await bcrypt.hash(data.password, 10)

  const employee = await prisma.employee.create({
    data: {
      lastName: data.lastName,
      firstName: data.firstName,
      lastNameRomaji: data.lastNameRomaji,
      firstNameRomaji: data.firstNameRomaji,
      email: data.email,
      password: hashedPassword,
      employmentType: data.employmentType,
      primaryWorkplace: data.primaryWorkplace,
      secondaryWorkplaces: data.secondaryWorkplaces
        ? { create: data.secondaryWorkplaces.map((w) => ({ workplace: w })) }
        : undefined,
      availableShiftTimes: data.availableShiftTimes
        ? { create: data.availableShiftTimes.map((t) => ({ timeSlot: t })) }
        : undefined,
    },
    include: {
      secondaryWorkplaces: true,
      availableShiftTimes: true,
      skills: { include: { skill: true } },
    },
  })

  return NextResponse.json(employee, { status: 201 })
}
