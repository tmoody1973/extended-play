import { AppShell } from "@/components/layout/app-shell";
import { MainLayout } from "@/components/layout/main-layout";
import { EpisodeSidebar } from "@/components/layout/episode-sidebar";
import { VoiceBar } from "@/components/voice/voice-bar";
import { StoryStream } from "@/components/stream/story-stream";
import { PlaylistBar } from "@/components/playlist/playlist-bar";
import { InfluenceMap } from "@/components/graph/influence-map";

export default function Home() {
  return (
    <AppShell>
      <VoiceBar />

      <MainLayout
        sidebar={<EpisodeSidebar />}
        graph={<InfluenceMap />}
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
