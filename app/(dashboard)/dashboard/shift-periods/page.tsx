'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, ChevronRight, Trash2, Play, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { getFiscalMonthFromDate, getPeriodRange, getMonthLabel } from '@/lib/period-month'

type ShiftPeriod = {
  id: string
  startDate: string
  endDate: string
  label: string
  status: string
  _count: { candidates: number }
}

type BulkPendingGroup = {
  periodId: string
  periodLabel: string
  requests: {
    id: string
    date: string
    type: string
    memo: string | null
    status: string
    createdAt: string
    employee: { id: string; lastName: string; firstName: string; primaryWorkplace: string }
  }[]
}

type BulkGenerateResult = {
  total: number
  okCount: number
  ngCount: number
  results: {
    periodId: string
    ok: boolean
    attempts: number
    candidateCount?: number
    error?: string
    detail?: string[]
  }[]
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '下書き',
  GENERATING: '生成中',
  REVIEW: 'レビュー中',
  ADJUSTING: '手動調整',
  CONFIRMED: '確定',
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  GENERATING: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-blue-100 text-blue-700',
  ADJUSTING: 'bg-purple-100 text-purple-700',
  CONFIRMED: 'bg-green-100 text-green-700',
}

// 現在の月度から N ヶ月先までの一覧を返す
function buildMonthOptions(count: number): { fiscalYear: number; month: number; label: string }[] {
  const start = getFiscalMonthFromDate(new Date())
  const options: { fiscalYear: number; month: number; label: string }[] = []
  let y = start.fiscalYear
  let m = start.month
  for (let i = 0; i < count; i++) {
    options.push({ fiscalYear: y, month: m, label: getMonthLabel(y, m) })
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return options
}

export default function ShiftPeriodsPage() {
  const [periods, setPeriods] = useState<ShiftPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set()) // key = `${fy}-${m}`
  const [creating, setCreating] = useState(false)

  // 一括生成
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<Set<string>>(new Set())
  const [bulkPendings, setBulkPendings] = useState<BulkPendingGroup[] | null>(null)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkGenerateResult | null>(null)

  const monthOptions = useMemo(() => buildMonthOptions(12), [])

  const fetchPeriods = async () => {
    setLoading(true)
    const res = await fetch('/api/shift-periods')
    if (res.ok) setPeriods(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    fetchPeriods()
  }, [])

  // 既存期間の判定 (startDate でマッチ)
  const existingMonths = useMemo(() => {
    const set = new Set<string>()
    for (const p of periods) {
      const start = new Date(p.startDate)
      const fm = getFiscalMonthFromDate(new Date(start.getTime() + 24 * 3600 * 1000)) // startDate (21日) → 翌月度の場合があるので +1日でずらす
      // startDate は (m-1)月21日, label は m月度
      // ラベルから fiscalYear/month を抜いた方が確実
      const labelMatch = p.label.match(/(\d+)年(\d+)月度/)
      if (labelMatch) {
        set.add(`${labelMatch[1]}-${labelMatch[2]}`)
      } else {
        set.add(`${fm.fiscalYear}-${fm.month}`)
      }
    }
    return set
  }, [periods])

  const toggleMonth = (key: string, disabled: boolean) => {
    if (disabled) return
    const next = new Set(selectedMonths)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedMonths(next)
  }

  const openBulkGenerateModal = async (ids: string[]) => {
    if (ids.length === 0) return
    const res = await fetch(`/api/shift-periods/pending-requests-bulk?ids=${ids.join(',')}`)
    if (!res.ok) {
      alert('未処理申請の取得に失敗しました')
      return
    }
    const data: BulkPendingGroup[] = await res.json()
    setBulkPendings(data)
  }

  const handleCreate = async () => {
    if (selectedMonths.size === 0) return
    setCreating(true)
    const errors: string[] = []
    const createdIds: string[] = []
    for (const key of Array.from(selectedMonths)) {
      const [fyStr, mStr] = key.split('-')
      const fiscalYear = parseInt(fyStr)
      const fiscalMonth = parseInt(mStr)
      const apiYear = fiscalMonth === 1 ? fiscalYear - 1 : fiscalYear
      const apiMonth = fiscalMonth === 1 ? 12 : fiscalMonth - 1
      const res = await fetch('/api/shift-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: apiYear, month: apiMonth }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        errors.push(`${getMonthLabel(fiscalYear, fiscalMonth)}: ${data.error ?? '失敗'}`)
      } else {
        const data = await res.json().catch(() => null)
        if (data?.id) createdIds.push(data.id)
      }
    }
    setCreating(false)
    setShowCreate(false)
    setSelectedMonths(new Set())
    fetchPeriods()
    if (errors.length > 0) {
      alert(`一部の作成に失敗しました:\n${errors.join('\n')}`)
    }
    // 作成成功した期間は自動的にレビューまで進める
    if (createdIds.length > 0) {
      await openBulkGenerateModal(createdIds)
    }
  }

  const togglePeriod = (id: string, status: string) => {
    if (status !== 'DRAFT') return
    const next = new Set(selectedPeriodIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedPeriodIds(next)
  }

  const startBulkGenerate = async () => {
    await openBulkGenerateModal(Array.from(selectedPeriodIds))
  }

  const updateRequestStatus = async (
    requestId: string,
    newStatus: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) => {
    const res = await fetch(`/api/day-off-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      alert('ステータス更新に失敗しました')
      return
    }
    // 再取得
    if (bulkPendings) {
      const ids = bulkPendings.map((g) => g.periodId)
      const refetch = await fetch(`/api/shift-periods/pending-requests-bulk?ids=${ids.join(',')}`)
      if (refetch.ok) setBulkPendings(await refetch.json())
    }
  }

  const runBulkGenerate = async () => {
    if (!bulkPendings) return
    setBulkGenerating(true)
    setBulkResult(null)
    try {
      const ids = bulkPendings.map((g) => g.periodId)
      const res = await fetch('/api/shift-periods/bulk-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodIds: ids }),
        signal: AbortSignal.timeout(800000),
      })
      const data: BulkGenerateResult = await res.json()
      setBulkResult(data)
      fetchPeriods()
    } catch {
      alert('生成に時間がかかりすぎました。ページをリロードして個別の状態を確認してください。')
    } finally {
      setBulkGenerating(false)
    }
  }

  const closeBulkModal = () => {
    setBulkPendings(null)
    setBulkResult(null)
    setSelectedPeriodIds(new Set())
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">シフト管理</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          新規シフト期間
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 max-w-md">
          <h3 className="font-semibold text-gray-900 mb-2">シフト期間を作成（複数選択可）</h3>
          <p className="text-xs text-gray-400 mb-3">
            ○月度 = (前月)21日 〜 ○月20日 が対象期間になります。<br />
            作成後そのまま自動生成 → レビューまで進めます。
          </p>
          <div className="grid grid-cols-3 gap-2 mb-3 max-h-64 overflow-y-auto">
            {monthOptions.map((opt) => {
              const key = `${opt.fiscalYear}-${opt.month}`
              const exists = existingMonths.has(key)
              const checked = selectedMonths.has(key)
              return (
                <label
                  key={key}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm border ${
                    exists
                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed border-gray-100'
                      : checked
                      ? 'bg-[#0AB4CC]/10 border-[#0AB4CC] text-gray-900'
                      : 'bg-white border-gray-200 hover:border-[#0AB4CC]/40 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={exists}
                    onChange={() => toggleMonth(key, exists)}
                    className="accent-[#0AB4CC]"
                  />
                  <span>{opt.label}</span>
                  {exists && <span className="ml-auto text-[10px] text-gray-300">作成済</span>}
                </label>
              )
            })}
          </div>
          {selectedMonths.size > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              選択中: {selectedMonths.size}件 →{' '}
              {Array.from(selectedMonths)
                .sort()
                .slice(0, 3)
                .map((k) => {
                  const [fy, m] = k.split('-')
                  const r = getPeriodRange(parseInt(fy), parseInt(m))
                  const fmt = (d: Date) =>
                    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
                  return `${fmt(r.start)}〜${fmt(r.end)}`
                })
                .join(', ')}
              {selectedMonths.size > 3 && ' ...'}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={selectedMonths.size === 0 || creating}
              className="px-4 py-2 bg-[#0AB4CC] text-white rounded-lg text-sm hover:bg-[#099bb0] disabled:opacity-40"
            >
              {creating ? '作成中...' : `${selectedMonths.size}件作成して生成へ`}
            </button>
            <button
              onClick={() => {
                setShowCreate(false)
                setSelectedMonths(new Set())
              }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 一括選択バー */}
      {selectedPeriodIds.size > 0 && (
        <div className="sticky top-4 z-30 mb-4 bg-[#0AB4CC]/10 border border-[#0AB4CC]/40 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
          <span className="text-sm font-medium text-gray-800">{selectedPeriodIds.size}件選択中</span>
          <button
            onClick={startBulkGenerate}
            className="ml-auto flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium"
          >
            <Play className="w-4 h-4" />
            一括シフト生成
          </button>
          <button
            onClick={() => setSelectedPeriodIds(new Set())}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            選択解除
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : periods.length === 0 ? (
        <div className="text-center py-12 text-gray-400">シフト期間がありません</div>
      ) : (
        <div className="space-y-2">
          {periods.map((p) => {
            const selectable = p.status === 'DRAFT'
            const checked = selectedPeriodIds.has(p.id)
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between bg-white rounded-xl shadow-sm border px-5 py-4 transition-colors ${
                  checked ? 'border-[#0AB4CC]' : 'border-gray-100 hover:border-[#0AB4CC]/30'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!selectable}
                  onChange={() => togglePeriod(p.id, p.status)}
                  className="mr-3 accent-[#0AB4CC] disabled:opacity-30"
                  title={selectable ? '一括生成対象に追加' : '下書き状態のみ一括生成できます'}
                />
                <Link
                  href={`/dashboard/shift-periods/${p.id}`}
                  className="flex items-center gap-4 flex-1"
                >
                  <div>
                    <div className="font-semibold text-gray-900">{p.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {p.startDate.split('T')[0]} 〜 {p.endDate.split('T')[0]}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}
                  >
                    {STATUS_LABELS[p.status]}
                  </span>
                  {p._count.candidates > 0 && (
                    <span className="text-xs text-gray-400">{p._count.candidates}候補</span>
                  )}
                </Link>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const candidateNote =
                        p._count.candidates > 0
                          ? `\n候補${p._count.candidates}件と事前確定セルもすべて削除されます。`
                          : ''
                      if (!confirm(`「${p.label}」を削除します。${candidateNote}\n\nよろしいですか？`))
                        return
                      const res = await fetch(`/api/shift-periods/${p.id}`, { method: 'DELETE' })
                      if (res.ok) {
                        fetchPeriods()
                      } else {
                        alert('削除に失敗しました')
                      }
                    }}
                    className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                    title="シフト期間を削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    削除
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 一括生成モーダル */}
      {bulkPendings && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center">
              <h2 className="font-semibold text-gray-900">
                一括シフト生成（{bulkPendings.length}期間）
              </h2>
              <button
                onClick={closeBulkModal}
                disabled={bulkGenerating}
                className="ml-auto text-sm text-gray-400 hover:text-gray-700 disabled:opacity-40"
              >
                閉じる
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {!bulkResult && !bulkGenerating && (
                <>
                  <p className="text-sm text-gray-600">
                    生成前に未処理申請を確認してください。承認・却下せずに「そのまま生成」も可能です。
                  </p>
                  {bulkPendings.map((g) => (
                    <div key={g.periodId} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center mb-2">
                        <span className="font-semibold text-sm text-gray-800">{g.periodLabel}</span>
                        <span className="ml-2 text-xs text-gray-500">
                          未処理 {g.requests.length}件
                        </span>
                      </div>
                      {g.requests.length === 0 ? (
                        <p className="text-xs text-gray-400">未処理申請はありません</p>
                      ) : (
                        <div className="space-y-1">
                          {g.requests.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-sm"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-gray-500">
                                  {r.date.split('T')[0]}
                                </span>
                                <span className="font-medium">
                                  {r.employee.lastName} {r.employee.firstName}
                                </span>
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded ${
                                    r.type === 'DAY_OFF'
                                      ? 'bg-blue-100 text-blue-600'
                                      : 'bg-purple-100 text-purple-600'
                                  }`}
                                >
                                  {r.type === 'DAY_OFF' ? '公休' : '有休'}
                                </span>
                                {r.memo && <span className="text-xs text-gray-400">{r.memo}</span>}
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => updateRequestStatus(r.id, 'APPROVED')}
                                  className="text-xs px-2 py-1 rounded bg-green-50 hover:bg-green-100 text-green-600"
                                >
                                  承認
                                </button>
                                <button
                                  onClick={() => updateRequestStatus(r.id, 'REJECTED')}
                                  className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600"
                                >
                                  却下
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}

              {bulkGenerating && (
                <div className="py-12 text-center text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#0AB4CC]" />
                  <p className="text-sm">生成中です。失敗した期間は最大3回まで自動リトライします。</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {bulkPendings.length}期間 × 最大3回 = 完了まで数分かかる場合があります。
                  </p>
                </div>
              )}

              {bulkResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800">完了</span>
                    <span className="text-sm text-green-700">成功 {bulkResult.okCount}件</span>
                    {bulkResult.ngCount > 0 && (
                      <span className="text-sm text-red-700">失敗 {bulkResult.ngCount}件</span>
                    )}
                  </div>
                  {bulkResult.results.map((r) => {
                    const period = bulkPendings.find((g) => g.periodId === r.periodId)
                    return (
                      <div
                        key={r.periodId}
                        className={`border rounded-lg p-3 ${
                          r.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">
                              {period?.periodLabel ?? r.periodId}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {r.ok
                                ? `候補${r.candidateCount}件 / レビュー中へ移動`
                                : `${r.error ?? '失敗'}`}
                              {r.attempts > 1 && (
                                <span className="ml-2 text-gray-400">（{r.attempts}回試行）</span>
                              )}
                            </div>
                          </div>
                          {r.ok && (
                            <Link
                              href={`/dashboard/shift-periods/${r.periodId}`}
                              className="text-xs px-3 py-1 rounded bg-white border border-gray-200 hover:border-[#0AB4CC]"
                            >
                              開く →
                            </Link>
                          )}
                        </div>
                        {!r.ok && r.detail && r.detail.length > 0 && (
                          <ul className="mt-2 text-xs text-red-700 list-disc list-inside max-h-32 overflow-y-auto">
                            {r.detail.slice(0, 8).map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 flex gap-2 justify-end">
              {!bulkResult && !bulkGenerating && (
                <>
                  <button
                    onClick={closeBulkModal}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={runBulkGenerate}
                    className="flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium"
                  >
                    <Play className="w-4 h-4" />
                    {bulkPendings.some((g) => g.requests.length > 0)
                      ? 'そのまま生成（未処理は無視）'
                      : '生成開始'}
                  </button>
                </>
              )}
              {bulkResult && (
                <button
                  onClick={closeBulkModal}
                  className="px-4 py-2 bg-[#0AB4CC] text-white rounded-lg text-sm hover:bg-[#099bb0]"
                >
                  閉じる
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
