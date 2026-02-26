import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { EpisodeSidebar } from "@/components/layout/episode-sidebar";
import { VoiceBar } from "@/components/voice/voice-bar";
import { StoryStream } from "@/components/stream/story-stream";

export default function Home() {
  return (
    <AppShell>
      <VoiceBar />

      <MainLayout
        sidebar={<EpisodeSidebar />}
        graph={
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-shelf ring-2 ring-amber ring-tube-glow mx-auto mb-4" />
              <p className="text-cream font-editorial text-lg">Influence Map</p>
              <p className="text-sleeve text-sm mt-1">D3 force graph renders here</p>
            </div>
          </div>
        }
        stream={<StoryStream />}
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
