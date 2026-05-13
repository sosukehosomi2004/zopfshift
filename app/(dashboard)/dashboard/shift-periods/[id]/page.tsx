'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Play, Check, Download } from 'lucide-react'
import Link from 'next/link'
import { ShiftGrid } from '@/components/shift/ShiftGrid'
import { PageHelp } from '@/components/help/PageHelp'
import { ShortageModal, type ShortageDetail } from '@/components/shift/ShortageModal'
import { exportShiftToExcel } from '@/lib/export-shift-excel'
import {
  calculateSoftViolations,
  type SlotDef,
  type StaffingRule,
  type EmployeeLite,
  type SoftViolation,
} from '@/lib/violations-client'
import { fetchJson } from '@/lib/api-fetch'

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
  violations?: string[] | null
  assignments: {
    employeeId: string
    date: string
    workplace: string
    workplaceSlotId: string | null
    slotName: string | null
    slotNumber: number | null
    memo?: string | null
    color?: string | null
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
  ADJUSTING: '手動調整',
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
  const [allEmployees, setAllEmployees] = useState<Candidate['assignments'][0]['employee'][]>([])
  const [holidays, setHolidays] = useState<{ date: string; name: string }[]>([])
  const [employeeDetails, setEmployeeDetails] = useState<EmployeeLite[]>([])
  const [shortageDetail, setShortageDetail] = useState<ShortageDetail | null>(null)
  const [slots, setSlots] = useState<SlotDef[]>([])
  const [staffingRules, setStaffingRules] = useState<StaffingRule[]>([])
  const [pendingRequests, setPendingRequests] = useState<{
    id: string; date: string; type: string; memo: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    employee: { id: string; lastName: string; firstName: string; primaryWorkplace: string }
  }[]>([])
  const [preAssignments, setPreAssignments] = useState<{
    id: string; employeeId: string; date: string; workplace: string | null; memo: string | null;
    color: string | null;
    employee: Candidate['assignments'][0]['employee']
  }[]>([])

  const fetchPeriod = useCallback(async () => {
    const data = await fetchJson<ShiftPeriod>(`/api/shift-periods/${id}`)
    if (data) setPeriod(data)
  }, [id])

  const fetchCandidates = useCallback(async () => {
    const data = await fetchJson<{
      candidates: Candidate[]
      allEmployees?: Candidate['assignments'][0]['employee'][]
      slots?: SlotDef[]
      staffingRules?: StaffingRule[]
    } | Candidate[]>(`/api/shift-periods/${id}/candidates`)
    if (!data) return
    if (Array.isArray(data)) {
      setCandidates(data)
    } else {
      setCandidates(data.candidates ?? [])
      if (data.allEmployees) setAllEmployees(data.allEmployees)
      if (data.slots) setSlots(data.slots)
      if (data.staffingRules) setStaffingRules(data.staffingRules)
    }
  }, [id])

  const fetchPendingRequests = useCallback(async () => {
    const data = await fetchJson<typeof pendingRequests>(`/api/shift-periods/${id}/pending-requests`)
    if (data) setPendingRequests(data)
  }, [id])

  const fetchPreAssignments = useCallback(async () => {
    const data = await fetchJson<typeof preAssignments>(`/api/shift-periods/${id}/pre-assignments`)
    if (data) setPreAssignments(data)
  }, [id])

  const fetchAllEmployees = useCallback(async () => {
    const data = await fetchJson<Candidate['assignments'][0]['employee'][]>('/api/employees')
    if (data) setAllEmployees(data)
  }, [])

  useEffect(() => { fetchPeriod() }, [fetchPeriod])
  useEffect(() => {
    fetch('/api/employees')
      .then((r) => r.json())
      .then((emps: Array<{
        id: string; lastName: string; firstName: string; employmentType: string;
        primaryWorkplace: string; floorProficiency: string | null;
        secondaryWorkplaces: { workplace: string }[];
        skills: { skillId: string; proficiency: string | null }[];
      }>) => {
        setEmployeeDetails(
          emps.map((e) => ({
            id: e.id,
            lastName: e.lastName,
            firstName: e.firstName,
            employmentType: e.employmentType as 'FULL_TIME' | 'PART_TIME',
            primaryWorkplace: e.primaryWorkplace,
            floorProficiency: e.floorProficiency as 'LOW' | 'MID' | 'HIGH' | null,
            secondaryWorkplaces: e.secondaryWorkplaces,
            skills: e.skills.map((s) => ({
              skillId: s.skillId,
              proficiency: s.proficiency as 'LOW' | 'MID' | 'HIGH' | null,
            })),
          })),
        )
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!period) return

    // 祝日取得（全状態で必要）
    const startYear = new Date(period.startDate).getFullYear()
    const endYear = new Date(period.endDate).getFullYear()
    const years = startYear === endYear ? [startYear] : [startYear, endYear]
    Promise.all(years.map((y) => fetch(`/api/holidays?year=${y}`).then((r) => r.json())))
      .then((arrs) => setHolidays(arrs.flat()))
      .catch(() => setHolidays([]))

    if (period.status === 'DRAFT') {
      fetchPendingRequests()
      fetchPreAssignments()
      fetchAllEmployees()
    } else if (period.status === 'REVIEW' || period.status === 'ADJUSTING' || period.status === 'CONFIRMED') {
      fetchCandidates()
      fetchPreAssignments()
      fetchPendingRequests() // 生成後も申請を表示
    }
  }, [period, fetchCandidates, fetchPendingRequests, fetchPreAssignments, fetchAllEmployees])

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch(`/api/shift-periods/${id}/generate`, {
        method: 'POST',
        signal: AbortSignal.timeout(300000),
      })
      const data = await res.json()

      if (res.ok) {
        // 成功時は通知バナーを出さない (画面上部のSOFT違反パネルで実際の違反数が見えるため)
        setGenerateResult(null)
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
    const target = enrichedCandidates[selectedCandidate] ?? candidates[selectedCandidate]
    if (!target) return
    if (!confirm(`候補${selectedCandidate + 1}でシフトを確定しますか？`)) return
    setConfirming(true)
    await fetch(`/api/shift-periods/${id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: target.id }),
    })
    setConfirming(false)
    fetchPeriod()
  }

  // 候補ごとに SOFT 違反をクライアント側で再計算し、件数で並べ替え
  const enrichedCandidates = useMemo(() => {
    if (!period || candidates.length === 0) return []
    const periodStart = new Date(period.startDate)
    const periodEnd = new Date(period.endDate)
    const dates: string[] = []
    const cur = new Date(periodStart)
    while (cur <= periodEnd) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      dates.push(`${y}-${m}-${d}`)
      cur.setDate(cur.getDate() + 1)
    }
    const holidaySet = new Set(holidays.map((h) => h.date.split('T')[0]))
    return candidates
      .map((c) => {
        const recalcViolations = calculateSoftViolations({
          dates,
          holidaySet,
          assignments: c.assignments.map((a) => ({
            employeeId: a.employeeId,
            date: a.date.split('T')[0],
            workplace: a.workplace,
          })),
          employees: employeeDetails,
          slots,
          staffingRules,
        })
        return { ...c, recalcViolations }
      })
      .sort((a, b) => a.recalcViolations.length - b.recalcViolations.length)
  }, [period, candidates, holidays, employeeDetails, slots, staffingRules])

  if (!period) return <div className="text-center py-12 text-gray-400">読み込み中...</div>

  const currentCandidate = enrichedCandidates[selectedCandidate] ?? candidates[selectedCandidate]

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/shift-periods" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{period.label}</h1>
            <PageHelp title={`シフト期間 (${STATUS_LABELS[period.status]}) - ヘルプ`}>
              <h3>シフト期間の4つの状態</h3>
              <p>ステータスごとにできる操作が変わります。今は <strong>{STATUS_LABELS[period.status]}</strong> 状態です。</p>
              <ul>
                <li><strong>下書き (DRAFT)</strong>: 申請承認・事前確定セル編集・自動生成の準備期間</li>
                <li><strong>レビュー中 (REVIEW)</strong>: 候補5件から1つ選んで確定</li>
                <li><strong>手動調整 (ADJUSTING)</strong>: 候補を確定した後、セルを手動で編集できる</li>
                <li><strong>確定 (CONFIRMED)</strong>: シフト確定済み、編集不可 (確定取消で戻せる)</li>
              </ul>

              <h3>📝 下書き状態でやること</h3>
              <p>シフト自動生成の<strong>事前準備</strong>を行う段階です。下書きページには2つのセクションがあります:</p>
              <ol>
                <li>
                  <strong>申請一覧</strong> - スタッフから届いた休み申請の処理
                  <ul>
                    <li>「承認」「却下」「未処理に戻す」の3つの操作</li>
                    <li>承認すると自動的に下のシフト表で「休み確定」セルが作られる</li>
                    <li>未処理 (PENDING) のままだとシフト生成できない (赤い警告が出る)</li>
                  </ul>
                </li>
                <li>
                  <strong>事前確定セル</strong> - シフト生成前に「この人はこの日この場所」と固定したいセルを指定
                  <ul>
                    <li>セルをクリック → 編集モーダルで勤務場所/休み/メモ/色を設定</li>
                    <li>通年ルール (毎週木曜休み等) が登録されている場合は自動的に展開される</li>
                    <li>休み確定セル → 自動生成で動かさない (固定休み)</li>
                    <li>出勤確定セル → 自動生成でその勤務場所に固定される</li>
                    <li><strong>L (特殊勤務地) の割り当てはここで設定</strong> - 自動生成は L に誰も配置しないので、事前確定で人を指定する必要がある</li>
                  </ul>
                </li>
              </ol>

              <h3>シフト生成ボタンを押す前のチェックリスト</h3>
              <ol>
                <li>未処理 (PENDING) の申請を全部「承認」または「却下」したか</li>
                <li>確定したい固定休み・固定勤務をセルクリックで設定したか</li>
                <li>準備OK → 右上の「シフト生成」ボタンを押す (1〜2分かかる)</li>
              </ol>

              <h3>🔍 レビュー中でやること</h3>
              <p>自動生成された5候補が表示されます。違反数 (SOFT違反) が少ない順に並んでいます。</p>
              <ul>
                <li>各候補タブをクリックして内容比較</li>
                <li>SOFT違反パネル (オレンジ) の項目をクリックすると、該当セルへハイライト</li>
                <li>採用したい候補で「候補を確定」ボタンを押す → 手動調整モードへ</li>
              </ul>

              <h3>✏ 手動調整でやること</h3>
              <p>確定候補のセルを直接編集できます。生成し直したい場合は「再生成」も可能。</p>
              <ul>
                <li>セルクリック → 編集モーダル (勤務場所変更/休みに/メモ/色)</li>
                <li>「移動」スロット行は工場員などが他勤務地に出ているのを表す</li>
                <li>違反パネルの項目クリックで「配置候補」モーダルが出る (代替の人を提案)</li>
                <li>調整完了したら「シフトを確定」ボタンで CONFIRMED へ</li>
              </ul>

              <h3>🔒 確定後にできること</h3>
              <ul>
                <li>Excel ダウンロード</li>
                <li>「確定取消」で手動調整モードに戻して再編集</li>
              </ul>

              <h3>共通の便利機能</h3>
              <ul>
                <li><strong>Excel ダウンロード</strong>: 候補/確定シフトを色付きで Excel に出力</li>
                <li><strong>シフト表の色ルール</strong>: 主な勤務地で出勤=無色、移動先=移動先の色、Lセル=赤、休み=「/」</li>
                <li><strong>通し番号</strong>: 各勤務場所セクションで上から順に1, 2, 3... 自動採番</li>
              </ul>
            </PageHelp>
          </div>
          <p className="text-sm text-gray-400">
            {period.startDate.split('T')[0]} 〜 {period.endDate.split('T')[0]}
            <span className="ml-3 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {STATUS_LABELS[period.status]}
            </span>
          </p>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-2">
          <button
            onClick={async () => {
              // 未処理(PENDING)申請があればブロック
              const pendingCount = pendingRequests.filter((r) => r.status === 'PENDING').length
              if (pendingCount > 0) {
                alert(`未処理の申請が${pendingCount}件あります。シフト生成前にすべて承認/却下してください。`)
                return
              }

              // 手動調整中・確定済みの場合は破棄確認
              if (period.status === 'ADJUSTING' || period.status === 'CONFIRMED') {
                if (!confirm('再生成すると現在のシフトと手動編集は破棄されます。続けますか？')) return
              }

              // 事前確定の確認（任意なので）
              const preCount = preAssignments.length
              if (preCount > 0) {
                if (!confirm(`事前確定セル ${preCount}件を固定したままシフト生成します。続けますか？`)) return
              } else {
                if (!confirm('事前確定セルがありません。このまま自動生成を実行しますか？')) return
              }

              await handleGenerate()
            }}
            disabled={generating}
            className="flex items-center gap-2 bg-[#0AB4CC] text-white px-4 py-2 rounded-lg hover:bg-[#099bb0] text-sm font-medium disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {generating ? '生成中...' : (period.status === 'DRAFT' ? 'シフト生成' : '再生成')}
          </button>

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

          {period.status === 'ADJUSTING' && (
            <button
              onClick={async () => {
                if (!confirm('シフトを確定しますか？\n確定後は手動編集ができなくなります。\n(確定取消で再度編集可能になります)')) return
                const res = await fetch(`/api/shift-periods/${id}/finalize`, { method: 'POST' })
                if (res.ok) {
                  fetchPeriod()
                } else {
                  const data = await res.json().catch(() => ({}))
                  alert(typeof data.error === 'string' ? data.error : 'シフト確定に失敗しました')
                }
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
            >
              <Check className="w-4 h-4" />
              シフトを確定
            </button>
          )}

          {period.status === 'CONFIRMED' && (
            <button
              onClick={async () => {
                if (!confirm('確定を取り消して手動調整モードに戻しますか？\n(編集内容は保持されます)')) return
                await fetch(`/api/shift-periods/${id}/unconfirm`, { method: 'POST' })
                fetchPeriod()
                fetchCandidates()
              }}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 text-sm font-medium"
            >
              確定取消
            </button>
          )}

          {currentCandidate && (period.status === 'REVIEW' || period.status === 'ADJUSTING' || period.status === 'CONFIRMED') && (
            <button
              onClick={() => {
                exportShiftToExcel({
                  label: period.label,
                  startDate: period.startDate,
                  endDate: period.endDate,
                  assignments: currentCandidate.assignments.map((a) => ({
                    employeeId: a.employeeId,
                    date: a.date,
                    workplace: a.workplace,
                    memo: a.memo,
                    employee: a.employee,
                  })),
                  allEmployees,
                  holidays,
                })
              }}
              className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Excelダウンロード
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

      {/* DRAFT: 準備モード */}
      {period.status === 'DRAFT' && (
        <div className="space-y-4">
          {/* 申請一覧 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            {(() => {
              const pendingCount = pendingRequests.filter((r) => r.status === 'PENDING').length
              const approvedCount = pendingRequests.filter((r) => r.status === 'APPROVED').length
              const rejectedCount = pendingRequests.filter((r) => r.status === 'REJECTED').length
              return (
                <h2 className="font-semibold mb-3">
                  申請（{pendingRequests.length}件）
                  {pendingCount > 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">未処理 {pendingCount}</span>}
                  {approvedCount > 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">承認済 {approvedCount}</span>}
                  {rejectedCount > 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">却下 {rejectedCount}</span>}
                </h2>
              )
            })()}
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-gray-400">期間内に申請はありません</p>
            ) : (
              <div className="space-y-1">
                {pendingRequests.map((r) => {
                  const handleStatusChange = async (newStatus: 'PENDING' | 'APPROVED' | 'REJECTED') => {
                    if (r.status === 'APPROVED' && newStatus !== 'APPROVED') {
                      if (!confirm(`承認済みの申請を${newStatus === 'REJECTED' ? '却下' : 'PENDINGに戻し'}ます。承認時に作られた事前確定セルは取り消されます。よろしいですか？`)) return
                    }
                    const res = await fetch(`/api/day-off-requests/${r.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: newStatus }),
                    })
                    if (res.ok) {
                      const data = await res.json()
                      const a = data.updatedAssignments ?? 0
                      const p = data.updatedPreAssignments ?? 0
                      const rev = data.revertedPreAssignments ?? 0
                      const parts: string[] = []
                      if (a > 0) parts.push(`シフト割当 ${a}件休みに`)
                      if (p > 0) parts.push(`事前確定 ${p}件追加`)
                      if (rev > 0) parts.push(`事前確定 ${rev}件取り消し`)
                      if (parts.length > 0) alert(parts.join('\n'))
                    }
                    fetchPendingRequests()
                    fetchPreAssignments()
                    fetchCandidates()
                  }
                  const statusBadge = r.status === 'PENDING'
                    ? <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">未処理</span>
                    : r.status === 'APPROVED'
                      ? <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">承認済</span>
                      : <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">却下</span>
                  return (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-gray-500">{r.date.split('T')[0]}</span>
                        <span className="font-medium">{r.employee.lastName} {r.employee.firstName}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${r.type === 'DAY_OFF' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          {r.type === 'DAY_OFF' ? '公休' : '有休'}
                        </span>
                        {statusBadge}
                        {r.memo && <span className="text-xs text-gray-400">{r.memo}</span>}
                        <span className="text-xs text-gray-400 ml-auto">
                          申請: {new Date(r.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {r.status !== 'APPROVED' && (
                          <button
                            onClick={() => handleStatusChange('APPROVED')}
                            className="text-xs px-2 py-1 rounded bg-green-50 hover:bg-green-100 text-green-600"
                          >
                            承認
                          </button>
                        )}
                        {r.status !== 'REJECTED' && (
                          <button
                            onClick={() => handleStatusChange('REJECTED')}
                            className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600"
                          >
                            却下
                          </button>
                        )}
                        {r.status !== 'PENDING' && (
                          <button
                            onClick={() => handleStatusChange('PENDING')}
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                          >
                            未処理に戻す
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 事前確定入力 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h2 className="font-semibold mb-1">事前確定（任意）</h2>
            <p className="text-xs text-gray-400 mb-3">セルをクリックして「自動生成で動かさない」セルを指定できます。各従業員の通年ルールはここに自動展開されます。</p>
            <ShiftGrid
              startDate={period.startDate}
              endDate={period.endDate}
              assignments={preAssignments.map((p) => ({
                employeeId: p.employeeId,
                date: p.date,
                workplace: p.workplace ?? '',
                workplaceSlotId: null,
                slotName: null,
                slotNumber: null,
                memo: p.memo,
                color: p.color,
                employee: p.employee,
              }))}
              allEmployees={allEmployees}
              holidays={holidays}
              preAssignedKeys={new Set(preAssignments.map((p) => `${p.employeeId}-${p.date.split('T')[0]}`))}
              editable
              onEdit={async ({ employeeId, date, workplace, memo, color, clear }) => {
                if (clear) {
                  // 事前確定取消 → 削除
                  await fetch(`/api/shift-periods/${id}/pre-assignments`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ employeeId, date, workplace: null, memo: null, color: null, clear: true }),
                  })
                } else {
                  // 出勤・休みどちらでも upsert (workplace=null は休み確定)
                  await fetch(`/api/shift-periods/${id}/pre-assignments`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ employeeId, date, workplace, memo, color }),
                  })
                }
                fetchPreAssignments()
              }}
            />
          </div>
        </div>
      )}

      {/* 候補がない場合 */}
      {candidates.length === 0 && period.status !== 'GENERATING' && period.status !== 'DRAFT' && (
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

      {/* 生成後の PENDING 申請通知 (REVIEW / ADJUSTING / CONFIRMED) */}
      {(period.status === 'REVIEW' || period.status === 'ADJUSTING' || period.status === 'CONFIRMED') && (() => {
        const pendings = pendingRequests.filter((r) => r.status === 'PENDING')
        if (pendings.length === 0) return null
        return (
          <div className="sticky top-4 z-40 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-md max-h-48 overflow-y-auto">
            <div className="flex items-start gap-2">
              <span className="text-amber-700 font-semibold text-sm">⚠ 生成後に届いた未処理申請が {pendings.length}件 あります</span>
            </div>
            <p className="text-xs text-amber-700 mt-1 mb-3">
              承認するとシフト割当が「休み」に自動変更され、人数不足が発生します。下のシフト表で代替の人を手動配置してください。
            </p>
            <div className="space-y-1">
              {pendings.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-white rounded text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-gray-500">{r.date.split('T')[0]}</span>
                    <span className="font-medium">{r.employee.lastName} {r.employee.firstName}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.type === 'DAY_OFF' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                      {r.type === 'DAY_OFF' ? '公休' : '有休'}
                    </span>
                    {r.memo && <span className="text-xs text-gray-400">{r.memo}</span>}
                    <span className="text-xs text-gray-400">
                      申請: {new Date(r.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={async () => {
                        if (!confirm(`${r.employee.lastName} ${r.employee.firstName} さんの ${r.date.split('T')[0]} の申請を承認します。\n\nシフト表のその日の勤務が「休み」に変更されます。\n人数不足が発生するため、代わりの人を手動配置してください。\n\n承認しますか？`)) return
                        const res = await fetch(`/api/day-off-requests/${r.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'APPROVED' }),
                        })
                        if (res.ok) {
                          const data = await res.json()
                          const a = data.updatedAssignments ?? 0
                          if (a > 0) alert(`承認しました。シフト割当 ${a}件を休みに更新しました。代わりの配置を確認してください。`)
                          else alert('承認しました')
                        }
                        fetchPendingRequests()
                        fetchPreAssignments()
                        fetchCandidates()
                      }}
                      className="text-xs px-2 py-1 rounded bg-green-50 hover:bg-green-100 text-green-600"
                    >
                      承認
                    </button>
                    <button
                      onClick={async () => {
                        await fetch(`/api/day-off-requests/${r.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'REJECTED' }),
                        })
                        fetchPendingRequests()
                      }}
                      className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600"
                    >
                      却下
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* 候補セレクタ + グリッド */}
      {candidates.length > 0 && (
        <>
          {/* 候補タブ (違反少ない順に並んでいる) */}
          <div className="flex gap-2 mb-4">
            {enrichedCandidates.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setSelectedCandidate(i)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCandidate === i
                    ? 'bg-[#0AB4CC] text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-[#0AB4CC]/30'
                } ${c.isSelected ? 'ring-2 ring-green-400' : ''}`}
              >
                候補 {i + 1}
                <span className="ml-2 text-xs opacity-75">(違反{c.recalcViolations.length})</span>
                {c.isSelected && <span className="ml-1 text-xs">(確定)</span>}
              </button>
            ))}
          </div>

          {/* SOFT違反パネル（リアルタイム計算: 人数+ポジション+正社員） */}
          {currentCandidate && (() => {
            const periodStart = new Date(period.startDate)
            const periodEnd = new Date(period.endDate)
            const dates: string[] = []
            const cur = new Date(periodStart)
            while (cur <= periodEnd) {
              const y = cur.getFullYear()
              const m = String(cur.getMonth() + 1).padStart(2, '0')
              const d = String(cur.getDate()).padStart(2, '0')
              dates.push(`${y}-${m}-${d}`)
              cur.setDate(cur.getDate() + 1)
            }
            const holidaySet = new Set(holidays.map((h) => h.date.split('T')[0]))

            const violations: SoftViolation[] = calculateSoftViolations({
              dates,
              holidaySet,
              assignments: currentCandidate.assignments.map((a) => ({
                employeeId: a.employeeId,
                date: a.date.split('T')[0],
                workplace: a.workplace,
              })),
              employees: employeeDetails,
              slots,
              staffingRules,
            })

            const hasPending = (period.status === 'REVIEW' || period.status === 'ADJUSTING' || period.status === 'CONFIRMED')
              && pendingRequests.some((r) => r.status === 'PENDING')
            const stickyTop = hasPending ? 'top-[14rem]' : 'top-4'

            if (violations.length === 0) {
              return (
                <div className={`sticky ${stickyTop} z-30 mb-4 bg-green-50 border border-green-200 rounded-xl p-4 shadow-md`}>
                  <span className="text-sm font-semibold text-green-700">
                    ✓ SOFT違反なし
                  </span>
                </div>
              )
            }

            const wpLabel: Record<string, string> = { FACTORY: '工場', CAFE: 'カフェ', FLOOR: 'フロア' }
            const counts = {
              staffing: violations.filter((v) => v.kind === 'staffing').length,
              position: violations.filter((v) => v.kind === 'position').length,
              fullTime: violations.filter((v) => v.kind === 'fullTime').length,
            }

            return (
              <div className={`sticky ${stickyTop} z-30 mb-4 bg-orange-50 border border-orange-200 rounded-xl p-4 shadow-md`}>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className="text-sm font-semibold text-orange-700">
                    ⚠ SOFT違反 {violations.length}件
                  </span>
                  {counts.staffing > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">人数 {counts.staffing}</span>
                  )}
                  {counts.position > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">ポジション {counts.position}</span>
                  )}
                  {counts.fullTime > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">正社員 {counts.fullTime}</span>
                  )}
                  <span className="text-xs text-orange-500 ml-auto">クリックで配置候補表示</span>
                </div>
                <div className="max-h-48 overflow-y-auto flex flex-wrap gap-1 text-xs">
                  {violations.map((v, i) => {
                    const onClick = () => {
                      if (v.kind === 'staffing') {
                        setShortageDetail({ kind: 'staffing', date: v.date, workplace: v.workplace })
                      } else if (v.kind === 'position') {
                        setShortageDetail({
                          kind: 'position',
                          date: v.date,
                          workplace: v.workplace,
                          slotId: v.slotId,
                          slotIds: v.slotIds,
                          label: v.label,
                          requiredSkillIds: v.requiredSkillIds,
                        })
                      } else {
                        setShortageDetail({ kind: 'fullTime', date: v.date, workplace: v.workplace })
                      }
                    }
                    const baseCls = 'px-2 py-1 bg-white border rounded transition-colors hover:bg-opacity-80'
                    if (v.kind === 'staffing') {
                      return (
                        <button key={i} onClick={onClick} className={`${baseCls} border-orange-300 hover:bg-orange-100`}>
                          <span className="font-mono text-gray-600">{v.date.slice(5)}</span>
                          <span className="ml-1 text-orange-700 font-medium">{wpLabel[v.workplace]}</span>
                          <span className="ml-1 text-red-600">人数 -{v.short}</span>
                        </button>
                      )
                    }
                    if (v.kind === 'position') {
                      return (
                        <button key={i} onClick={onClick} className={`${baseCls} border-purple-300 hover:bg-purple-100`}>
                          <span className="font-mono text-gray-600">{v.date.slice(5)}</span>
                          <span className="ml-1 text-purple-700 font-medium">{wpLabel[v.workplace]} {v.label}</span>
                        </button>
                      )
                    }
                    return (
                      <button key={i} onClick={onClick} className={`${baseCls} border-blue-300 hover:bg-blue-100`}>
                        <span className="font-mono text-gray-600">{v.date.slice(5)}</span>
                        <span className="ml-1 text-blue-700 font-medium">{wpLabel[v.workplace]} 正社員 {v.current}/{v.required}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* 配置候補モーダル */}
          {shortageDetail && currentCandidate && (
            <ShortageModal
              detail={shortageDetail}
              currentCandidate={currentCandidate}
              employeeDetails={employeeDetails}
              periodStartDate={period.startDate}
              periodEndDate={period.endDate}
              holidayCount={8}
              holidaySet={new Set(holidays.map((h) => h.date.split('T')[0]))}
              slots={slots}
              staffingRules={staffingRules}
              onPlace={async ({ employeeId, date, workplace, workplaceSlotId }) => {
                await fetch(`/api/shift-periods/${id}/assignments`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ employeeId, date, workplace, workplaceSlotId, memo: null }),
                })
                setShortageDetail(null)
                fetchCandidates()
              }}
              onClose={() => setShortageDetail(null)}
            />
          )}

          {/* シフトグリッド（3勤務場所まとめて表示） */}
          {currentCandidate && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 overflow-hidden">
              <ShiftGrid
                startDate={period.startDate}
                endDate={period.endDate}
                assignments={currentCandidate.assignments}
                allEmployees={allEmployees}
                holidays={holidays}
                preAssignedKeys={period.status === 'CONFIRMED' ? undefined : new Set(preAssignments.map((p) => `${p.employeeId}-${p.date.split('T')[0]}`))}
                staffingRules={staffingRules}
                editable={period.status === 'ADJUSTING' && currentCandidate?.isSelected}
                onEdit={async ({ employeeId, date, workplace, memo, color }) => {
                  await fetch(`/api/shift-periods/${id}/assignments`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ employeeId, date, workplace, memo, color }),
                  })
                  fetchCandidates()
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
