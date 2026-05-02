import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

type Params = { params: Promise<{ id: string; ruleId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, ruleId } = await params
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const rule = await prisma.employeeRecurringRule.findUnique({ where: { id: ruleId } })
  if (!rule || rule.employeeId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  await prisma.employeeRecurringRule.delete({ where: { id: ruleId } })
  return NextResponse.json({ success: true })
}
