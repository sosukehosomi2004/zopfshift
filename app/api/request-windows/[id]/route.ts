import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  deadline: z.string().optional(),
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
  const updated = await prisma.requestWindow.update({
    where: { id },
    data: parsed.data.deadline ? { deadline: new Date(parsed.data.deadline) } : {},
  })
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
