import React from 'react'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  children: React.ReactNode
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div className="min-h-[100dvh] flex bg-obsidian">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <main className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
        {children}
      </main>
    </div>
  )
}
