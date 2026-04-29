'use client'

import { useMemo } from 'react'

type Assignment = {
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
}

type Props = {
  startDate: string
  endDate: string
  assignments: Assignment[]
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

const WORKPLACE_LABEL: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
}

// セルの色: 実際に働く勤務場所で決まる
const CELL_COLOR_BY_WORKPLACE: Record<string, string> = {
  FACTORY: 'bg-[#0AB4CC]/15',
  CAFE: 'bg-yellow-200',
  FLOOR: 'bg-red-200',
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

export function ShiftGrid({ startDate, endDate, assignments }: Props) {
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
    const empMap = new Map<string, Assignment['employee']>()
    for (const a of assignments) {
      if (!empMap.has(a.employeeId)) {
        empMap.set(a.employeeId, a.employee)
      }
    }
    return Array.from(empMap.values()).sort((a, b) => a.employeeNumber - b.employeeNumber)
  }, [assignments])

  const sections: Array<{ workplace: string; employees: Assignment['employee'][] }> = ['FACTORY', 'CAFE', 'FLOOR'].map((wp) => ({
    workplace: wp,
    employees: allEmployees.filter((e) => e.primaryWorkplace === wp),
  }))

  return (
    <div className="overflow-x-auto space-y-6">
      {sections.map((section) => (
        <WorkplaceTable
          key={section.workplace}
          workplace={section.workplace}
          employees={section.employees}
          dates={dates}
          monthGroups={monthGroups}
          assignmentMap={assignmentMap}
        />
      ))}
    </div>
  )
}

type WorkplaceTableProps = {
  workplace: string
  employees: Assignment['employee'][]
  dates: Date[]
  monthGroups: { month: string; count: number }[]
  assignmentMap: Map<string, Assignment>
}

function WorkplaceTable({ workplace, employees, dates, monthGroups, assignmentMap }: WorkplaceTableProps) {
  // 各従業員の出勤日数・休み日数
  const empStats = useMemo(() => {
    const stats = new Map<string, { workDays: number; offDays: number }>()
    for (const emp of employees) {
      let workDays = 0
      for (const d of dates) {
        if (assignmentMap.has(`${emp.id}-${formatDateStr(d)}`)) workDays++
      }
      stats.set(emp.id, { workDays, offDays: dates.length - workDays })
    }
    return stats
  }, [employees, dates, assignmentMap])

  // 各日の出勤者数（この勤務場所で働く全員）
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

  // 各日のヘルプ数（他の勤務場所から来ている人数）
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

  // 各日の不足人員（最低必要人数 - 実際の出勤者数）
  const shortageCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dates) {
      const dateStr = formatDateStr(d)
      const dow = d.getDay()
      const dayType: 'WEEKDAY' | 'FRIDAY' | 'HOLIDAY' = (dow === 0 || dow === 6) ? 'HOLIDAY' : (dow === 5 ? 'FRIDAY' : 'WEEKDAY')
      let required = 0
      if (workplace === 'FACTORY') required = dayType === 'WEEKDAY' ? 9 : 10
      else if (workplace === 'CAFE') required = dayType === 'HOLIDAY' ? 4 : 3
      else if (workplace === 'FLOOR') required = dayType === 'HOLIDAY' ? 7 : 5
      const actual = dailyCounts.get(dateStr) ?? 0
      counts.set(dateStr, Math.max(0, required - actual))
    }
    return counts
  }, [dates, workplace, dailyCounts])

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{WORKPLACE_LABEL[workplace]}</h3>
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
              return (
                <th key={d.toISOString()}
                  className={`border border-gray-200 px-0 py-1 text-center font-semibold min-w-[30px] ${
                    dow === 0 ? 'bg-red-50 text-red-500' : dow === 6 ? 'bg-blue-50 text-blue-500' : 'bg-white text-gray-700'
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
              return (
                <th key={`dow-${d.toISOString()}`}
                  className={`border border-gray-200 px-0 py-0.5 text-center font-normal ${
                    dow === 0 ? 'bg-red-50 text-red-400' : dow === 6 ? 'bg-blue-50 text-blue-400' : 'bg-white text-gray-400'
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
                  const isOff = !a

                  let cellContent = ''
                  let cellBg = ''
                  let cellText = ''

                  if (isOff) {
                    cellContent = '/'
                    cellText = 'text-gray-300'
                    if (dow === 0) cellBg = 'bg-red-50/50'
                    else if (dow === 6) cellBg = 'bg-blue-50/50'
                  } else {
                    // 実際に働く勤務場所で色を決める
                    cellBg = CELL_COLOR_BY_WORKPLACE[a.workplace] ?? 'bg-gray-100'
                  }

                  return (
                    <td key={dateStr}
                      className={`border border-gray-200 px-0 py-1.5 text-center ${cellBg} ${cellText}`}>
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
                    dow === 0 ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : 'bg-gray-100'
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
                    dow === 0 ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : 'bg-gray-100'
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
                    dow === 0 ? 'bg-red-50' : dow === 6 ? 'bg-blue-50' : 'bg-gray-100'
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
