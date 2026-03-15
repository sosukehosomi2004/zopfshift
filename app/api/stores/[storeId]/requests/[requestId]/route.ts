import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getIO } from '@/lib/socket'
// ShiftRequestStatus enum: PENDING | TENTATIVE | APPROVED | REJECTED
import { z } from 'zod'

const segmentSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  positionId: z.string().nullable(),
  isBreak: z.boolean(),
})

const updateSchema = z.object({
  status: z.enum(['TENTATIVE', 'APPROVED', 'REJECTED']),
  segments: z.array(segmentSchema).optional(),
})

export async function PUT(
  req: Request,
  { params }: { params: { storeId: string; requestId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { status: statusStr, segments } = parsed.data
  const status = statusStr as 'TENTATIVE' | 'APPROVED' | 'REJECTED'

  // TENTATIVE/APPROVED の場合はセグメントが必須
  if ((status === 'TENTATIVE' || status === 'APPROVED') && (!segments || segments.length === 0)) {
    return NextResponse.json({ error: 'Segments required for tentative/approval' }, { status: 400 })
  }

  try {
    // トランザクションで更新
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await prisma.$transaction(async (tx: any) => {
      // 既存セグメントを削除
      await tx.shiftSegment.deleteMany({ where: { shiftRequestId: params.requestId } })

      // リクエストステータス更新
      await tx.shiftRequest.update({
        where: { id: params.requestId },
        data: { status },
      })

      // TENTATIVE/APPROVED ならセグメントを作成
      if ((status === 'TENTATIVE' || status === 'APPROVED') && segments) {
        for (const seg of segments) {
          await tx.shiftSegment.create({
            data: {
              shiftRequestId: params.requestId,
              startTime: seg.startTime,
              endTime: seg.endTime,
              positionId: seg.isBreak ? null : seg.positionId,
              isBreak: seg.isBreak,
            },
          })
        }
      }

      // セグメント付きで再取得
      return tx.shiftRequest.findUnique({
        where: { id: params.requestId },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          segments: {
            include: { position: { select: { id: true, name: true, color: true } } },
            orderBy: { startTime: 'asc' },
          },
        },
      })
    })

    getIO()?.to(`store:${params.storeId}`).emit('request:updated', updated)

    return NextResponse.json(updated)
  } catch (e) {
    console.error('PUT /requests/[requestId] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string; requestId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.shiftRequest.delete({ where: { id: params.requestId } })
  return NextResponse.json({ ok: true })
}
