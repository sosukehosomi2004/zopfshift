'use client'

import { useEffect } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ShiftData } from './ShiftBlock'

const schema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  breakTime: z.number().int().min(0),
  positionId: z.string().optional(),
  memo: z.string().optional(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'ABSENT']),
})

export type ShiftFormData = z.infer<typeof schema>

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

interface Position {
  id: string
  name: string
  color: string
}

interface ShiftModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: ShiftFormData) => Promise<void>
  onDelete?: () => void
  initialDate?: string
  initialShift?: ShiftData | null
  positions?: Position[]
}

export function ShiftModal({
  open,
  onClose,
  onSave,
  onDelete,
  initialDate,
  initialShift,
  positions = [],
}: ShiftModalProps) {
  const isEdit = !!initialShift

  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } =
    useForm<ShiftFormData>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolver: zodResolver(schema) as any,
      defaultValues: {
        startTime: '10:00',
        endTime: '18:00',
        breakTime: 60,
        status: 'CONFIRMED',
      },
    })

  useEffect(() => {
    if (initialShift) {
      reset({
        startTime: initialShift.startTime,
        endTime: initialShift.endTime,
        breakTime: initialShift.breakTime,
        positionId: initialShift.position?.id ?? undefined,
        memo: initialShift.memo ?? '',
        status: initialShift.status,
      })
    } else {
      reset({ startTime: '10:00', endTime: '18:00', breakTime: 60, status: 'CONFIRMED' })
    }
  }, [initialShift, reset, open])

  const onSubmit: SubmitHandler<ShiftFormData> = async (data) => {
    await onSave(data)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'シフトを編集' : 'シフトを作成'}
            {initialDate && <span className="text-sm font-normal text-[#718096] ml-2">{initialDate}</span>}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>開始時間</Label>
              <Select value={watch('startTime')} onValueChange={(v) => setValue('startTime', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>終了時間</Label>
              <Select value={watch('endTime')} onValueChange={(v) => setValue('endTime', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>休憩時間（分）</Label>
            <Input
              type="number"
              min={0}
              step={15}
              {...register('breakTime', { valueAsNumber: true })}
            />
          </div>

          {positions.length > 0 && (
            <div className="space-y-1.5">
              <Label>ポジション</Label>
              <Select value={watch('positionId') ?? ''} onValueChange={(v) => setValue('positionId', v)}>
                <SelectTrigger><SelectValue placeholder="未設定" /></SelectTrigger>
                <SelectContent>
                  {positions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>ステータス</Label>
            <Select value={watch('status')} onValueChange={(v) => setValue('status', v as ShiftFormData['status'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CONFIRMED">確定</SelectItem>
                <SelectItem value="TENTATIVE">仮</SelectItem>
                <SelectItem value="ABSENT">欠勤</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>メモ</Label>
            <Input placeholder="任意のメモ" {...register('memo')} />
          </div>

          <DialogFooter className="flex gap-2 pt-2">
            {isEdit && onDelete && (
              <Button type="button" variant="destructive" onClick={onDelete} className="mr-auto">
                削除
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-[#0AB4CC] hover:bg-[#0099B0] text-white">
              {isSubmitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
