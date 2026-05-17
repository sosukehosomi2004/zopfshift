import { prisma } from '@/lib/prisma'

type EmploymentType = 'FULL_TIME' | 'PART_TIME'
type Workplace = 'FACTORY' | 'CAFE' | 'FLOOR' | 'OFFICE' | 'OTHER'

const TYPE_PREFIX: Record<EmploymentType, string> = {
  FULL_TIME: 'F',
  PART_TIME: 'P',
}

const WORKPLACE_PREFIX: Record<Workplace, string> = {
  FACTORY: 'F',
  CAFE: 'C',
  FLOOR: 'H',
  OFFICE: 'O',
  OTHER: 'X',
}

export function employeeNumberPrefix(
  employmentType: EmploymentType,
  workplace: Workplace,
): string {
  return `${TYPE_PREFIX[employmentType]}${WORKPLACE_PREFIX[workplace]}`
}

/**
 * 指定の雇用形態×勤務場所グループで次の通し番号を返す。
 * 既存番号は `${prefix}\d{3}` パターンのみ参照する (旧番号 "1","2" などは無視)。
 */
export async function nextEmployeeNumber(
  employmentType: EmploymentType,
  workplace: Workplace,
): Promise<string> {
  const prefix = employeeNumberPrefix(employmentType, workplace)
  const re = new RegExp(`^${prefix}(\\d{3})$`)

  const employees = await prisma.employee.findMany({
    where: { employeeNumber: { startsWith: prefix } },
    select: { employeeNumber: true },
  })

  let max = 0
  for (const e of employees) {
    const m = e.employeeNumber.match(re)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (n > max) max = n
  }

  return `${prefix}${String(max + 1).padStart(3, '0')}`
}
