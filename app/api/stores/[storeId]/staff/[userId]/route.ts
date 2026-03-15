import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const updateSchema = z.object({
  color: z.string().optional(),
  maxHours: z.number().int().optional().nullable(),
  minHours: z.number().int().optional().nullable(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
})

export async function PUT(
  req: Request,
  { params }: { params: { storeId: string; userId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const updated = await prisma.userStore.update({
    where: { userId_storeId: { userId: params.userId, storeId: params.storeId } },
    data: parsed.data,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; userId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.userStore.delete({
    where: { userId_storeId: { userId: params.userId, storeId: params.storeId } },
  })

  return NextResponse.json({ ok: true })
}
