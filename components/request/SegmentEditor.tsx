'use client'

import { useState } from 'react'
import { Coffee, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Position {
  id: string
  name: string
  color: string
}

export interface SegmentData {
  startTime: string
  endTime: string
  positionId: string | null
  isBreak: boolean
}

interface SegmentEditorProps {
  requestStartTime: string
  requestEndTime: string
  positions: Position[]
  initialSegments?: SegmentData[]
  onSave: (segments: SegmentData[]) => void
  onCancel: () => void
  saving?: boolean
  saveLabel?: string
}

// 時刻 → 分
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
// 分 → 時刻
function toTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// 30分刻みの時刻オプション生成（startMin <= t <= endMin）
function generateTimeOptions(startMin: number, endMin: number): string[] {
  const opts: string[] = []
  for (let t = startMin; t <= endMin; t += 30) {
    opts.push(toTime(t))
  }
  return opts
}

interface SegmentRow {
  startTime: string
  endTime: string
  positionId: string | null
  isBreak: boolean
}

export function SegmentEditor({
  requestStartTime,
  requestEndTime,
  positions,
  initialSegments,
  onSave,
  onCancel,
  saving,
  saveLabel = '仮確定',
}: SegmentEditorProps) {
  const reqStartMin = toMin(requestStartTime)
  const reqEndMin = toMin(requestEndTime)

  const [segments, setSegments] = useState<SegmentRow[]>(() => {
    if (initialSegments && initialSegments.length > 0) {
      return initialSegments.map(s => ({ ...s }))
    }
    // デフォルト: 希望時間全体を最初のポジションに割り当て
    return [{
      startTime: requestStartTime,
      endTime: requestEndTime,
      positionId: positions[0]?.id ?? null,
      isBreak: false,
    }]
  })

  const timeOptions = generateTimeOptions(reqStartMin, reqEndMin)

  const updateSegment = (idx: number, field: keyof SegmentRow, value: string | boolean | null) => {
    setSegments(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const addSegment = () => {
    // 最後のセグメントの endTime を新セグメントの startTime にする
    const lastEnd = segments.length > 0 ? segments[segments.length - 1].endTime : requestStartTime
    const lastEndMin = toMin(lastEnd)
    if (lastEndMin >= reqEndMin) return // もう追加できない

    setSegments(prev => [...prev, {
      startTime: lastEnd,
      endTime: requestEndTime,
      positionId: positions[0]?.id ?? null,
      isBreak: false,
    }])
  }

  const removeSegment = (idx: number) => {
    setSegments(prev => prev.filter((_, i) => i !== idx))
  }

  const toggleBreak = (idx: number) => {
    setSegments(prev => {
      const next = [...prev]
      if (next[idx].isBreak) {
        next[idx] = { ...next[idx], isBreak: false, positionId: positions[0]?.id ?? null }
      } else {
        next[idx] = { ...next[idx], isBreak: true, positionId: null }
      }
      return next
    })
  }

  // バリデーション
  const isValid = segments.length > 0 && segments.every(s => {
    const sMin = toMin(s.startTime)
    const eMin = toMin(s.endTime)
    return sMin < eMin && sMin >= reqStartMin && eMin <= reqEndMin && (s.isBreak || s.positionId !== null)
  })

  // 合計勤務時間・休憩時間
  const totalWorkMin = segments.filter(s => !s.isBreak).reduce((sum, s) => sum + toMin(s.endTime) - toMin(s.startTime), 0)
  const totalBreakMin = segments.filter(s => s.isBreak).reduce((sum, s) => sum + toMin(s.endTime) - toMin(s.startTime), 0)

  // タイムラインプレビュー
  const totalMin = reqEndMin - reqStartMin

  return (
    <div className="space-y-3">
      {/* セグメントリスト */}
      <div className="space-y-2">
        {segments.map((seg, idx) => (
          <div
            key={idx}
            className={cn(
              'flex items-center gap-2 p-2 rounded-lg border',
              seg.isBreak ? 'border-[#E2E8F0] bg-[#F8F9FA]' : 'border-[#E2E8F0] bg-white',
            )}
          >
            {/* 開始時間 */}
            <select
              value={seg.startTime}
              onChange={e => updateSegment(idx, 'startTime', e.target.value)}
              className="text-xs border border-[#E2E8F0] rounded px-1.5 py-1 bg-white text-[#1A202C] min-w-[70px]"
            >
              {timeOptions.filter(t => t < seg.endTime).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <span className="text-[10px] text-[#718096]">〜</span>

            {/* 終了時間 */}
            <select
              value={seg.endTime}
              onChange={e => updateSegment(idx, 'endTime', e.target.value)}
              className="text-xs border border-[#E2E8F0] rounded px-1.5 py-1 bg-white text-[#1A202C] min-w-[70px]"
            >
              {timeOptions.filter(t => t > seg.startTime).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {/* 役割 or 休憩 */}
            {seg.isBreak ? (
              <div className="flex items-center gap-1 text-xs text-[#64748B] bg-[#E2E8F0] rounded px-2 py-1">
                <Coffee className="w-3 h-3" />
                休憩
              </div>
            ) : (
              <select
                value={seg.positionId ?? ''}
                onChange={e => updateSegment(idx, 'positionId', e.target.value || null)}
                className="text-xs border border-[#E2E8F0] rounded px-1.5 py-1 bg-white text-[#1A202C] flex-1 min-w-[80px]"
              >
                {positions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            {/* 休憩切替 */}
            <button
              onClick={() => toggleBreak(idx)}
              className={cn(
                'p-1 rounded transition-colors',
                seg.isBreak
                  ? 'text-[#0AB4CC] hover:bg-[#E6F7FA]'
                  : 'text-[#718096] hover:bg-[#F8F9FA]',
              )}
              title={seg.isBreak ? '勤務に変更' : '休憩に変更'}
            >
              <Coffee className="w-3.5 h-3.5" />
            </button>

            {/* 削除 */}
            {segments.length > 1 && (
              <button
                onClick={() => removeSegment(idx)}
                className="p-1 rounded text-[#718096] hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* セグメント追加 */}
      <button
        onClick={addSegment}
        className="flex items-center gap-1 text-xs text-[#0AB4CC] hover:text-[#0891B2] transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        セグメントを追加
      </button>

      {/* タイムラインプレビュー */}
      {segments.length > 0 && (
        <div className="border border-[#E2E8F0] rounded-lg overflow-hidden h-7 relative bg-[#F1F5F9]">
          {segments.map((seg, idx) => {
            const left = ((toMin(seg.startTime) - reqStartMin) / totalMin) * 100
            const width = ((toMin(seg.endTime) - toMin(seg.startTime)) / totalMin) * 100
            const pos = positions.find(p => p.id === seg.positionId)
            return (
              <div
                key={idx}
                className="absolute h-full flex items-center justify-center"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: seg.isBreak ? '#E2E8F0' : (pos?.color ?? '#0AB4CC'),
                }}
              >
                <span className={cn(
                  'text-[9px] font-semibold truncate px-1',
                  seg.isBreak ? 'text-[#64748B]' : 'text-white',
                )}>
                  {seg.isBreak ? '休憩' : pos?.name}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* サマリー */}
      <div className="text-xs text-[#718096] flex items-center gap-3">
        <span>希望: {requestStartTime}〜{requestEndTime}</span>
        <span>勤務: {totalWorkMin}分</span>
        {totalBreakMin > 0 && <span>休憩: {totalBreakMin}分</span>}
      </div>

      {/* 操作ボタン */}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!isValid || saving}
          onClick={() => onSave(segments)}
          className="bg-[#22C55E] hover:bg-green-600 text-white text-xs h-8"
        >
          {saving ? '保存中...' : saveLabel}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          className="text-xs h-8"
        >
          キャンセル
        </Button>
      </div>
    </div>
  )
}
