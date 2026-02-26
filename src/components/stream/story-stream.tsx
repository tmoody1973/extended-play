"use client";

import { NarrationCard } from "./narration-card";
import { ArtistCard } from "./artist-card";
import { AlbumArtCard } from "./album-art-card";
import { ScrollArea } from "@/components/ui/scroll-area";

// Temporary demo data — will be replaced with Convex queries
const demoItems = [
  {
    type: "narration" as const,
    content: "Let's explore the connection between Fela Kuti and Kokoroko. Kokoroko sits at a fascinating intersection — West African highlife tradition filtered through the London jazz scene.",
    timestamp: "Just now",
  },
  {
    type: "artist" as const,
    name: "Kokoroko",
    genres: ["Afrobeat", "UK Jazz", "Highlife"],
    country: "UK",
    communityLabel: "London Jazz Scene",
  },
  {
    type: "narration" as const,
    content: "Their horn arrangements directly reference Tony Allen's work with Fela. There's a straight line from Lagos in the '70s to Deptford in 2019.",
    timestamp: "1 min ago",
  },
  {
    type: "album" as const,
    title: "Zombie",
    artistName: "Fela Kuti",
    albumTitle: "Zombie",
    year: 1977,
  },
];

export function StoryStream() {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        <h3 className="font-editorial text-cream text-base mb-2">Story Stream</h3>
        {demoItems.map((item, i) => {
          switch (item.type) {
            case "narration":
              return <NarrationCard key={i} content={item.content} timestamp={item.timestamp} />;
            case "artist":
              return (
                <ArtistCard
                  key={i}
                  name={item.name}
                  genres={item.genres}
                  country={item.country}
                  communityLabel={item.communityLabel}
                />
              );
            case "album":
              return (
                <AlbumArtCard
                  key={i}
                  title={item.title}
                  artistName={item.artistName}
                  albumTitle={item.albumTitle}
                  year={item.year}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    </ScrollArea>
  );
}
