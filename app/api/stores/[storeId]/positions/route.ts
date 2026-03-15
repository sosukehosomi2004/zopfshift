import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const positions = await prisma.position.findMany({
    where: { storeId: params.storeId },
    select: { id: true, name: true, color: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(positions)
}
