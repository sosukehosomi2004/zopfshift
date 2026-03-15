import { Sidebar } from '@/components/layout/Sidebar'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <Sidebar />
      <main className="ml-11 min-h-screen">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
