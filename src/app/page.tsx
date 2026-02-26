import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { EpisodeSidebar } from "@/components/layout/episode-sidebar";
import { VoiceBar } from "@/components/voice/voice-bar";
import { StoryStream } from "@/components/stream/story-stream";
import { PlaylistBar } from "@/components/playlist/playlist-bar";

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

      <PlaylistBar
        title="My Crate"
        tracks={[
          { id: "1", title: "Zombie", artistName: "Fela Kuti" },
          { id: "2", title: "Secret Agent", artistName: "Tony Allen" },
          { id: "3", title: "Abusey Junction", artistName: "Kokoroko" },
        ]}
      />
    </AppShell>
  );
}
