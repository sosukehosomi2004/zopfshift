import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

// GET /api/shift-periods/[id]/candidates
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // スロット情報を先に取得（sortOrderでスロット番号を特定）
  const slotsRaw = await prisma.workplaceSlot.findMany({
    orderBy: [{ workplace: 'asc' }, { sortOrder: 'asc' }],
    include: { skills: true, rules: true },
  })
  const slotMap = new Map(slotsRaw.map((s) => [s.id, { name: s.name, sortOrder: s.sortOrder }]))

  const candidates = await prisma.shiftCandidate.findMany({
    where: { shiftPeriodId: id },
    orderBy: { candidateIndex: 'asc' },
    include: {
      assignments: {
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              lastName: true,
              firstName: true,
              employmentType: true,
              primaryWorkplace: true,
            },
          },
        },
        orderBy: [{ date: 'asc' }, { workplace: 'asc' }],
      },
    },
  }) as Array<{ id: string; candidateIndex: number; score: number | null; isSelected: boolean; violations: unknown; assignments: Array<{ workplaceSlotId: string | null; [key: string]: unknown }> }>

  // 全従業員（パート含む）も返す
  const allEmployees = await prisma.employee.findMany({
    where: { isActive: true },
    select: {
      id: true,
      employeeNumber: true,
      lastName: true,
      firstName: true,
      employmentType: true,
      primaryWorkplace: true,
    },
    orderBy: { employeeNumber: 'asc' },
  })

  // スロット情報を割当に付加
  const enriched = candidates.map((c) => ({
    ...c,
    assignments: c.assignments.map((a) => {
      const slot = a.workplaceSlotId ? slotMap.get(a.workplaceSlotId) : null
      return {
        ...a,
        slotName: slot?.name ?? null,
        slotNumber: slot?.sortOrder ?? null,
      }
    }),
  }))

  // クライアント側違反計算用の追加データ
  const slots = slotsRaw.map((s) => ({
    id: s.id,
    workplace: s.workplace,
    name: s.name,
    sortOrder: s.sortOrder,
    requiredSkillIds: s.skills.map((sk) => sk.skillId),
    rules: s.rules.map((r) => ({
      dayType: r.dayType,
      isRequired: r.isRequired,
      groupKey: r.groupKey,
    })),
  }))

  const staffingRules = await prisma.workplaceStaffingRule.findMany()

  const skills = await prisma.skill.findMany({
    select: { id: true, workplace: true, name: true },
  })

  return NextResponse.json({
    candidates: enriched,
    allEmployees,
    slots,
    staffingRules,
    skills,
  })
}
