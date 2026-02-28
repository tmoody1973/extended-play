"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { Play, Pause } from "lucide-react";
import { colors, communityColors } from "@/lib/theme";
import { useAudioPlayer, type PlayableTrack } from "@/contexts/audio-player-context";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

interface ArtistDetailDrawerProps {
  artistId: string | undefined;
  onClose: () => void;
  onNavigateToArtist?: (artistId: string) => void;
  onAddToCrate?: (tracks: Array<{ id: string; title: string; albumTitle?: string }>) => void;
}

function SonicRadar({ profile }: { profile: Record<string, number> }) {
  const axes = [
    { key: "energy", label: "Energy" },
    { key: "danceability", label: "Dance" },
    { key: "acousticness", label: "Acoustic" },
    { key: "instrumentalness", label: "Instrmntl" },
    { key: "valence", label: "Valence" },
    { key: "liveness", label: "Live" },
  ];

  const data = axes.map(({ key, label }) => ({
    axis: label,
    value: profile[key] ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke={colors.edge} strokeOpacity={0.6} />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: colors.sleeve, fontSize: 9, fontFamily: "'Hanken Grotesk', sans-serif" }}
        />
        <Radar
          dataKey="value"
          stroke={colors.gold}
          fill={colors.gold}
          fillOpacity={0.2}
          strokeWidth={1.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function ArtistDetailDrawer({
  artistId,
  onClose,
  onNavigateToArtist,
  onAddToCrate,
}: ArtistDetailDrawerProps) {
  const { currentTrack, isPlaying, play, pause, resume } = useAudioPlayer();

  const artist = useQuery(
    (api as any).queries.getArtistCard,
    artistId ? { artistId: artistId as Id<"artists"> } : "skip"
  );

  const handleTrackPlay = (track: any) => {
    if (!track.youtubeVideoId) return;
    const playable: PlayableTrack = {
      id: track.id,
      title: track.title,
      artistName: artist?.name,
      albumArtUrl: track.albumArtUrl,
      youtubeVideoId: track.youtubeVideoId,
    };
    if (currentTrack?.id === track.id && isPlaying) {
      pause();
    } else if (currentTrack?.id === track.id) {
      resume();
    } else {
      play(playable);
    }
  };

  const isOpen = !!artistId;
  const communityIdx = artist?.communityId ?? 0;
  const accentColor = communityColors[communityIdx % communityColors.length];

  const activeYears = artist
    ? [
        artist.activeYearBegin,
        artist.activeYearEnd ? `\u2013${artist.activeYearEnd}` : "\u2013present",
      ]
        .filter(Boolean)
        .join("")
    : "";

  const location = [artist?.city, artist?.country].filter(Boolean).join(", ");

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[420px] max-w-[90vw] bg-wood border-edge p-0 overflow-y-auto overflow-x-hidden"
        showCloseButton={true}
      >
        <VisuallyHidden.Root>
          <SheetTitle>{artist?.name ?? "Artist Detail"}</SheetTitle>
          <SheetDescription>Artist detail panel</SheetDescription>
        </VisuallyHidden.Root>
        {artist ? (
          <div className="flex flex-col">
            {/* ── Hero banner ── */}
            <div className="relative h-36 overflow-hidden bg-walnut">
              {artist.images?.fanartBackground ? (
                <img
                  src={artist.images.fanartBackground}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-40 blur-sm"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${accentColor}22 0%, ${colors.walnut} 100%)`,
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-wood/95 to-transparent" />

              {/* Artist photo + name */}
              <div className="absolute bottom-3 left-4 flex items-end gap-3">
                <div
                  className="w-16 h-16 rounded-full overflow-hidden border-2 flex-shrink-0"
                  style={{ borderColor: accentColor }}
                >
                  {artist.images?.primary?.url ? (
                    <img
                      src={artist.images.primary.url}
                      alt={artist.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-xl font-editorial font-bold"
                      style={{ backgroundColor: colors.shelf, color: colors.cream }}
                    >
                      {artist.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="mb-1">
                  <h2 className="text-cream text-lg font-editorial font-bold leading-tight">
                    {artist.name}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-sleeve mt-0.5">
                    {location && <span>{location}</span>}
                    {location && activeYears && <span>·</span>}
                    {activeYears && <span>{activeYears}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Genre tags ── */}
            {artist.genres && artist.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                {artist.genres.slice(0, 6).map((genre: string) => (
                  <span
                    key={genre}
                    className="text-[10px] font-data uppercase tracking-wider px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: accentColor + "50",
                      color: accentColor,
                      backgroundColor: accentColor + "10",
                    }}
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* ── Bio ── */}
            {artist.bio && (
              <section className="px-4 pt-4">
                <h3 className="label-uppercase text-[10px] text-sleeve mb-1.5">About</h3>
                <p className="text-cream/80 text-sm leading-relaxed line-clamp-4">
                  {artist.bio}
                </p>
              </section>
            )}

            {/* ── Connected Artists ── */}
            {artist.connectedArtists && artist.connectedArtists.length > 0 && (
              <section className="px-4 pt-4">
                <h3 className="label-uppercase text-[10px] text-sleeve mb-2">Connections</h3>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {artist.connectedArtists.map((conn: any) => (
                    <button
                      key={conn.id}
                      className="flex flex-col items-center gap-1 flex-shrink-0 group"
                      onClick={() => onNavigateToArtist?.(conn.id)}
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-edge group-hover:border-gold transition-colors">
                        {conn.imageUrl ? (
                          <img
                            src={conn.imageUrl}
                            alt={conn.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-shelf flex items-center justify-center text-cream/60 text-xs font-editorial font-bold">
                            {conn.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] text-cream/60 text-center max-w-[48px] truncate group-hover:text-cream transition-colors">
                        {conn.name}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── Top Tracks ── */}
            {artist.tracks && artist.tracks.length > 0 && (
              <section className="px-4 pt-4">
                <h3 className="label-uppercase text-[10px] text-sleeve mb-2">Top Tracks</h3>
                <div className="space-y-1">
                  {artist.tracks.slice(0, 8).map((track: any, i: number) => {
                    const isActive = currentTrack?.id === track.id;
                    const isTrackPlaying = isActive && isPlaying;

                    return (
                      <div
                        key={track.id}
                        className={`flex items-center gap-2.5 py-1.5 px-2 rounded transition-colors group ${
                          isActive ? "bg-shelf/80" : "hover:bg-shelf/60"
                        }`}
                      >
                        {/* Play button or track number */}
                        {track.youtubeVideoId ? (
                          <button
                            onClick={() => handleTrackPlay(track)}
                            className={`w-4 flex items-center justify-center flex-shrink-0 transition-colors ${
                              isActive ? "text-gold" : "text-shadow group-hover:text-cream"
                            }`}
                          >
                            {isTrackPlaying ? (
                              <Pause className="w-3 h-3" fill="currentColor" />
                            ) : (
                              <Play className="w-3 h-3" fill="currentColor" />
                            )}
                          </button>
                        ) : (
                          <span className="text-[10px] font-data text-shadow w-4 text-right">
                            {i + 1}
                          </span>
                        )}
                        {track.albumArtUrl ? (
                          <img
                            src={track.albumArtUrl}
                            alt=""
                            className="w-7 h-7 rounded-sm object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-sm bg-shelf flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs truncate ${isActive ? "text-gold" : "text-cream"}`}>
                            {track.title}
                          </div>
                          {track.albumTitle && (
                            <div className="text-sleeve text-[10px] truncate">{track.albumTitle}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Sonic Profile ── */}
            {artist.sonicProfile && (
              <section className="px-4 pt-4">
                <h3 className="label-uppercase text-[10px] text-sleeve mb-1">Sonic Profile</h3>
                <SonicRadar profile={artist.sonicProfile} />
              </section>
            )}

            {/* ── Reviews ── */}
            {artist.reviews && artist.reviews.length > 0 && (
              <section className="px-4 pt-4">
                <h3 className="label-uppercase text-[10px] text-sleeve mb-2">Reviews</h3>
                <div className="space-y-2.5">
                  {artist.reviews.map((review: any) => (
                    <div key={review.id} className="border-l-2 border-edge pl-3">
                      <p className="text-cream/70 text-xs italic leading-relaxed line-clamp-3">
                        &ldquo;{review.excerpt}&rdquo;
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-data text-sleeve">
                          {review.publication}
                        </span>
                        {review.rating && (
                          <span className="text-[10px] font-data text-gold">
                            {review.rating}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Community badge ── */}
            {artist.communityLabel && (
              <div className="px-4 pt-4">
                <div
                  className="inline-flex items-center gap-1.5 text-[10px] font-data px-2 py-1 rounded"
                  style={{
                    backgroundColor: accentColor + "15",
                    color: accentColor,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: accentColor }}
                  />
                  {artist.communityLabel}
                </div>
              </div>
            )}

            {/* ── Add to Crate ── */}
            {artist.tracks && artist.tracks.length > 0 && (
              <div className="p-4 pt-5 pb-6">
                <button
                  className="w-full py-2.5 rounded-md font-editorial font-bold text-sm uppercase tracking-wider transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{
                    backgroundColor: colors.gold,
                    color: colors.walnut,
                  }}
                  onClick={() =>
                    onAddToCrate?.(
                      artist.tracks.map((t: any) => ({
                        id: t.id,
                        title: t.title,
                        albumTitle: t.albumTitle,
                      }))
                    )
                  }
                >
                  + Add to Crate
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Loading state */
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
