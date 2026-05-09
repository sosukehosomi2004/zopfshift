import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  deadline: z.string().optional(),
  weekdayCapacity: z.number().int().min(0).max(99).optional(),
  holidayCapacity: z.number().int().min(0).max(99).optional(),
  // 個別日の閾値上書き
  thresholdOverrides: z.record(z.string(), z.number().int().min(0).max(99)).optional(),
  // 管理者からのメッセージ (期間付き)
  messages: z.array(z.object({
    startDate: z.string(),
    endDate: z.string(),
    body: z.string().min(1).max(500),
  })).optional(),
})

// PATCH /api/request-windows/[id] - 締切更新
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const data = parsed.data
  const updateData: Record<string, unknown> = {}
  if (data.deadline) updateData.deadline = new Date(data.deadline)
  if (data.weekdayCapacity !== undefined) updateData.weekdayCapacity = data.weekdayCapacity
  if (data.holidayCapacity !== undefined) updateData.holidayCapacity = data.holidayCapacity
  if (data.thresholdOverrides !== undefined) updateData.thresholdOverrides = data.thresholdOverrides
  if (data.messages !== undefined) updateData.messages = data.messages
  const updated = await prisma.requestWindow.update({ where: { id }, data: updateData })
  return NextResponse.json(updated)
}

// DELETE /api/request-windows/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const window = await prisma.requestWindow.findUnique({ where: { id } })
  if (!window) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await prisma.requestWindow.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
