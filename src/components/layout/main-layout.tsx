import { ReactNode } from "react";

interface MainLayoutProps {
  sidebar?: ReactNode;
  graph?: ReactNode;
  stream?: ReactNode;
}

export function MainLayout({ sidebar, graph, stream }: MainLayoutProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Episode Sidebar — hidden on mobile, visible on desktop */}
      {sidebar && (
        <aside className="hidden lg:flex w-[250px] flex-shrink-0 border-r border-edge overflow-y-auto">
          {sidebar}
        </aside>
      )}

      {/* Influence Map — takes remaining space */}
      <div className="flex-1 min-w-0 hidden md:block">
        {graph}
      </div>

      {/* Story Stream — fixed width on desktop, full width on mobile */}
      <div className="w-full md:w-[400px] flex-shrink-0 md:border-l border-edge overflow-y-auto">
        {stream}
      </div>
    </div>
  );
}
