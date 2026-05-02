'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  calculateSoftViolations,
  diffViolations,
  simulatePlacement,
  type SlotDef,
  type StaffingRule,
  type EmployeeLite,
  type AssignmentLite,
  type SoftViolation,
} from '@/lib/violations-client'

type Assignment = {
  employeeId: string
  date: string
  workplace: string
  workplaceSlotId?: string | null
}

type CandidateLite = {
  assignments: Assignment[]
}

export type ShortageDetail =
  | { kind: 'staffing'; date: string; workplace: string }
  | {
      kind: 'position'
      date: string
      workplace: string
      slotId: string
      slotIds: string[]
      label: string
      requiredSkillIds: string[]
    }
  | { kind: 'fullTime'; date: string; workplace: string }

type Props = {
  detail: ShortageDetail
  currentCandidate: CandidateLite
  employeeDetails: EmployeeLite[]
  periodStartDate: string
  periodEndDate: string
  holidayCount: number
  holidaySet: Set<string>
  slots: SlotDef[]
  staffingRules: StaffingRule[]
  onPlace: (args: {
    employeeId: string
    date: string
    workplace: string
    workplaceSlotId?: string | null
  }) => void | Promise<void>
  onClose: () => void
}

const WP_LABEL: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
  OFFICE: '事務',
  OTHER: 'その他',
}

export function ShortageModal({
  detail,
  currentCandidate,
  employeeDetails,
  periodStartDate,
  periodEndDate,
  holidayCount,
  holidaySet,
  slots,
  staffingRules,
  onPlace,
  onClose,
}: Props) {
  const { date, workplace } = detail

  // ドラッグ
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y }
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPos({ x: dragStart.current.posX + dx, y: dragStart.current.posY + dy })
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // 期間内の全日付
  const allDates = useMemo(() => {
    const result: string[] = []
    const start = new Date(periodStartDate.split('T')[0] + 'T00:00:00')
    const end = new Date(periodEndDate.split('T')[0] + 'T00:00:00')
    const cur = new Date(start)
    while (cur <= end) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      result.push(`${y}-${m}-${d}`)
      cur.setDate(cur.getDate() + 1)
    }
    return result
  }, [periodStartDate, periodEndDate])

  // 各従業員の出勤日マップ
  const empWorkMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>()
    for (const a of currentCandidate.assignments) {
      const dStr = a.date.split('T')[0]
      if (!map.has(a.employeeId)) map.set(a.employeeId, new Map())
      map.get(a.employeeId)!.set(dStr, a.workplace)
    }
    return map
  }, [currentCandidate])

  // 現在のSOFT違反 (差分計算用ベース)
  const currentAssignmentsLite: AssignmentLite[] = useMemo(
    () =>
      currentCandidate.assignments.map((a) => ({
        employeeId: a.employeeId,
        date: a.date.split('T')[0],
        workplace: a.workplace,
      })),
    [currentCandidate],
  )

  const beforeViolations = useMemo(
    () =>
      calculateSoftViolations({
        dates: allDates,
        holidaySet,
        assignments: currentAssignmentsLite,
        employees: employeeDetails,
        slots,
        staffingRules,
      }),
    [allDates, holidaySet, currentAssignmentsLite, employeeDetails, slots, staffingRules],
  )

  // 候補抽出
  const candidates = useMemo(() => {
    type Candidate = {
      emp: EmployeeLite
      currentWorkplace?: string
      hardWarnings: string[]
      softResolved: SoftViolation[]
      softCreated: SoftViolation[]
      score: number
      targetSlotId?: string | null
    }
    const list: Candidate[] = []

    for (const emp of employeeDetails) {
      // モード別の絞り込み
      if (detail.kind === 'fullTime' && emp.employmentType !== 'FULL_TIME') continue
      if (detail.kind === 'position') {
        const hasSkill = emp.skills.some((sk) =>
          detail.requiredSkillIds.includes(sk.skillId),
        )
        if (!hasSkill) continue
      }

      // 勤務場所適性
      const allowedWorkplaces = new Set([
        emp.primaryWorkplace,
        ...emp.secondaryWorkplaces.map((sw) => sw.workplace),
      ])
      if (!allowedWorkplaces.has(workplace)) continue

      const workMap = empWorkMap.get(emp.id) ?? new Map()
      const currentWorkplace = workMap.get(date)
      if (currentWorkplace === workplace) continue

      const hardWarnings: string[] = []
      let score = 100

      // 5連勤
      const tempWork = new Map(workMap)
      tempWork.set(date, workplace)
      let maxConsecutive = 0
      let consec = 0
      for (const d of allDates) {
        if (tempWork.has(d)) {
          consec++
          if (consec > maxConsecutive) maxConsecutive = consec
        } else {
          consec = 0
        }
      }
      if (maxConsecutive > 5) {
        hardWarnings.push(`5連勤超過 (${maxConsecutive}日)`)
        score -= 1000
      }

      // 公休数
      let workCount = 0
      for (const d of allDates) {
        if (tempWork.has(d)) workCount++
      }
      const restCount = allDates.length - workCount
      if (restCount < holidayCount) {
        hardWarnings.push(`公休不足 (${restCount}日)`)
        score -= 1000
      }

      // 配置先のスロットID推定 (positionモードのみ)
      let targetSlotId: string | null = null
      if (detail.kind === 'position') {
        // requiredSkillsの中で本人が持っているものを優先
        const candidateSlot = slots.find(
          (s) =>
            detail.slotIds.includes(s.id) &&
            s.requiredSkillIds.some((sid) =>
              emp.skills.some((sk) => sk.skillId === sid),
            ),
        )
        targetSlotId = candidateSlot?.id ?? null
      }

      // 配置シミュレーション → 違反差分
      const simulated = simulatePlacement(currentAssignmentsLite, {
        employeeId: emp.id,
        date,
        workplace,
      })
      const afterViolations = calculateSoftViolations({
        dates: allDates,
        holidaySet,
        assignments: simulated,
        employees: employeeDetails,
        slots,
        staffingRules,
      })
      const { resolved, created } = diffViolations(beforeViolations, afterViolations)

      score += resolved.length * 50 - created.length * 30
      if (!currentWorkplace) score += 30 // 休み→出勤がベター

      list.push({
        emp,
        currentWorkplace,
        hardWarnings,
        softResolved: resolved,
        softCreated: created,
        score,
        targetSlotId,
      })
    }

    list.sort((a, b) => b.score - a.score)
    return list
  }, [
    detail,
    employeeDetails,
    workplace,
    date,
    empWorkMap,
    allDates,
    holidayCount,
    currentAssignmentsLite,
    beforeViolations,
    holidaySet,
    slots,
    staffingRules,
  ])

  const headerLabel = (() => {
    if (detail.kind === 'staffing') return `${date} ${WP_LABEL[workplace]} 人数不足の配置候補`
    if (detail.kind === 'position') return `${date} ${WP_LABEL[workplace]} ${detail.label} の配置候補`
    return `${date} ${WP_LABEL[workplace]} 正社員不足の配置候補`
  })()

  const formatViolation = (v: SoftViolation): string => {
    if (v.kind === 'staffing') return `${v.date.slice(5)} ${WP_LABEL[v.workplace]}人数`
    if (v.kind === 'position') return `${v.date.slice(5)} ${WP_LABEL[v.workplace]}${v.label}`
    return `${v.date.slice(5)} ${WP_LABEL[v.workplace]}正社員`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose}>
      <div
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        className="bg-white rounded-xl shadow-xl w-[28rem] max-h-[80vh] overflow-hidden flex flex-col absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onMouseDown={handleMouseDown}
          className="flex justify-between items-center p-4 border-b cursor-move bg-gray-50 select-none"
        >
          <h3 className="font-semibold text-gray-900 text-sm">{headerLabel}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              配置可能な従業員がいません
            </p>
          ) : (
            <div className="space-y-1">
              {candidates.map(
                ({ emp, currentWorkplace, hardWarnings, softResolved, softCreated, targetSlotId }) => {
                  const hasHard = hardWarnings.length > 0
                  const hasNew = softCreated.length > 0
                  return (
                    <button
                      key={emp.id}
                      onClick={() =>
                        onPlace({
                          employeeId: emp.id,
                          date,
                          workplace,
                          workplaceSlotId: targetSlotId ?? null,
                        })
                      }
                      className={`w-full flex flex-col px-3 py-2 rounded-lg transition-colors text-left ${
                        hasHard
                          ? 'bg-red-50 hover:bg-red-100 border border-red-200'
                          : hasNew
                            ? 'bg-amber-50 hover:bg-amber-100 border border-amber-200'
                            : 'bg-gray-50 hover:bg-[#0AB4CC]/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-gray-900">
                            {emp.lastName} {emp.firstName}
                          </span>
                          <span className="ml-2 text-xs text-gray-400">
                            ({WP_LABEL[emp.primaryWorkplace] ?? emp.primaryWorkplace}
                            {emp.employmentType === 'PART_TIME' ? '・パート' : ''})
                          </span>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            currentWorkplace
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {currentWorkplace
                            ? `${WP_LABEL[currentWorkplace] ?? currentWorkplace}から移動`
                            : '休み→出勤'}
                        </span>
                      </div>

                      {hardWarnings.length > 0 && (
                        <div className="mt-1 text-xs text-red-600 flex flex-wrap gap-1">
                          {hardWarnings.map((w, i) => (
                            <span key={i} className="bg-red-100 px-1.5 py-0.5 rounded">
                              ⚠ {w}
                            </span>
                          ))}
                        </div>
                      )}

                      {softResolved.length > 0 && (
                        <div className="mt-1 text-xs text-emerald-700 flex flex-wrap gap-1">
                          {softResolved.map((v, i) => (
                            <span key={i} className="bg-emerald-100 px-1.5 py-0.5 rounded">
                              ✓ {formatViolation(v)}解消
                            </span>
                          ))}
                        </div>
                      )}

                      {softCreated.length > 0 && (
                        <div className="mt-1 text-xs text-amber-700 flex flex-wrap gap-1">
                          {softCreated.map((v, i) => (
                            <span key={i} className="bg-amber-100 px-1.5 py-0.5 rounded">
                              + {formatViolation(v)}発生
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                },
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
