import XLSX from 'xlsx-js-style'

const WORKPLACE_LABEL: Record<string, string> = {
  FACTORY: '工場',
  CAFE: 'カフェ',
  FLOOR: 'フロア',
  L: 'L',
  OFFICE: '事務',
  OTHER: '出勤',
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

// 勤務場所の背景色 (Tailwind と対応する HEX。UIのbg-X-200相当の薄め色)
const WORKPLACE_HEX: Record<string, string> = {
  FACTORY: 'D6F1F5', // bg-[#0AB4CC]/15 相当
  CAFE: 'FEF08A',   // bg-yellow-200
  FLOOR: 'BBF7D0',  // bg-green-200
  L: 'FECACA',      // bg-red-200
  F: 'FFFFFF',      // 塗りつぶしなし (白)
  OFFICE: 'F3E8FF', // bg-purple-100
  OTHER: 'E7E5E4',  // bg-stone-200
}

// 任意塗り潰しプリセット (-500 / -600)
const CUSTOM_HEX: Record<string, string> = {
  orange: 'F97316',
  amber: 'D97706',
  fuchsia: 'D946EF',
  pink: 'EC4899',
  indigo: '6366F1',
  slate: '64748B',
}

// 休日タイプ別の薄い背景
const HOLIDAY_HEX = 'FEE2E2' // 日・祝の薄い赤
const SATURDAY_HEX = 'DBEAFE' // 土の薄い青

export type ExportAssignment = {
  employeeId: string
  date: string
  workplace: string | null
  memo?: string | null
  color?: string | null
  employee: {
    id: string
    lastName: string
    firstName: string
    employmentType: string
    primaryWorkplace: string
  }
}

export type ExportEmployee = {
  id: string
  lastName: string
  firstName: string
  employmentType: string
  primaryWorkplace: string
}

type CellStyle = {
  fill?: { fgColor: { rgb: string } }
  font?: { color?: { rgb: string }; bold?: boolean; sz?: number }
  alignment?: { horizontal?: string; vertical?: string }
  border?: Record<string, { style: string; color: { rgb: string } }>
}

const BORDER: NonNullable<CellStyle['border']> = {
  top: { style: 'thin', color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
  left: { style: 'thin', color: { rgb: 'CCCCCC' } },
  right: { style: 'thin', color: { rgb: 'CCCCCC' } },
}

const CENTER: CellStyle['alignment'] = { horizontal: 'center', vertical: 'center' }

export function exportShiftToExcel(params: {
  label: string
  startDate: string
  endDate: string
  assignments: ExportAssignment[]
  allEmployees: ExportEmployee[]
  holidays: { date: string }[]
}): void {
  const { label, startDate, endDate, assignments, allEmployees, holidays } = params

  const dates: Date[] = []
  const start = new Date(startDate.split('T')[0] + 'T00:00:00')
  const end = new Date(endDate.split('T')[0] + 'T00:00:00')
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dateStrs = dates.map(fmtDate)
  const holidaySet = new Set(holidays.map((h) => h.date.split('T')[0]))

  const assignmentMap = new Map<string, ExportAssignment>()
  for (const a of assignments) {
    assignmentMap.set(`${a.employeeId}-${a.date.split('T')[0]}`, a)
  }

  // 移動者マップ
  const movedInPerDayByWp: Record<string, Map<string, number>> = {}
  for (const wp of ['FACTORY', 'CAFE', 'FLOOR', 'L', 'OFFICE', 'OTHER']) {
    const m = new Map<string, number>()
    for (const a of assignments) {
      if (a.workplace !== wp) continue
      if (a.employee.primaryWorkplace === wp) continue
      const d = a.date.split('T')[0]
      m.set(d, (m.get(d) ?? 0) + 1)
    }
    movedInPerDayByWp[wp] = m
  }

  // 各セル: { v: 値, s: スタイル }
  type Cell = { v: string | number; s?: CellStyle }
  const sheet: Cell[][] = []

  // ヘッダー行1: 月日
  const headerDate: Cell[] = [{ v: '', s: { border: BORDER } }]
  for (const d of dates) {
    const dStr = fmtDate(d)
    const dow = d.getDay()
    const isHol = dow === 0 || holidaySet.has(dStr)
    const fill = isHol ? HOLIDAY_HEX : dow === 6 ? SATURDAY_HEX : 'F3F4F6'
    headerDate.push({
      v: `${d.getMonth() + 1}/${d.getDate()}`,
      s: {
        fill: { fgColor: { rgb: fill } },
        font: { bold: true, sz: 10 },
        alignment: CENTER,
        border: BORDER,
      },
    })
  }
  headerDate.push({ v: '休', s: { font: { bold: true, sz: 10 }, alignment: CENTER, border: BORDER, fill: { fgColor: { rgb: 'F3F4F6' } } } })
  sheet.push(headerDate)

  // ヘッダー行2: 曜日
  const headerDow: Cell[] = [{ v: '', s: { border: BORDER } }]
  for (const d of dates) {
    const dStr = fmtDate(d)
    const dow = d.getDay()
    const isHol = dow === 0 || holidaySet.has(dStr)
    const fill = isHol ? HOLIDAY_HEX : dow === 6 ? SATURDAY_HEX : 'F9FAFB'
    headerDow.push({
      v: DAY_NAMES[dow],
      s: {
        fill: { fgColor: { rgb: fill } },
        font: { sz: 9 },
        alignment: CENTER,
        border: BORDER,
      },
    })
  }
  headerDow.push({ v: '', s: { border: BORDER } })
  sheet.push(headerDow)

  const renderCellForEmp = (
    emp: ExportEmployee,
    sectionWp: string,
    seqMap: Map<string, number>,
  ): { row: Cell[]; restCount: number } => {
    const row: Cell[] = [{
      v: emp.lastName,
      s: { font: { bold: true, sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' }, border: BORDER },
    }]
    let restCount = 0
    for (const dStr of dateStrs) {
      const a = assignmentMap.get(`${emp.id}-${dStr}`)
      const isOff = !a || !a.workplace
      let cellValue: string = ''
      let fillHex: string | undefined

      if (isOff) {
        if (a?.memo) {
          cellValue = a.memo
        } else {
          cellValue = '/'
        }
        // 休みセルは曜日問わず無色 (日付ヘッダーのみ色付け)
        fillHex = undefined
        if (!a) restCount++
        else if (!a.workplace) restCount++
      } else if (a) {
        if (a.workplace === sectionWp) {
          // primary 出勤: 色なし、メモがあればそれ、なければ通し番号
          if (a.memo) cellValue = a.memo
          else cellValue = String(seqMap.get(`${emp.id}-${dStr}`) ?? '')
          fillHex = undefined // 主勤務は無色
        } else if (a.workplace) {
          // 移動先: 移動先の色 + メモ (なければ空)
          fillHex = WORKPLACE_HEX[a.workplace]
          if (a.memo) cellValue = a.memo
          else if (a.workplace === 'L') cellValue = 'L'
          else if (a.workplace === 'F') cellValue = 'F'
          else cellValue = ''
        }
      }

      // ユーザー指定色は最優先
      if (a?.color && CUSTOM_HEX[a.color]) {
        fillHex = CUSTOM_HEX[a.color]
      }

      const style: CellStyle = {
        alignment: CENTER,
        border: BORDER,
        font: { sz: 10, color: cellValue === '/' ? { rgb: 'CBD5E1' } : undefined },
      }
      if (fillHex) style.fill = { fgColor: { rgb: fillHex } }

      row.push({ v: cellValue, s: style })
    }
    row.push({
      v: restCount,
      s: { alignment: CENTER, border: BORDER, font: { sz: 10, bold: true }, fill: { fgColor: { rgb: 'F9FAFB' } } },
    })
    return { row, restCount }
  }

  // 各勤務場所セクション
  for (const wp of ['FACTORY', 'CAFE', 'FLOOR', 'L', 'OFFICE', 'OTHER']) {
    const primary = allEmployees.filter((e) => e.primaryWorkplace === wp)
    const movedInMap = movedInPerDayByWp[wp]
    const maxMovedIn = Math.max(0, ...Array.from(movedInMap.values()))
    if (primary.length === 0 && maxMovedIn === 0) continue

    // 空行 + 見出し
    sheet.push([{ v: '', s: {} }])
    sheet.push([
      {
        v: WORKPLACE_LABEL[wp],
        s: {
          fill: { fgColor: { rgb: WORKPLACE_HEX[wp] } },
          font: { bold: true, sz: 11 },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: BORDER,
        },
      },
    ])

    // セクション内の通し番号 (UI と同じロジック)
    const seqMap = new Map<string, number>()
    for (const dStr of dateStrs) {
      let n = 0
      for (const emp of primary) {
        if (emp.employmentType !== 'FULL_TIME') continue
        const a = assignmentMap.get(`${emp.id}-${dStr}`)
        if (a && a.workplace === wp) {
          n++
          seqMap.set(`${emp.id}-${dStr}`, n)
        }
      }
      n += movedInMap.get(dStr) ?? 0
      for (const emp of primary) {
        if (emp.employmentType === 'FULL_TIME') continue
        const a = assignmentMap.get(`${emp.id}-${dStr}`)
        if (a && a.workplace === wp) {
          n++
          seqMap.set(`${emp.id}-${dStr}`, n)
        }
      }
    }

    const ft = primary.filter((e) => e.employmentType === 'FULL_TIME')
    const pt = primary.filter((e) => e.employmentType !== 'FULL_TIME')

    for (const emp of ft) sheet.push(renderCellForEmp(emp, wp, seqMap).row)

    // 移動者スロット行
    for (let slot = 0; slot < maxMovedIn; slot++) {
      const row: Cell[] = [{
        v: `移動${slot + 1}`,
        s: { font: { italic: true, sz: 10, color: { rgb: '9CA3AF' } }, alignment: { horizontal: 'left', vertical: 'center' }, border: BORDER } as CellStyle,
      }]
      for (const dStr of dateStrs) {
        const cnt = movedInMap.get(dStr) ?? 0
        if (slot >= cnt) {
          row.push({ v: '', s: { border: BORDER } })
        } else {
          // primary FT 出勤数 を計算
          let primaryWorking = 0
          for (const emp of ft) {
            const a = assignmentMap.get(`${emp.id}-${dStr}`)
            if (a && a.workplace === wp) primaryWorking++
          }
          const number = primaryWorking + slot + 1
          row.push({
            v: number,
            s: {
              fill: { fgColor: { rgb: WORKPLACE_HEX[wp] } },
              alignment: CENTER,
              border: BORDER,
              font: { sz: 10 },
            },
          })
        }
      }
      row.push({ v: '', s: { border: BORDER, fill: { fgColor: { rgb: 'F9FAFB' } } } })
      sheet.push(row)
    }

    for (const emp of pt) sheet.push(renderCellForEmp(emp, wp, seqMap).row)

    // 出勤数行
    const totalRow: Cell[] = [{
      v: '出勤数',
      s: { fill: { fgColor: { rgb: 'F3F4F6' } }, font: { bold: true, sz: 10 }, alignment: { horizontal: 'left', vertical: 'center' }, border: BORDER },
    }]
    for (const dStr of dateStrs) {
      let cnt = 0
      for (const a of assignments) {
        if (a.date.split('T')[0] !== dStr) continue
        if (a.workplace !== wp) continue
        cnt++
      }
      totalRow.push({
        v: cnt,
        s: { fill: { fgColor: { rgb: 'F3F4F6' } }, font: { bold: true, sz: 10 }, alignment: CENTER, border: BORDER },
      })
    }
    totalRow.push({ v: '', s: { fill: { fgColor: { rgb: 'F3F4F6' } }, border: BORDER } })
    sheet.push(totalRow)
  }

  // セル配列を XLSX 形式に変換
  const ws: XLSX.WorkSheet = {}
  for (let r = 0; r < sheet.length; r++) {
    for (let c = 0; c < sheet[r].length; c++) {
      const cell = sheet[r][c]
      if (cell == null) continue
      const ref = XLSX.utils.encode_cell({ r, c })
      ws[ref] = { t: typeof cell.v === 'number' ? 'n' : 's', v: cell.v, s: cell.s }
    }
  }
  const maxCols = Math.max(...sheet.map((r) => r.length))
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheet.length - 1, c: maxCols - 1 } })
  ws['!cols'] = [{ wch: 10 }, ...dates.map(() => ({ wch: 4 })), { wch: 5 }]
  ws['!rows'] = sheet.map(() => ({ hpt: 18 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31)) // シート名は31文字制限

  XLSX.writeFile(wb, `${label}.xlsx`)
}
