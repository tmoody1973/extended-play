import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { VoiceBar } from "@/components/voice/voice-bar";

export default function Home() {
  return (
    <AppShell>
      <VoiceBar />

      <MainLayout
        sidebar={
          <div className="p-4">
            <h3 className="font-editorial text-cream text-lg mb-4">Episode Playlist</h3>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 mb-3 p-2 rounded hover:bg-shelf transition-colors cursor-pointer">
                <span className="text-shadow font-data text-xs w-5">{String(i).padStart(2, "0")}</span>
                <div className="w-8 h-8 rounded bg-shelf flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-cream text-sm truncate">Track Title {i}</p>
                  <p className="text-sleeve text-xs truncate">Artist Name</p>
                </div>
              </div>
            ))}
          </div>
        }
        graph={
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-shelf ring-2 ring-amber ring-tube-glow mx-auto mb-4" />
              <p className="text-cream font-editorial text-lg">Influence Map</p>
              <p className="text-sleeve text-sm mt-1">D3 force graph renders here</p>
            </div>
          </div>
        }
        stream={
          <div className="p-4">
            <h3 className="font-editorial text-cream text-lg mb-4">Story Stream</h3>
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-shelf rounded-lg p-4 mb-3 shadow-vinyl animate-slide-up">
                <p className="text-cream text-sm">Agent narration card {i}. Exploring the connection between Fela Kuti and Kokoroko through the lens of Afrobeat...</p>
                <p className="text-sleeve text-xs mt-2 font-data">2 min ago</p>
              </div>
            ))}
          </div>
        }
      />

      {/* Playlist Bar placeholder */}
      <footer className="h-16 flex items-center px-4 border-t border-edge bg-wood flex-shrink-0">
        <span className="text-cream text-sm font-editorial mr-4">&#9835; Playlist</span>
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-10 h-10 rounded bg-shelf" />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button className="text-xs text-amber hover:text-cream transition-colors">+ Add</button>
          <button className="text-xs text-amber hover:text-cream transition-colors">Export ▾</button>
        </div>
      </footer>
    </AppShell>
  );
}
