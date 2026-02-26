import { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-walnut bg-wood-grain overflow-hidden">
      {children}
    </div>
  );
}
