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
  employee: {
    id: string
    employeeNumber: number
    lastName: string
    firstName: string
    employmentType: string
    primaryWorkplace: string
  }
}

type Employee = {
  id: string
  employeeNumber: number
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
  editable?: boolean
  staffingRules?: { workplace: string; dayType: string; requiredCount: number }[]
  onEdit?: (params: { employeeId: string; date: string; workplace: string | null; memo: string | null; clear?: boolean }) => void | Promise<void>
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

const WORKPLACE_LABEL: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
  OFFICE: '事務',
  OTHER: 'その他',
}

const CELL_COLOR_BY_WORKPLACE: Record<string, string> = {
  FACTORY: 'bg-[#0AB4CC]/15',
  CAFE: 'bg-yellow-200',
  FLOOR: 'bg-red-200',
  OFFICE: 'bg-purple-100',
  OTHER: 'bg-green-100',
}

// 凡例用の塗り
const LEGEND_COLOR: Record<string, string> = {
  FACTORY: 'bg-[#0AB4CC]/30 border-[#0AB4CC]',
  CAFE: 'bg-yellow-200 border-yellow-400',
  FLOOR: 'bg-red-200 border-red-400',
  OFFICE: 'bg-purple-100 border-purple-300',
  OTHER: 'bg-green-100 border-green-300',
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

export function ShiftGrid({ startDate, endDate, assignments, allEmployees: allEmployeesProp, holidays, preAssignedKeys, editable, staffingRules, onEdit }: Props) {
  const holidaySet = useMemo(() => {
    const set = new Set<string>()
    if (holidays) for (const h of holidays) set.add(h.date.split('T')[0])
    return set
  }, [holidays])
  const [editingCell, setEditingCell] = useState<{ employeeId: string; date: string; primaryWorkplace: string } | null>(null)

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
      return a.employeeNumber - b.employeeNumber
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

  const sections: Array<{ workplace: string; employees: Employee[] }> = ['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER'].map((wp) => ({
    workplace: wp,
    employees: allEmployees.filter((e) => e.primaryWorkplace === wp),
  })).filter((s) => s.employees.length > 0)

  const handleCellClick = (employeeId: string, date: string, primaryWorkplace: string) => {
    if (!editable) return
    setEditingCell({ employeeId, date, primaryWorkplace })
  }

  const handleEdit = async (workplace: string | null, memo: string | null, clear?: boolean) => {
    if (!editingCell || !onEdit) return
    await onEdit({ employeeId: editingCell.employeeId, date: editingCell.date, workplace, memo, clear })
    setEditingCell(null)
  }

  const editingIsPreAssigned = editingCell
    ? preAssignedKeys?.has(`${editingCell.employeeId}-${editingCell.date}`) ?? false
    : false

  const editingAssignment = editingCell
    ? assignmentMap.get(`${editingCell.employeeId}-${editingCell.date}`)
    : null

  return (
    <div className="space-y-6">
      {/* 凡例 */}
      <div className="flex flex-wrap gap-3 items-center text-xs">
        <span className="text-gray-500 font-medium">凡例:</span>
        {['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER'].map((wp) => (
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
            dates={dates}
            monthGroups={monthGroups}
            assignmentMap={assignmentMap}
            holidaySet={holidaySet}
            preAssignedKeys={preAssignedKeys}
            editable={editable}
            staffingRules={staffingRules}
            violationCells={violations.cells}
            onCellClick={handleCellClick}
          />
        ))}
      </div>

      {editingCell && (
        <CellEditor
          date={editingCell.date}
          currentWorkplace={editingAssignment?.workplace ?? null}
          currentMemo={editingAssignment?.memo ?? null}
          primaryWorkplace={editingCell.primaryWorkplace}
          isPreAssigned={editingIsPreAssigned}
          onSave={handleEdit}
          onClose={() => setEditingCell(null)}
        />
      )}
      </div>
  )
}

type WorkplaceTableProps = {
  workplace: string
  employees: Employee[]
  dates: Date[]
  monthGroups: { month: string; count: number }[]
  assignmentMap: Map<string, Assignment>
  holidaySet: Set<string>
  preAssignedKeys?: Set<string>
  editable?: boolean
  staffingRules?: { workplace: string; dayType: string; requiredCount: number }[]
  violationCells: Set<string>
  onCellClick: (empId: string, date: string, primaryWorkplace: string) => void
}

function isHoliday(date: Date, holidaySet: Set<string>): boolean {
  const dow = date.getDay()
  if (dow === 0 || dow === 6) return true
  return holidaySet.has(formatDateStr(date))
}

function WorkplaceTable({ workplace, employees, dates, monthGroups, assignmentMap, holidaySet, preAssignedKeys, editable, staffingRules, violationCells, onCellClick }: WorkplaceTableProps) {
  const empStats = useMemo(() => {
    const stats = new Map<string, { workDays: number; offDays: number }>()
    for (const emp of employees) {
      let workDays = 0
      for (const d of dates) {
        const a = assignmentMap.get(`${emp.id}-${formatDateStr(d)}`)
        if (a && a.workplace) workDays++ // workplace=null は休み
      }
      stats.set(emp.id, { workDays, offDays: dates.length - workDays })
    }
    return stats
  }, [employees, dates, assignmentMap])

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
            <th className="border border-gray-200 px-2 py-1 bg-gray-50 text-gray-600 font-semibold text-center min-w-[50px]">休</th>
          </tr>
          <tr>
            <th className="sticky left-0 z-20 bg-white border border-gray-200 px-2 py-1" />
            {dates.map((d) => {
              const dow = d.getDay()
              const isHol = holidaySet.has(formatDateStr(d))
              const isRed = dow === 0 || isHol
              return (
                <th key={d.toISOString()}
                  className={`border border-gray-200 px-0 py-1 text-center font-semibold min-w-[30px] ${
                    isRed ? 'bg-red-50 text-red-500' : dow === 6 ? 'bg-blue-50 text-blue-500' : 'bg-white text-gray-700'
                  }`}>
                  {d.getDate()}
                </th>
              )
            })}
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
                  className={`border border-gray-200 px-0 py-0.5 text-center font-normal ${
                    isRed ? 'bg-red-50 text-red-400' : dow === 6 ? 'bg-blue-50 text-blue-400' : 'bg-white text-gray-400'
                  }`}>
                  {DAY_NAMES[dow]}
                </th>
              )
            })}
            <th className="border border-gray-200 px-2 py-0.5 bg-gray-50" />
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => {
            const stats = empStats.get(emp.id)
            return (
              <tr key={emp.id}>
                <td className="sticky left-0 z-10 bg-white border border-gray-200 px-2 py-1.5 font-medium text-gray-800 whitespace-nowrap">
                  {emp.lastName}
                </td>
                {dates.map((d) => {
                  const dateStr = formatDateStr(d)
                  const a = assignmentMap.get(`${emp.id}-${dateStr}`)
                  const dow = d.getDay()
                  // 休み = assignment無し or workplace=null
                  const isOff = !a || !a.workplace
                  const isViolation = violationCells.has(`${emp.id}-${dateStr}`)

                  let cellContent = ''
                  let cellBg = ''
                  let cellText = ''

                  if (isOff) {
                    if (a?.memo) {
                      cellContent = a.memo
                      cellText = 'text-gray-700'
                    } else {
                      cellContent = '/'
                      cellText = 'text-gray-300'
                    }
                    const isHol = holidaySet.has(dateStr)
                    if (dow === 0 || isHol) cellBg = 'bg-red-50/50'
                    else if (dow === 6) cellBg = 'bg-blue-50/50'
                  } else if (a) {
                    cellBg = CELL_COLOR_BY_WORKPLACE[a.workplace] ?? 'bg-gray-100'
                    if (a.memo) cellContent = a.memo
                  }

                  const isPreAssigned = preAssignedKeys?.has(`${emp.id}-${dateStr}`) ?? false

                  return (
                    <td key={dateStr}
                      onClick={() => onCellClick(emp.id, dateStr, emp.primaryWorkplace)}
                      className={`border border-gray-200 px-0 py-1.5 text-center ${cellBg} ${cellText} ${
                        editable ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-inset' : ''
                      } ${isViolation ? 'ring-2 ring-red-500 ring-inset' : ''} ${
                        isPreAssigned ? 'outline-2 outline-dashed outline-gray-700 outline-offset-[-2px]' : ''
                      }`}>
                      {cellContent}
                    </td>
                  )
                })}
                <td className="border border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-700 bg-gray-50">
                  {stats?.offDays ?? 0}
                </td>
              </tr>
            )
          })}
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
                  className={`border border-gray-200 px-0 py-1.5 text-center font-semibold ${
                    (dow === 0 || holidaySet.has(dateStr)) ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : 'bg-gray-100'
                  } text-gray-700`}>
                  {count}
                </td>
              )
            })}
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
                  className={`border border-gray-200 px-0 py-1.5 text-center font-semibold ${
                    (dow === 0 || holidaySet.has(dateStr)) ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : 'bg-gray-100'
                  } ${count > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  {count > 0 ? count : '-'}
                </td>
              )
            })}
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
  primaryWorkplace: string
  isPreAssigned?: boolean
  onSave: (workplace: string | null, memo: string | null, clear?: boolean) => void | Promise<void>
  onClose: () => void
}

function CellEditor({ date, currentWorkplace, currentMemo, primaryWorkplace, isPreAssigned, onSave, onClose }: CellEditorProps) {
  const [memo, setMemo] = useState(currentMemo ?? '')
  const [saving, setSaving] = useState(false)

  const handleClick = async (workplace: string | null) => {
    setSaving(true)
    await onSave(workplace, memo || null)
    setSaving(false)
  }

  const handleClear = async () => {
    setSaving(true)
    await onSave(null, null, true)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-900">{date} のシフト編集</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="text-xs text-gray-500 mb-2">基本勤務場所: {WORKPLACE_LABEL[primaryWorkplace]}</div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {['FACTORY', 'CAFE', 'FLOOR', 'OFFICE', 'OTHER'].map((wp) => {
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
            className={`py-2 rounded-lg text-sm font-medium col-span-2 border-2 disabled:opacity-50 ${
              currentWorkplace === null
                ? 'bg-gray-300 border-gray-500 text-gray-900'
                : 'bg-gray-100 border-transparent text-gray-700 hover:bg-gray-200'
            }`}
          >
            / 休み
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

        <div className="flex gap-2">
          <button
            disabled={saving}
            onClick={() => handleClick(currentWorkplace)}
            className="flex-1 bg-[#0AB4CC] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#099bb0] disabled:opacity-50"
          >
            {saving ? '保存中...' : 'メモのみ保存'}
          </button>
        </div>

        {isPreAssigned && (
          <div className="mt-3 pt-3 border-t">
            <button
              disabled={saving}
              onClick={handleClear}
              className="w-full py-2 rounded-lg text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              事前確定を取り消す
            </button>
            <p className="text-xs text-gray-400 mt-1 text-center">この日は通常通り自動生成の対象になります</p>
          </div>
        )}
      </div>
    </div>
  )
}
