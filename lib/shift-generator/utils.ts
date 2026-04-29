import { DateInfo, DayType, HolidayInput } from './types'

/** 期間内の全日付情報を生成 */
export function buildDateInfos(startDate: string, endDate: string, holidays: HolidayInput[]): DateInfo[] {
  const holidaySet = new Set(holidays.map((h) => h.date))
  const dates: DateInfo[] = []

  const current = new Date(startDate)
  const end = new Date(endDate)

  while (current <= end) {
    const dateStr = formatDate(current)
    const dayOfWeek = current.getDay()
    const dayType = getDayType(dayOfWeek, holidaySet.has(dateStr))
    dates.push({ date: dateStr, dayOfWeek, dayType })
    current.setDate(current.getDate() + 1)
  }

  return dates
}

/** 曜日タイプを判定 */
function getDayType(dayOfWeek: number, isHoliday: boolean): DayType {
  if (isHoliday || dayOfWeek === 0 || dayOfWeek === 6) return 'HOLIDAY'
  if (dayOfWeek === 5) return 'FRIDAY'
  return 'WEEKDAY_MON_THU'
}

/** Date → YYYY-MM-DD */
export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 配列をシャッフル（Fisher-Yates） */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
