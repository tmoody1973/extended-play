import { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-walnut bg-wood-grain">
      <nav className="h-12 flex items-center px-4 border-b border-edge bg-wood">
        <a href="/" className="text-amber text-sm hover:text-cream transition-colors mr-4">
          ← Back to Extended Play
        </a>
        <h1 className="font-editorial text-cream text-lg">Admin Dashboard</h1>
      </nav>
      <main className="p-6 max-w-4xl mx-auto">{children}</main>
    </div>
  );
}
