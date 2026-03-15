import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const updateSchema = z.object({
  positionId: z.string().optional().nullable(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  breakTime: z.number().int().min(0).optional(),
  memo: z.string().optional().nullable(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'ABSENT']).optional(),
})

export async function PUT(
  req: Request,
  { params }: { params: { storeId: string; shiftId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data
  const shift = await prisma.shift.update({
    where: { id: params.shiftId },
    data: {
      ...(data.date && { date: new Date(data.date) }),
      ...(data.startTime && { startTime: data.startTime }),
      ...(data.endTime && { endTime: data.endTime }),
      ...(data.breakTime !== undefined && { breakTime: data.breakTime }),
      ...(data.memo !== undefined && { memo: data.memo }),
      ...(data.status && { status: data.status }),
      ...(data.positionId !== undefined && { positionId: data.positionId }),
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      position: { select: { id: true, name: true, color: true } },
    },
  })

  return NextResponse.json(shift)
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; shiftId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.shift.delete({ where: { id: params.shiftId } })
  return NextResponse.json({ ok: true })
}
