'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Play, Check } from 'lucide-react'
import Link from 'next/link'
import { ShiftGrid } from '@/components/shift/ShiftGrid'

type ShiftPeriod = {
  id: string
  startDate: string
  endDate: string
  label: string
  status: string
  candidates: {
    id: string
    candidateIndex: number
    score: number | null
    isSelected: boolean
    _count: { assignments: number }
  }[]
}

type Candidate = {
  id: string
  candidateIndex: number
  score: number | null
  isSelected: boolean
  assignments: {
    employeeId: string
    date: string
    workplace: string
    workplaceSlotId: string | null
    slotName: string | null
    slotNumber: number | null
    employee: {
      id: string
      employeeNumber: number
      lastName: string
      firstName: string
      employmentType: string
      primaryWorkplace: string
    }
  }[]
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '下書き',
  GENERATING: '生成中',
  REVIEW: 'レビュー中',
  CONFIRMED: '確定',
}

export default function ShiftPeriodDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [period, setPeriod] = useState<ShiftPeriod | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<number>(0)
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [generateResult, setGenerateResult] = useState<string | null>(null)

  const fetchPeriod = useCallback(async () => {
    const res = await fetch(`/api/shift-periods/${id}`)
    if (res.ok) setPeriod(await res.json())
  }, [id])

  const fetchCandidates = useCallback(async () => {
    const res = await fetch(`/api/shift-periods/${id}/candidates`)
    if (res.ok) {
      const data = await res.json()
      setCandidates(data)
    }
  }, [id])

  useEffect(() => { fetchPeriod() }, [fetchPeriod])
  useEffect(() => {
    if (period && (period.status === 'REVIEW' || period.status === 'CONFIRMED')) {
      fetchCandidates()
    }
  }, [period, fetchCandidates])

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch(`/api/shift-periods/${id}/generate`, {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
      })
      const data = await res.json()

      if (res.ok) {
        const totalViolations = (data.violations ?? []).reduce((sum: number, v: { violationCount: number }) => sum + v.violationCount, 0)
        const sampleViolations = (data.violations ?? [])
          .filter((v: { violationCount: number }) => v.violationCount > 0)
          .slice(0, 1)
          .flatMap((v: { violations: string[] }) => v.violations.slice(0, 5))
        let message = `${data.candidateCount}候補を生成しました（違反合計: ${totalViolations}件）`
        if (sampleViolations.length > 0) {
          message += `\n例: ${sampleViolations.join(' / ')}`
        }
        setGenerateResult(message)
        fetchPeriod()
        fetchCandidates()
      } else {
        setGenerateResult(`エラー: ${data.error}`)
      }
    } catch {
      setGenerateResult('生成に時間がかかっています。ページをリロードしてください。')
    } finally {
      setGenerating(false)
    }
  }

  const handleConfirm = async () => {
    if (!candidates[selectedCandidate]) return
    if (!confirm(`候補${selectedCandidate + 1}でシフトを確定しますか？`)) return
    setConfirming(true)
    await fetch(`/api/shift-periods/${id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: candidates[selectedCandidate].id }),
    })
    setConfirming(false)
    fetchPeriod()
  }

  if (!period) return <div className="text-center py-12 text-gray-400">読み込み中...</div>

  const currentCandidate = candidates[selectedCandidate]

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/shift-periods" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{period.label}</h1>
          <p className="text-sm text-gray-400">
            {period.startDate.split('T')[0]} 〜 {period.endDate.split('T')[0]}
            <span className="ml-3 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {STATUS_LABELS[period.status]}
            </span>
          </p>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-2">
          {(period.status === 'DRAFT' || period.status === 'REVIEW') && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {generating ? '生成中...' : period.status === 'REVIEW' ? '再生成' : 'シフト生成'}
            </button>
          )}
          {period.status === 'REVIEW' && candidates.length > 0 && (
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {confirming ? '確定中...' : '候補を確定'}
            </button>
          )}
        </div>
      </div>

      {generateResult && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
          generateResult.startsWith('エラー') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {generateResult}
        </div>
      )}

      {/* 候補がない場合 */}
      {candidates.length === 0 && period.status !== 'GENERATING' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-400 mb-2">シフト候補がまだありません</p>
          <p className="text-xs text-gray-300">「シフト生成」ボタンで候補を生成してください</p>
        </div>
      )}

      {period.status === 'GENERATING' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-500">シフトを生成中です...</p>
        </div>
      )}

      {/* 候補セレクタ + グリッド */}
      {candidates.length > 0 && (
        <>
          {/* 候補タブ */}
          <div className="flex gap-2 mb-4">
            {candidates.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setSelectedCandidate(i)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCandidate === i
                    ? 'bg-[#0AB4CC] text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-[#0AB4CC]/30'
                } ${c.isSelected ? 'ring-2 ring-green-400' : ''}`}
              >
                候補 {c.candidateIndex}
                {c.score !== null && (
                  <span className="ml-2 text-xs opacity-75">({c.score.toFixed(0)}点)</span>
                )}
                {c.isSelected && <span className="ml-1 text-xs">(確定)</span>}
              </button>
            ))}
          </div>

          {/* シフトグリッド（3勤務場所まとめて表示） */}
          {currentCandidate && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 overflow-hidden">
              <ShiftGrid
                startDate={period.startDate}
                endDate={period.endDate}
                assignments={currentCandidate.assignments}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
