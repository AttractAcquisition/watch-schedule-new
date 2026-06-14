import type { ReactNode } from "react";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 pb-24 md:px-6 md:pb-6">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
