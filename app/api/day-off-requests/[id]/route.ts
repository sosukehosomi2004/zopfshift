import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const updateSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
})

type Params = { params: Promise<{ id: string }> }

// PATCH /api/day-off-requests/[id] - 管理者による承認/却下
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const request = await prisma.dayOffRequest.update({
    where: { id },
    data: { status: parsed.data.status },
  })

  return NextResponse.json(request)
}

// DELETE /api/day-off-requests/[id] - 申請取り消し（PENDING時のみ）
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.dayOffRequest.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // スタッフは自分の申請のみ、かつPENDINGのみ取り消し可能
  if (session.user.role === 'STAFF') {
    if (existing.employeeId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (existing.status !== 'PENDING') {
      return NextResponse.json({ error: 'Cannot cancel non-pending request' }, { status: 400 })
    }
  }

  await prisma.dayOffRequest.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
