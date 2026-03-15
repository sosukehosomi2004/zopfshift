'use client'

import { useForm, type SubmitHandler } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const schema = z.object({
  name: z.string().min(1, '名前を入力してください'),
  email: z.string().email('正しいメールアドレスを入力してください'),
  role: z.enum(['ADMIN', 'STAFF']),
  color: z.string(),
})

type FormData = z.infer<typeof schema>

const COLOR_OPTIONS = [
  { label: 'ブルー', value: '#0AB4CC' },
  { label: 'オレンジ', value: '#FF6B35' },
  { label: 'グリーン', value: '#22C55E' },
  { label: 'イエロー', value: '#F59E0B' },
  { label: 'パープル', value: '#8B5CF6' },
  { label: 'ピンク', value: '#EC4899' },
  { label: 'ティール', value: '#14B8A6' },
]

interface StaffInviteModalProps {
  open: boolean
  onClose: () => void
  onInvite: (data: FormData) => Promise<void>
}

export function StaffInviteModal({ open, onClose, onInvite }: StaffInviteModalProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolver: zodResolver(schema) as any,
      defaultValues: { role: 'STAFF', color: '#0AB4CC' },
    })

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    await onInvite(data)
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>スタッフを追加</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>名前</Label>
            <Input placeholder="山田 太郎" {...register('name')} />
            {errors.name && <p className="text-xs text-[#EF4444]">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>メールアドレス</Label>
            <Input type="email" placeholder="you@example.com" {...register('email')} />
            {errors.email && <p className="text-xs text-[#EF4444]">{errors.email.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>役割</Label>
              <Select value={watch('role')} onValueChange={(v) => setValue('role', v as FormData['role'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">スタッフ</SelectItem>
                  <SelectItem value="ADMIN">管理者</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>カラー</Label>
              <Select value={watch('color')} onValueChange={(v) => setValue('color', v)}>
                <SelectTrigger>
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: watch('color') }} />
                      {COLOR_OPTIONS.find(c => c.value === watch('color'))?.label}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.value }} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-[#0AB4CC] hover:bg-[#0099B0] text-white">
              {isSubmitting ? '追加中...' : '追加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
