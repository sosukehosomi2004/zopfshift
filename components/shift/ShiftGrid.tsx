'use client'

import { useMemo, useState } from 'react'

type Assignment = {
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
    employeeNumber: string
    lastName: string
    firstName: string
    employmentType: string
    primaryWorkplace: string
  }
}

type Employee = {
  id: string
  employeeNumber: string
  lastName: string
  firstName: string
  employmentType: string
  primaryWorkplace: string
}

type Props = {
  startDate: string
  endDate: string
  assignments: Assignment[]
  allEmployees?: Employee[]
  holidays?: { date: string; name: string }[]
  preAssignedKeys?: Set<string> // `${empId}-${date}` の事前確定セル
  pendingRequestKeys?: Set<string> // `${empId}-${date}` の未処理(PENDING)申請セル
  editable?: boolean
  // draft モード: assignment が無いセルは空欄表示 (スラッシュなし)
  // false (デフォルト): assignment 無し = 自動生成の休み扱いでスラッシュ表示
  draftMode?: boolean
  staffingRules?: { workplace: string; dayType: string; requiredCount: number }[]
  onEdit?: (params: { employeeId: string; date: string; workplace: string | null; memo: string | null; color: string | null; clear?: boolean }) => void | Promise<void>
}

// プリセットカラー (任意塗り潰し): キー → Tailwind bg クラス
// 勤務場所色（青系=工場 / 黄=カフェ / 緑=フロア / 赤=L）と被らないよう除外
export const CELL_COLOR_PRESETS: Record<string, string> = {
  orange: 'bg-orange-500',
  amber: 'bg-amber-600',
  fuchsia: 'bg-fuchsia-500',
  pink: 'bg-pink-500',
  indigo: 'bg-indigo-500',
  slate: 'bg-slate-500',
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

const WORKPLACE_LABEL: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
  L: 'L',
  F: 'F',
  OFFICE: '事務',
  OTHER: '出勤',
}

// 勤務場所色 (薄めのパステル: -100〜-200 を基本)
// F は塗りつぶし無し
const CELL_COLOR_BY_WORKPLACE: Record<string, string> = {
  FACTORY: 'bg-[#0AB4CC]/15',
  CAFE: 'bg-yellow-200',
  FLOOR: 'bg-green-200',
  L: 'bg-red-200',
  F: '',
  OFFICE: 'bg-purple-100',
  OTHER: 'bg-stone-200',
}

const LEGEND_COLOR: Record<string, string> = {
  FACTORY: 'bg-[#0AB4CC]/30 border-[#0AB4CC]',
  CAFE: 'bg-yellow-200 border-yellow-400',
  FLOOR: 'bg-green-200 border-green-400',
  L: 'bg-red-200 border-red-400',
  F: 'bg-white border-gray-400',
  OFFICE: 'bg-purple-100 border-purple-300',
  OTHER: 'bg-stone-200 border-stone-400',
}

function parseDate(s: string): Date {
  return new Date(s.split('T')[0] + 'T00:00:00')
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Shift+クリック範囲選択用: anchor から target までの矩形 (employee × date) 内のセルキーを返す
 */
function computeRangeSelection(
  anchorKey: string,
  targetKey: string,
  employees: Employee[],
  dates: Date[],
): Set<string> {
  const [aEmpId, aDate] = anchorKey.split('|')
  const [tEmpId, tDate] = targetKey.split('|')
  const empIdxA = employees.findIndex((e) => e.id === aEmpId)
  const empIdxT = employees.findIndex((e) => e.id === tEmpId)
  const dateIdxA = dates.findIndex((d) => formatDateStr(d) === aDate)
  const dateIdxT = dates.findIndex((d) => formatDateStr(d) === tDate)
  if (empIdxA < 0 || empIdxT < 0 || dateIdxA < 0 || dateIdxT < 0) {
    return new Set([anchorKey, targetKey])
  }
  const empFrom = Math.min(empIdxA, empIdxT)
  const empTo = Math.max(empIdxA, empIdxT)
  const dateFrom = Math.min(dateIdxA, dateIdxT)
  const dateTo = Math.max(dateIdxA, dateIdxT)
  const set = new Set<string>()
  for (let i = empFrom; i <= empTo; i++) {
    for (let j = dateFrom; j <= dateTo; j++) {
      set.add(`${employees[i].id}|${formatDateStr(dates[j])}`)
    }
  }
  return set
}

// 日曜の右端 = 週の区切り。太い右ボーダーを返す。
function weekDividerClass(d: Date): string {
  return d.getDay() === 0 ? 'border-r-2 border-r-gray-400' : ''
}

// 行を2行ごとにグルーピング: 2,4,6行目の下に太いボーダー
function rowBandClass(rowIdx: number): string {
  return (rowIdx + 1) % 2 === 0 ? 'border-b-2 border-b-gray-400' : ''
}

export function ShiftGrid({ startDate, endDate, assignments, allEmployees: allEmployeesProp, holidays, preAssignedKeys, pendingRequestKeys, editable, draftMode, staffingRules, onEdit }: Props) {
  const holidaySet = useMemo(() => {
    const set = new Set<string>()
    if (holidays) for (const h of holidays) set.add(h.date.split('T')[0])
    return set
  }, [holidays])
  const [editingCells, setEditingCells] = useState<{ employeeId: string; date: string; primaryWorkplace: string }[] | null>(null)
  // 複数選択用: 選択中のセル (key = `${empId}|${date}`)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  // 範囲選択のアンカー
  const [anchorKey, setAnchorKey] = useState<string | null>(null)
  // セル情報マップ (selection から再構築できるよう)
  const cellInfoRef = new Map<string, { employeeId: string; date: string; primaryWorkplace: string }>()

  const dates = useMemo(() => {
    const result: Date[] = []
    const start = parseDate(startDate)
    const end = parseDate(endDate)
    const current = new Date(start)
    while (current <= end) {
      result.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return result
  }, [startDate, endDate])

  const monthGroups = useMemo(() => {
    const groups: { month: string; count: number }[] = []
    let currentMonth = ''
    for (const d of dates) {
      const m = `${d.getMonth() + 1}月`
      if (m !== currentMonth) {
        groups.push({ month: m, count: 1 })
        currentMonth = m
      } else {
        groups[groups.length - 1].count++
      }
    }
    return groups
  }, [dates])

  const assignmentMap = useMemo(() => {
    const map = new Map<string, Assignment>()
    for (const a of assignments) {
      const dateStr = a.date.split('T')[0]
      map.set(`${a.employeeId}-${dateStr}`, a)
    }
    return map
  }, [assignments])

  const allEmployees = useMemo(() => {
    // 全従業員リストが渡されていればそれを使う（パート含む）
    const source: Employee[] = allEmployeesProp ?? (() => {
      const empMap = new Map<string, Employee>()
      for (const a of assignments) {
        if (!empMap.has(a.employeeId)) {
          empMap.set(a.employeeId, a.employee)
        }
      }
      return Array.from(empMap.values())
    })()
    return [...source].sort((a, b) => {
      if (a.employmentType !== b.employmentType) {
        return a.employmentType === 'FULL_TIME' ? -1 : 1
      }
      return a.employeeNumber.localeCompare(b.employeeNumber)
    })
  }, [assignments, allEmployeesProp])

  // 違反チェック（リアルタイム）
  const violations = useMemo(() => {
    const v: Set<string> = new Set() // key: `${empId}-${dateStr}` or `${date}-${workplace}` etc
    const empViolations: Map<string, string[]> = new Map() // empId → messages

    // 5連勤チェック（workplace=nullは休み）
    for (const emp of allEmployees) {
      let consecutive = 0
      for (const d of dates) {
        const dateStr = formatDateStr(d)
        const a = assignmentMap.get(`${emp.id}-${dateStr}`)
        if (a && a.workplace) {
          consecutive++
          if (consecutive > 5) {
            v.add(`${emp.id}-${dateStr}`)
            const msgs = empViolations.get(emp.id) ?? []
            msgs.push(`${dateStr}: ${consecutive}連勤`)
            empViolations.set(emp.id, msgs)
          }
        } else {
          consecutive = 0
        }
      }
    }

    return { cells: v, byEmp: empViolations }
  }, [allEmployees, dates, assignmentMap])

  // 各勤務場所セクションは primary 従業員行と、移動者用の匿名スロット行で構成。
  //   maxMovedIn: 期間中の任意の日でこの勤務場所への移動者最大数
  //   movedInPerDay: 日付 → その日の移動者数 (誰が来たかは保持しない)
  const sections: Array<{
    workplace: string
    employees: Employee[]
    maxMovedIn: number
    movedInPerDay: Map<string, number>
  }> = ['FACTORY', 'CAFE', 'FLOOR', 'L', 'OFFICE', 'OTHER'].map((wp) => {
    const primary = allEmployees.filter((e) => e.primaryWorkplace === wp)
    const movedInPerDay = new Map<string, number>()
    for (const a of assignments) {
      if (a.workplace !== wp) continue
      if (a.employee.primaryWorkplace === wp) continue
      const d = a.date.split('T')[0]
      movedInPerDay.set(d, (movedInPerDay.get(d) ?? 0) + 1)
    }
    let maxMovedIn = 0
    for (const v of Array.from(movedInPerDay.values())) {
      if (v > maxMovedIn) maxMovedIn = v
    }
    return { workplace: wp, employees: primary, maxMovedIn, movedInPerDay }
  }).filter((s) => s.employees.length > 0 || s.maxMovedIn > 0)

  const handleCellClick = (employeeId: string, date: string, primaryWorkplace: string, e?: React.MouseEvent) => {
    if (!editable) return
    const key = `${employeeId}|${date}`
    cellInfoRef.set(key, { employeeId, date, primaryWorkplace })

    if (e?.shiftKey && anchorKey) {
      // 範囲選択: anchor から現在のセルまで (employee と date 両方の矩形)
      const range = computeRangeSelection(anchorKey, key, allEmployees, dates)
      setSelectedKeys(range)
      return
    }
    if (e?.ctrlKey || e?.metaKey) {
      // トグル
      const next = new Set(selectedKeys)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setSelectedKeys(next)
      setAnchorKey(key)
      return
    }

    // 通常クリック
    if (selectedKeys.has(key) && selectedKeys.size > 1) {
      // 選択中のセル群をまとめて編集
      const cells = Array.from(selectedKeys).map((k) => {
        const [empId, d] = k.split('|')
        const info = cellInfoRef.get(k) ?? { employeeId: empId, date: d, primaryWorkplace }
        return info
      })
      setEditingCells(cells)
    } else {
      // 単一選択 + 編集
      setSelectedKeys(new Set([key]))
      setAnchorKey(key)
      setEditingCells([{ employeeId, date, primaryWorkplace }])
    }
  }

  const handleEdit = async (workplace: string | null, memo: string | null, color: string | null, clear?: boolean) => {
    if (!editingCells || !onEdit) return
    // 一括処理: 各セルに対して onEdit を順次呼ぶ
    for (const c of editingCells) {
      await onEdit({ employeeId: c.employeeId, date: c.date, workplace, memo, color, clear })
    }
    setEditingCells(null)
    setSelectedKeys(new Set())
  }

  // 編集対象が単一セルなら現在の値を初期表示。複数選択時は空 (一括設定)。
  const editingFirstCell = editingCells?.[0]
  const editingIsBatch = (editingCells?.length ?? 0) > 1
  const editingIsPreAssigned = editingFirstCell && !editingIsBatch
    ? preAssignedKeys?.has(`${editingFirstCell.employeeId}-${editingFirstCell.date}`) ?? false
    : false

  const editingAssignment = editingFirstCell && !editingIsBatch
    ? assignmentMap.get(`${editingFirstCell.employeeId}-${editingFirstCell.date}`)
    : null

  return (
    <div className="space-y-6">
      {/* 凡例 */}
      <div className="flex flex-wrap gap-3 items-center text-xs">
        <span className="text-gray-500 font-medium">凡例:</span>
        {['FACTORY', 'CAFE', 'FLOOR', 'L', 'OTHER'].map((wp) => (
          <span key={wp} className="flex items-center gap-1.5">
            <span className={`inline-block w-4 h-4 rounded border ${LEGEND_COLOR[wp]}`} />
            <span className="text-gray-700">{WORKPLACE_LABEL[wp]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 ml-2">
          <span className="inline-block w-4 h-4 rounded bg-gray-100 border border-gray-300 text-center text-gray-300 leading-none">/</span>
          <span className="text-gray-700">休み</span>
        </span>
      </div>

      <div className="overflow-x-auto space-y-6">
        {sections.map((section) => (
          <WorkplaceTable
            key={section.workplace}
            workplace={section.workplace}
            employees={section.employees}
            maxMovedIn={section.maxMovedIn}
            movedInPerDay={section.movedInPerDay}
            dates={dates}
            monthGroups={monthGroups}
            assignmentMap={assignmentMap}
            holidaySet={holidaySet}
            preAssignedKeys={preAssignedKeys}
            pendingRequestKeys={pendingRequestKeys}
            editable={editable}
            draftMode={draftMode}
            selectedKeys={selectedKeys}
            staffingRules={staffingRules}
            violationCells={violations.cells}
            onCellClick={handleCellClick}
          />
        ))}
      </div>

      {editingCells && editingCells.length > 0 && (
        <CellEditor
          date={editingFirstCell!.date}
          currentWorkplace={editingAssignment?.workplace ?? null}
          currentMemo={editingAssignment?.memo ?? null}
          currentColor={editingAssignment?.color ?? null}
          primaryWorkplace={editingFirstCell!.primaryWorkplace}
          isPreAssigned={editingIsPreAssigned}
          batchCount={editingIsBatch ? editingCells.length : undefined}
          onSave={handleEdit}
          onClose={() => { setEditingCells(null); setSelectedKeys(new Set()) }}
        />
      )}
      </div>
  )
}

type WorkplaceTableProps = {
  workplace: string
  employees: Employee[]
  maxMovedIn: number
  movedInPerDay: Map<string, number>
  dates: Date[]
  monthGroups: { month: string; count: number }[]
  assignmentMap: Map<string, Assignment>
  holidaySet: Set<string>
  preAssignedKeys?: Set<string>
  pendingRequestKeys?: Set<string>
  editable?: boolean
  draftMode?: boolean
  selectedKeys?: Set<string>
  staffingRules?: { workplace: string; dayType: string; requiredCount: number }[]
  violationCells: Set<string>
  onCellClick: (empId: string, date: string, primaryWorkplace: string, e?: React.MouseEvent) => void
}

function isHoliday(date: Date, holidaySet: Set<string>): boolean {
  const dow = date.getDay()
  if (dow === 0 || dow === 6) return true
  return holidaySet.has(formatDateStr(date))
}

function WorkplaceTable({ workplace, employees, maxMovedIn, movedInPerDay, dates, monthGroups, assignmentMap, holidaySet, preAssignedKeys, pendingRequestKeys, editable, draftMode, selectedKeys, staffingRules, violationCells, onCellClick }: WorkplaceTableProps) {
  const empStats = useMemo(() => {
    const stats = new Map<string, { workDays: number; offDays: number; paidLeaveDays: number }>()
    for (const emp of employees) {
      let workDays = 0
      let paidLeaveDays = 0
      for (const d of dates) {
        const a = assignmentMap.get(`${emp.id}-${formatDateStr(d)}`)
        if (a && a.workplace) workDays++ // workplace=null は休み
        else if (a?.memo === '有') paidLeaveDays++ // 有給
      }
      // 公休 = 全日数 - 出勤 - 有休
      stats.set(emp.id, { workDays, offDays: dates.length - workDays - paidLeaveDays, paidLeaveDays })
    }
    return stats
  }, [employees, dates, assignmentMap])

  // 各日付の通し番号: 正社員 → 移動者 → パート の順で 1, 2, 3...
  // 移動者の番号は別途スロット行で計算する。ここでは正社員とパートの分のみ。
  const isCounted = (a: Assignment | undefined): boolean => !!a && a.workplace === workplace
  const seqMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of dates) {
      const dateStr = formatDateStr(d)
      let n = 0
      for (const emp of employees) {
        if (emp.employmentType !== 'FULL_TIME') continue
        const a = assignmentMap.get(`${emp.id}-${dateStr}`)
        if (isCounted(a)) {
          n++
          map.set(`${emp.id}-${dateStr}`, n)
        }
      }
      n += movedInPerDay.get(dateStr) ?? 0
      for (const emp of employees) {
        if (emp.employmentType === 'FULL_TIME') continue
        const a = assignmentMap.get(`${emp.id}-${dateStr}`)
        if (isCounted(a)) {
          n++
          map.set(`${emp.id}-${dateStr}`, n)
        }
      }
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, dates, assignmentMap, workplace, movedInPerDay])

  const dailyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dates) {
      const dateStr = formatDateStr(d)
      let count = 0
      for (const [, a] of Array.from(assignmentMap.entries())) {
        if (a.date.split('T')[0] === dateStr && a.workplace === workplace) count++
      }
      counts.set(dateStr, count)
    }
    return counts
  }, [dates, workplace, assignmentMap])

  const helpCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dates) {
      const dateStr = formatDateStr(d)
      let count = 0
      for (const [, a] of Array.from(assignmentMap.entries())) {
        if (a.date.split('T')[0] === dateStr && a.workplace === workplace && a.employee.primaryWorkplace !== workplace) {
          count++
        }
      }
      counts.set(dateStr, count)
    }
    return counts
  }, [dates, workplace, assignmentMap])

  const shortageCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dates) {
      const dateStr = formatDateStr(d)
      const dow = d.getDay()
      const isHol = isHoliday(d, holidaySet)
      const dayTypeKey = isHol ? 'HOLIDAY' : (dow === 5 ? 'FRIDAY' : 'WEEKDAY_MON_THU')
      const required = staffingRules?.find((r) => r.workplace === workplace && r.dayType === dayTypeKey)?.requiredCount ?? 0
      const actual = dailyCounts.get(dateStr) ?? 0
      counts.set(dateStr, Math.max(0, required - actual))
    }
    return counts
  }, [dates, workplace, dailyCounts, holidaySet, staffingRules])

  // 余り人員 = 出勤数 - 必要稼働 (0 以上のみ。マイナスは非表示)
  const surplusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dates) {
      const dateStr = formatDateStr(d)
      const dow = d.getDay()
      const isHol = isHoliday(d, holidaySet)
      const dayTypeKey = isHol ? 'HOLIDAY' : (dow === 5 ? 'FRIDAY' : 'WEEKDAY_MON_THU')
      const required = staffingRules?.find((r) => r.workplace === workplace && r.dayType === dayTypeKey)?.requiredCount ?? 0
      const actual = dailyCounts.get(dateStr) ?? 0
      counts.set(dateStr, actual - required) // マイナス含む。表示時に非表示判定
    }
    return counts
  }, [dates, workplace, dailyCounts, holidaySet, staffingRules])

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2 inline-flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded border ${LEGEND_COLOR[workplace]}`} />
        {WORKPLACE_LABEL[workplace]}
      </h3>
      <table className="border-collapse text-xs" style={{ minWidth: dates.length * 32 + 140 }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-white border border-gray-200 px-2 py-1 min-w-[80px]" />
            {monthGroups.map((g, i) => (
              <th key={i} colSpan={g.count}
                className="border border-gray-200 px-1 py-1 bg-gray-50 text-gray-600 font-semibold text-center">
                {g.month}
              </th>
            ))}
            <th className="border border-gray-200 px-2 py-1 bg-gray-50 text-gray-600 font-semibold text-center min-w-[40px]">休</th>
            <th className="border border-gray-200 px-2 py-1 bg-gray-50 text-gray-600 font-semibold text-center min-w-[40px]">有</th>
          </tr>
          <tr>
            <th className="sticky left-0 z-20 bg-white border border-gray-200 px-2 py-1" />
            {dates.map((d) => {
              const dow = d.getDay()
              const isHol = holidaySet.has(formatDateStr(d))
              const isRed = dow === 0 || isHol
              return (
                <th key={d.toISOString()}
                  className={`border border-gray-200 ${weekDividerClass(d)} px-0 py-1 text-center font-semibold min-w-[30px] ${
                    isRed ? 'bg-red-50 text-red-500' : dow === 6 ? 'bg-blue-50 text-blue-500' : 'bg-white text-gray-700'
                  }`}>
                  {d.getDate()}
                </th>
              )
            })}
            <th className="border border-gray-200 px-2 py-1 bg-gray-50" />
            <th className="border border-gray-200 px-2 py-1 bg-gray-50" />
          </tr>
          <tr>
            <th className="sticky left-0 z-20 bg-white border border-gray-200 px-2 py-1" />
            {dates.map((d) => {
              const dow = d.getDay()
              const isHol = holidaySet.has(formatDateStr(d))
              const isRed = dow === 0 || isHol
              return (
                <th key={`dow-${d.toISOString()}`}
                  className={`border border-gray-200 ${weekDividerClass(d)} px-0 py-0.5 text-center font-normal ${
                    isRed ? 'bg-red-50 text-red-400' : dow === 6 ? 'bg-blue-50 text-blue-400' : 'bg-white text-gray-400'
                  }`}>
                  {DAY_NAMES[dow]}
                </th>
              )
            })}
            <th className="border border-gray-200 px-2 py-0.5 bg-gray-50" />
            <th className="border border-gray-200 px-2 py-0.5 bg-gray-50" />
          </tr>
        </thead>
        <tbody>
          {/* 正社員 → 移動者スロット → パート の順 */}
          {(() => {
            const ftEmps = employees.filter((e) => e.employmentType === 'FULL_TIME')
            const ptEmps = employees.filter((e) => e.employmentType !== 'FULL_TIME')
            const ftCount = ftEmps.length
            return <>
          {ftEmps.map((emp, ftIdx) => {
            const rowIdx = ftIdx
            const rowBand = rowBandClass(rowIdx)
            const stats = empStats.get(emp.id)
            return (
              <tr key={emp.id}>
                <td className={`sticky left-0 z-10 bg-white border border-gray-200 ${rowBand} px-2 py-1.5 font-medium text-gray-800 whitespace-nowrap`}>
                  {emp.lastName}
                </td>
                {dates.map((d) => {
                  const dateStr = formatDateStr(d)
                  const a = assignmentMap.get(`${emp.id}-${dateStr}`)
                  // 休み = assignment無し or workplace=null
                  const isOff = !a || !a.workplace
                  const isViolation = violationCells.has(`${emp.id}-${dateStr}`)

                  let cellContent = ''
                  let cellBg = ''
                  let cellText = ''

                  let isSlash = false
                  // memo='連' は前月末からの5連勤回避マーカー。表示はしないが、警告判定用に保持。
                  const displayMemo = a?.memo === '連' ? null : a?.memo
                  if (isOff) {
                    if (displayMemo === '有') {
                      // 有給: 濃い青背景 + 「有」文字 (黒)
                      cellContent = '有'
                      cellBg = 'bg-blue-300'
                      cellText = 'text-gray-900 font-semibold'
                    } else if (displayMemo) {
                      cellContent = displayMemo
                      cellText = 'text-gray-700'
                      cellBg = 'bg-blue-100' // 通常休みと同色
                    } else if (draftMode && !a) {
                      // 下書きモードで PreAssignment 無しのセルは空欄 (背景なし)
                      cellContent = ''
                    } else {
                      // 通常休み: 薄い青背景 + スラッシュ
                      cellContent = ''
                      isSlash = true
                      cellBg = 'bg-blue-100'
                    }
                  } else if (a) {
                    // 本人の主な勤務地と同じなら無色（自勤務）、違えば移動先の色を表示
                    if (a.workplace === a.employee.primaryWorkplace) {
                      cellBg = ''
                    } else {
                      cellBg = CELL_COLOR_BY_WORKPLACE[a.workplace] ?? 'bg-gray-100'
                    }
                    if (displayMemo) {
                      cellContent = displayMemo
                    } else if (a.workplace === 'L') {
                      cellContent = 'L'
                    } else if (a.workplace === 'F') {
                      cellContent = 'F'
                    } else if (a.workplace === 'FLOOR' && a.employee.primaryWorkplace !== 'FLOOR') {
                      cellContent = '店'
                    } else {
                      const seq = seqMap.get(`${emp.id}-${dateStr}`)
                      if (seq !== undefined) cellContent = String(seq)
                    }
                  }
                  // ユーザー指定の塗りつぶし色があれば優先 (休み・出勤両方適用)
                  if (a?.color && CELL_COLOR_PRESETS[a.color]) {
                    cellBg = CELL_COLOR_PRESETS[a.color]
                  }

                  const isPreAssigned = preAssignedKeys?.has(`${emp.id}-${dateStr}`) ?? false
                  const isPending = pendingRequestKeys?.has(`${emp.id}-${dateStr}`) ?? false
                  const isSelected = selectedKeys?.has(`${emp.id}|${dateStr}`) ?? false

                  return (
                    <td key={dateStr}
                      onClick={(e) => onCellClick(emp.id, dateStr, emp.primaryWorkplace, e)}
                      className={`relative border border-gray-200 ${weekDividerClass(d)} ${rowBand} px-0 py-1.5 text-center ${cellBg} ${cellText} ${
                        editable ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-inset' : ''
                      } ${isSelected ? 'ring-4 ring-sky-500 ring-inset z-10' : ''} ${isViolation ? 'ring-2 ring-red-500 ring-inset' : ''} ${
                        isPreAssigned ? 'outline-2 outline-dashed outline-gray-700 outline-offset-[-2px]' : ''
                      } ${isPending && !isPreAssigned ? 'outline outline-2 outline-black outline-offset-[-2px]' : ''}`}>
                      {isSlash && (
                        <span aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <svg width="100%" height="100%" viewBox="0 0 24 24" preserveAspectRatio="none">
                            <line x1="2" y1="22" x2="22" y2="2" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </span>
                      )}
                      {cellContent}
                    </td>
                  )
                })}
                <td className={`border border-gray-200 ${rowBand} px-2 py-1.5 text-center font-semibold text-gray-700 bg-gray-50`}>
                  {stats?.offDays ?? 0}
                </td>
                <td className={`border border-gray-200 ${rowBand} px-2 py-1.5 text-center font-semibold text-gray-700 bg-gray-50`}>
                  {stats?.paidLeaveDays ?? 0}
                </td>
              </tr>
            )
          })}
          {/* 移動者用の匿名スロット行 (期間中の最大移動人数だけ表示) - 正社員とパートの間 */}
          {Array.from({ length: maxMovedIn }).map((_, slotIdx) => {
            const rowIdx = ftCount + slotIdx
            const rowBand = rowBandClass(rowIdx)
            return (
            <tr key={`moved-${slotIdx}`}>
              <td className={`sticky left-0 z-10 bg-white border border-gray-200 ${rowBand} px-2 py-1.5 text-gray-400 italic whitespace-nowrap`}>
                移動 {slotIdx + 1}
              </td>
              {dates.map((d) => {
                const dateStr = formatDateStr(d)
                const movedCount = movedInPerDay.get(dateStr) ?? 0
                if (slotIdx >= movedCount) {
                  return <td key={dateStr} className={`border border-gray-200 ${weekDividerClass(d)} ${rowBand}`} />
                }
                // 通し番号: 正社員 primary 出勤者数 + slotIdx + 1
                let primaryWorking = 0
                for (const emp of employees) {
                  if (emp.employmentType !== 'FULL_TIME') continue
                  const a = assignmentMap.get(`${emp.id}-${dateStr}`)
                  if (a && a.workplace === workplace) primaryWorking++
                }
                const number = primaryWorking + slotIdx + 1
                const cellBg = CELL_COLOR_BY_WORKPLACE[workplace] ?? 'bg-gray-100'
                // 移動先表では通し番号を振る (「店」表記は本人の所属表のセル側で表示)
                const content = String(number)
                return (
                  <td key={dateStr}
                    className={`border border-gray-200 ${weekDividerClass(d)} ${rowBand} px-0 py-1.5 text-center ${cellBg}`}>
                    {content}
                  </td>
                )
              })}
              <td className={`border border-gray-200 ${rowBand} px-2 py-1.5 bg-gray-50`} />
              <td className={`border border-gray-200 ${rowBand} px-2 py-1.5 bg-gray-50`} />
            </tr>
            )
          })}
          {/* パート従業員 */}
          {ptEmps.map((emp, ptIdx) => {
            const rowIdx = ftCount + maxMovedIn + ptIdx
            const rowBand = rowBandClass(rowIdx)
            const stats = empStats.get(emp.id)
            return (
              <tr key={emp.id}>
                <td className={`sticky left-0 z-10 bg-white border border-gray-200 ${rowBand} px-2 py-1.5 font-medium text-gray-600 whitespace-nowrap`}>
                  {emp.lastName}
                </td>
                {dates.map((d) => {
                  const dateStr = formatDateStr(d)
                  const a = assignmentMap.get(`${emp.id}-${dateStr}`)
                  const isOff = !a || !a.workplace
                  const isViolation = violationCells.has(`${emp.id}-${dateStr}`)

                  let cellContent = ''
                  let cellBg = ''
                  let cellText = ''
                  let isSlash = false

                  // memo='連' は前月末からの5連勤回避マーカー。表示はしないが、警告判定用に保持。
                  const displayMemo = a?.memo === '連' ? null : a?.memo
                  if (isOff) {
                    if (displayMemo === '有') {
                      cellContent = '有'
                      cellBg = 'bg-blue-300'
                      cellText = 'text-gray-900 font-semibold'
                    } else if (displayMemo) {
                      cellContent = displayMemo
                      cellText = 'text-gray-700'
                      cellBg = 'bg-blue-100'
                    } else if (draftMode && !a) {
                      cellContent = ''
                    } else {
                      cellContent = ''
                      isSlash = true
                      cellBg = 'bg-blue-100'
                    }
                  } else if (a) {
                    if (a.workplace === a.employee.primaryWorkplace) {
                      cellBg = ''
                    } else {
                      cellBg = CELL_COLOR_BY_WORKPLACE[a.workplace] ?? 'bg-gray-100'
                    }
                    if (displayMemo) {
                      cellContent = displayMemo
                    } else if (a.workplace === 'L') {
                      cellContent = 'L'
                    } else if (a.workplace === 'F') {
                      cellContent = 'F'
                    } else if (a.workplace === 'FLOOR' && a.employee.primaryWorkplace !== 'FLOOR') {
                      cellContent = '店'
                    } else {
                      const seq = seqMap.get(`${emp.id}-${dateStr}`)
                      if (seq !== undefined) cellContent = String(seq)
                    }
                  }
                  if (a?.color && CELL_COLOR_PRESETS[a.color]) {
                    cellBg = CELL_COLOR_PRESETS[a.color]
                  }

                  const isPreAssigned = preAssignedKeys?.has(`${emp.id}-${dateStr}`) ?? false
                  const isPending = pendingRequestKeys?.has(`${emp.id}-${dateStr}`) ?? false
                  const isSelected = selectedKeys?.has(`${emp.id}|${dateStr}`) ?? false

                  return (
                    <td key={dateStr}
                      onClick={(e) => onCellClick(emp.id, dateStr, emp.primaryWorkplace, e)}
                      className={`relative border border-gray-200 ${weekDividerClass(d)} ${rowBand} px-0 py-1.5 text-center ${cellBg} ${cellText} ${
                        editable ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-inset' : ''
                      } ${isSelected ? 'ring-4 ring-sky-500 ring-inset z-10' : ''} ${isViolation ? 'ring-2 ring-red-500 ring-inset' : ''} ${
                        isPreAssigned ? 'outline-2 outline-dashed outline-gray-700 outline-offset-[-2px]' : ''
                      } ${isPending && !isPreAssigned ? 'outline outline-2 outline-black outline-offset-[-2px]' : ''}`}>
                      {isSlash && (
                        <span aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <svg width="100%" height="100%" viewBox="0 0 24 24" preserveAspectRatio="none">
                            <line x1="2" y1="22" x2="22" y2="2" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </span>
                      )}
                      {cellContent}
                    </td>
                  )
                })}
                <td className={`border border-gray-200 ${rowBand} px-2 py-1.5 text-center font-semibold text-gray-700 bg-gray-50`}>
                  {stats?.offDays ?? 0}
                </td>
                <td className={`border border-gray-200 ${rowBand} px-2 py-1.5 text-center font-semibold text-gray-700 bg-gray-50`}>
                  {stats?.paidLeaveDays ?? 0}
                </td>
              </tr>
            )
          })}
          </>
          })()}
          <tr className="border-t-2 border-gray-300">
            <td className="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-2 py-1.5 font-semibold text-gray-600 whitespace-nowrap">
              出勤数
            </td>
            {dates.map((d) => {
              const dateStr = formatDateStr(d)
              const count = dailyCounts.get(dateStr) ?? 0
              const dow = d.getDay()
              return (
                <td key={`count-${dateStr}`}
                  className={`border border-gray-200 ${weekDividerClass(d)} px-0 py-1.5 text-center font-semibold ${
                    (dow === 0 || holidaySet.has(dateStr)) ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : 'bg-gray-100'
                  } text-gray-700`}>
                  {count}
                </td>
              )
            })}
            <td className="border border-gray-200 bg-gray-100" />
            <td className="border border-gray-200 bg-gray-100" />
          </tr>
          <tr>
            <td className="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-2 py-1.5 font-semibold text-gray-600 whitespace-nowrap">
              ヘルプ数
            </td>
            {dates.map((d) => {
              const dateStr = formatDateStr(d)
              const count = helpCounts.get(dateStr) ?? 0
              const dow = d.getDay()
              return (
                <td key={`help-${dateStr}`}
                  className={`border border-gray-200 ${weekDividerClass(d)} px-0 py-1.5 text-center font-semibold ${
                    (dow === 0 || holidaySet.has(dateStr)) ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : 'bg-gray-100'
                  } ${count > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  {count > 0 ? count : '-'}
                </td>
              )
            })}
            <td className="border border-gray-200 bg-gray-100" />
            <td className="border border-gray-200 bg-gray-100" />
          </tr>
          <tr>
            <td className="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-2 py-1.5 font-semibold text-gray-600 whitespace-nowrap">
              不足人員
            </td>
            {dates.map((d) => {
              const dateStr = formatDateStr(d)
              const count = shortageCounts.get(dateStr) ?? 0
              const dow = d.getDay()
              return (
                <td key={`short-${dateStr}`}
                  className={`border border-gray-200 px-0 py-1.5 text-center font-semibold ${
                    (dow === 0 || holidaySet.has(dateStr)) ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : 'bg-gray-100'
                  } ${count > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {count > 0 ? count : '-'}
                </td>
              )
            })}
            <td className="border border-gray-200 bg-gray-100" />
            <td className="border border-gray-200 bg-gray-100" />
          </tr>
          <tr>
            <td className="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-2 py-1.5 font-semibold text-gray-600 whitespace-nowrap">
              余り人員
            </td>
            {dates.map((d) => {
              const dateStr = formatDateStr(d)
              const diff = surplusCounts.get(dateStr) ?? 0
              const dow = d.getDay()
              return (
                <td key={`surplus-${dateStr}`}
                  className={`border border-gray-200 px-0 py-1.5 text-center font-semibold ${
                    (dow === 0 || holidaySet.has(dateStr)) ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : 'bg-gray-100'
                  } ${diff > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                  {diff > 0 ? diff : ''}
                </td>
              )
            })}
            <td className="border border-gray-200 bg-gray-100" />
            <td className="border border-gray-200 bg-gray-100" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

type CellEditorProps = {
  date: string
  currentWorkplace: string | null
  currentMemo: string | null
  currentColor: string | null
  primaryWorkplace: string
  isPreAssigned?: boolean
  batchCount?: number // 2以上で複数セル一括編集モード
  onSave: (workplace: string | null, memo: string | null, color: string | null, clear?: boolean) => void | Promise<void>
  onClose: () => void
}

function CellEditor({ date, currentWorkplace, currentMemo, currentColor, primaryWorkplace, isPreAssigned, batchCount, onSave, onClose }: CellEditorProps) {
  const [memo, setMemo] = useState(currentMemo ?? '')
  const [color, setColor] = useState<string | null>(currentColor ?? null)
  const [saving, setSaving] = useState(false)

  // 「連」マーカー: 前月末から5連勤が続いており、この日は自動で休み確定された日。
  // 出勤に変更すると 5連勤制約違反になるため、警告を出す。
  // currentWorkplace は null または '' (休み) のどちらでも休みとして扱う
  const isStreakRest = currentMemo === '連' && !currentWorkplace

  const handleClick = async (workplace: string | null) => {
    setSaving(true)
    // 出勤に変更する場合は「連」マーカーをクリアしてセル表示を正しく更新する
    const nextMemo = isStreakRest && workplace ? null : (memo || null)
    await onSave(workplace, nextMemo, color)
    setSaving(false)
  }

  const handleClear = async () => {
    setSaving(true)
    await onSave(null, null, null, true)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-900">
            {batchCount && batchCount > 1 ? `選択中 ${batchCount}セル を一括編集` : `${date} のシフト編集`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="text-xs text-gray-500 mb-2">基本勤務場所: {WORKPLACE_LABEL[primaryWorkplace]}</div>

        {isStreakRest && (
          <div className="mb-3 p-2.5 bg-red-50 border border-red-300 rounded-lg text-xs text-red-700">
            <strong>⚠ 前月末から5連勤継続中</strong>
            <p className="mt-1">前月末まで5連勤が続いているため、この日を出勤にすると6連勤となり <strong>5連勤制約違反</strong> になります。</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-4">
          {['FACTORY', 'CAFE', 'FLOOR', 'L', 'F', 'OTHER'].map((wp) => {
            const selected = currentWorkplace === wp
            return (
              <button
                key={wp}
                disabled={saving}
                onClick={() => handleClick(wp)}
                className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  selected
                    ? `${LEGEND_COLOR[wp]} border-current text-gray-900 ring-2 ring-offset-1 ring-gray-400`
                    : `${LEGEND_COLOR[wp]} border-transparent text-gray-700 hover:border-current opacity-70`
                }`}
              >
                <span className={`inline-block w-3 h-3 rounded-sm border ${LEGEND_COLOR[wp]}`} />
                {WORKPLACE_LABEL[wp]}
              </button>
            )
          })}
          <button
            disabled={saving}
            onClick={() => handleClick(null)}
            className={`py-2 rounded-lg text-sm font-medium border-2 disabled:opacity-50 ${
              !currentWorkplace && currentMemo !== '有'
                ? 'bg-blue-100 border-blue-400 text-gray-900'
                : 'bg-blue-50 border-transparent text-gray-700 hover:bg-blue-100'
            }`}
          >
            / 休み
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              // 有給: workplace=null + memo='有'
              setSaving(true)
              await onSave(null, '有', color)
              setSaving(false)
            }}
            className={`py-2 rounded-lg text-sm font-medium border-2 disabled:opacity-50 ${
              !currentWorkplace && currentMemo === '有'
                ? 'bg-blue-400 border-blue-600 text-white'
                : 'bg-blue-200 border-transparent text-gray-900 hover:bg-blue-300'
            }`}
          >
            有 有給
          </button>
        </div>

        <div className="mb-3">
          <label className="text-xs text-gray-500 block mb-1">メモ（1文字）</label>
          <input
            type="text"
            maxLength={1}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: F"
            className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB4CC]/20"
          />
        </div>

        <div className="mb-3">
          <label className="text-xs text-gray-500 block mb-1">塗りつぶし色（任意）</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`w-7 h-7 rounded border-2 text-xs flex items-center justify-center ${
                color === null ? 'border-gray-700 bg-white' : 'border-gray-200 bg-white hover:border-gray-400'
              }`}
              title="勤務場所デフォルト色"
            >
              ×
            </button>
            {Object.entries(CELL_COLOR_PRESETS).map(([key, cls]) => (
              <button
                key={key}
                type="button"
                onClick={() => setColor(key)}
                className={`w-7 h-7 rounded border-2 ${cls} ${
                  color === key ? 'border-gray-700 ring-2 ring-offset-1 ring-gray-400' : 'border-transparent hover:border-gray-400'
                }`}
                title={key}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            disabled={saving}
            onClick={() => handleClick(currentWorkplace)}
            className="flex-1 bg-[#0AB4CC] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#099bb0] disabled:opacity-50"
          >
            {saving ? '保存中...' : 'メモ・色を保存'}
          </button>
        </div>

        {(isPreAssigned || (batchCount && batchCount > 1)) && (
          <div className="mt-3 pt-3 border-t">
            <button
              disabled={saving}
              onClick={handleClear}
              className="w-full py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {batchCount && batchCount > 1 ? `選択中 ${batchCount}セル の事前確定を取り消す` : '事前確定を取り消す'}
            </button>
            <p className="text-xs text-gray-400 mt-1 text-center">
              {batchCount && batchCount > 1
                ? '事前確定のあるセルのみ取消されます。各セルは通常通り自動生成の対象になります'
                : 'この日は通常通り自動生成の対象になります'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
