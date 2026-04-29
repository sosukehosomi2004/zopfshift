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
  const slots = await prisma.workplaceSlot.findMany({
    orderBy: [{ workplace: 'asc' }, { sortOrder: 'asc' }],
  })
  const slotMap = new Map(slots.map((s) => [s.id, { name: s.name, sortOrder: s.sortOrder }]))

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

  return NextResponse.json(enriched)
}
