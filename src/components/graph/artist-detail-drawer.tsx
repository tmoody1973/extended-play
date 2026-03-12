"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { Play, Pause, Pencil, X, Check, RefreshCw } from "lucide-react";
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

function ArtistEditForm({
  artist,
  artistId,
  onDone,
}: {
  artist: any;
  artistId: string;
  onDone: () => void;
}) {
  const updateArtist = useMutation((api as any).admin.updateArtistOverride);
  const reidentify = useAction((api as any).admin.reidentifyFromMusicBrainzUrl);
  const [form, setForm] = useState({
    name: artist.name ?? "",
    bio: artist.bio ?? "",
    country: artist.country ?? "",
    genres: (artist.genres ?? []).join(", "),
    imageUrl: artist.images?.primary?.url ?? "",
  });
  const [mbUrl, setMbUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [reidentifying, setReidentifying] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleReidentify = async () => {
    if (!mbUrl.trim()) return;
    setReidentifying(true);
    setMessage(null);
    try {
      const result = await reidentify({
        artistId: artistId as Id<"artists">,
        musicbrainzUrl: mbUrl.trim(),
      });
      setMessage({
        type: "success",
        text: `Re-identified as "${result.artistName}"${result.country ? ` (${result.country})` : ""}${result.disambiguation ? ` — ${result.disambiguation}` : ""}. Enrichment re-queued.`,
      });
      setMbUrl("");
      // Close after a moment so the user sees the success message
      setTimeout(() => onDone(), 2000);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message ?? "Re-identify failed" });
    } finally {
      setReidentifying(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const args: Record<string, any> = {
        artistId: artistId as Id<"artists">,
      };
      if (form.name !== (artist.name ?? "")) args.name = form.name;
      if (form.bio !== (artist.bio ?? "")) args.bio = form.bio;
      if (form.country !== (artist.country ?? "")) args.country = form.country;
      const newGenres = form.genres
        .split(",")
        .map((g: string) => g.trim())
        .filter(Boolean);
      const oldGenres = (artist.genres ?? []).join(", ");
      if (form.genres !== oldGenres) args.genres = newGenres;
      if (form.imageUrl !== (artist.images?.primary?.url ?? ""))
        args.imageUrl = form.imageUrl;

      await updateArtist(args);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full bg-shelf border border-edge rounded px-2 py-1.5 text-cream text-xs font-data focus:outline-none focus:border-gold";

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-amber font-editorial text-sm font-bold">
          Edit Artist
        </h3>
        <button onClick={onDone} className="text-sleeve hover:text-cream">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* MusicBrainz re-identify section */}
      <div className="border border-vinyl-blue/30 rounded-lg p-3 bg-vinyl-blue/5">
        <label className="text-vinyl-blue text-[10px] font-data uppercase block mb-1">
          MusicBrainz URL (re-identify + re-enrich)
        </label>
        <div className="flex gap-2">
          <input
            className={`${inputClass} flex-1 border-vinyl-blue/30`}
            value={mbUrl}
            onChange={(e) => setMbUrl(e.target.value)}
            placeholder="https://musicbrainz.org/artist/..."
          />
          <button
            onClick={handleReidentify}
            disabled={!mbUrl.trim() || reidentifying}
            className="px-3 py-1.5 rounded text-xs font-data bg-vinyl-blue text-walnut hover:bg-vinyl-blue/80 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3 h-3 ${reidentifying ? "animate-spin" : ""}`} />
            {reidentifying ? "Fetching..." : "Re-identify"}
          </button>
        </div>
        <p className="text-sleeve text-[9px] font-data mt-1.5">
          Paste the correct MusicBrainz artist page URL to replace all metadata and re-run enrichment.
        </p>
      </div>

      {message && (
        <div
          className={`text-xs font-data p-2 rounded ${
            message.type === "success"
              ? "bg-led-green/10 text-led-green border border-led-green/30"
              : "bg-skip-red/10 text-skip-red border border-skip-red/30"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="border-t border-edge pt-3">
        <p className="text-sleeve text-[9px] font-data mb-3 uppercase tracking-wider">
          Or manually override fields
        </p>
      </div>

      <div>
        <label className="text-sleeve text-[10px] font-data uppercase block mb-1">
          Name
        </label>
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sleeve text-[10px] font-data uppercase block mb-1">
          Country
        </label>
        <input
          className={inputClass}
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sleeve text-[10px] font-data uppercase block mb-1">
          Genres (comma-separated)
        </label>
        <input
          className={inputClass}
          value={form.genres}
          onChange={(e) => setForm({ ...form, genres: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sleeve text-[10px] font-data uppercase block mb-1">
          Image URL
        </label>
        <input
          className={inputClass}
          value={form.imageUrl}
          onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sleeve text-[10px] font-data uppercase block mb-1">
          Bio
        </label>
        <textarea
          className={`${inputClass} min-h-[80px] resize-y`}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 rounded-md font-editorial font-bold text-sm uppercase tracking-wider bg-amber text-walnut hover:bg-amber/80 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Check className="w-3.5 h-3.5" />
        {saving ? "Saving..." : "Save Override"}
      </button>
    </div>
  );
}

export function ArtistDetailDrawer({
  artistId,
  onClose,
  onNavigateToArtist,
  onAddToCrate,
}: ArtistDetailDrawerProps) {
  const [editingArtistId, setEditingArtistId] = useState<string | null>(null);
  const isEditing = editingArtistId === artistId;
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
            {isEditing ? (
              <ArtistEditForm
                artist={artist}
                artistId={artistId!}
                onDone={() => setEditingArtistId(null)}
              />
            ) : (
            <>
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
                  <div className="flex items-center gap-2">
                    <h2 className="text-cream text-lg font-editorial font-bold leading-tight">
                      {artist.name}
                    </h2>
                    <button
                      onClick={() => setEditingArtistId(artistId!)}
                      className="text-sleeve hover:text-amber transition-colors"
                      title="Edit artist details"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
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
            </>
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
