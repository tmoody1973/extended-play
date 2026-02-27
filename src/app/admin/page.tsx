"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  const [rawText, setRawText] = useState("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [airDate, setAirDate] = useState("");
  const [result, setResult] = useState<any>(null);
  const [isIngesting, setIsIngesting] = useState(false);

  const parseAndIngest = useMutation(
    (api as any).admin.parseAndIngestPlaylist
  );
  const previewParse = useMutation((api as any).admin.previewParse);
  const enrichmentStats = useQuery((api as any).queries.getEnrichmentStats);
  const retryFailed = useMutation((api as any).admin.retryFailedJobs);

  const handlePreview = async () => {
    const preview = await previewParse({ rawText });
    setResult({ type: "preview", data: preview });
  };

  const handleIngest = async () => {
    if (!episodeTitle || !airDate || !rawText) return;
    setIsIngesting(true);
    try {
      const res = await parseAndIngest({
        rawText,
        episodeTitle,
        airDate,
        sourceType: "manual",
      });
      setResult({ type: "ingest", data: res });
      if (res.status === "success") {
        setRawText("");
        setEpisodeTitle("");
        setAirDate("");
      }
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Enrichment Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="font-editorial">Enrichment Stats</CardTitle>
        </CardHeader>
        <CardContent>
          {enrichmentStats ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sleeve text-xs font-data uppercase mb-2">Artists</p>
                <div className="space-y-1 text-sm">
                  <p className="text-cream">Total: <span className="text-amber font-data">{enrichmentStats.artistStats.total}</span></p>
                  <p className="text-sleeve">Stubs: {enrichmentStats.artistStats.stub}</p>
                  <p className="text-sleeve">Identified: {enrichmentStats.artistStats.identified}</p>
                  <p className="text-sleeve">Complete: {enrichmentStats.artistStats.complete}</p>
                  <p className="text-sleeve">With images: {enrichmentStats.artistStats.withImages}</p>
                </div>
              </div>
              <div>
                <p className="text-sleeve text-xs font-data uppercase mb-2">Tracks</p>
                <div className="space-y-1 text-sm">
                  <p className="text-cream">Total: <span className="text-amber font-data">{enrichmentStats.trackStats.total}</span></p>
                  <p className="text-sleeve">Raw: {enrichmentStats.trackStats.raw}</p>
                  <p className="text-sleeve">With art: {enrichmentStats.trackStats.withAlbumArt}</p>
                  <p className="text-sleeve">Complete: {enrichmentStats.trackStats.complete}</p>
                </div>
              </div>
              <div>
                <p className="text-sleeve text-xs font-data uppercase mb-2">Jobs</p>
                <div className="space-y-1 text-sm">
                  <p className="text-cream">Queued: <span className="text-amber font-data">{enrichmentStats.jobStats.queued}</span></p>
                  <p className="text-sleeve">Running: {enrichmentStats.jobStats.running}</p>
                  <p className="text-led-green">Completed: {enrichmentStats.jobStats.completed}</p>
                  <p className="text-skip-red">Failed: {enrichmentStats.jobStats.failed}</p>
                </div>
                {enrichmentStats.jobStats.failed > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-amber border-amber hover:bg-amber hover:text-walnut"
                    onClick={() => retryFailed({})}
                  >
                    Retry Failed
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sleeve text-sm">Loading stats...</p>
          )}
        </CardContent>
      </Card>

      {/* Playlist Paste Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="font-editorial">Ingest Playlist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sleeve text-xs font-data block mb-1">Episode Title</label>
              <Input
                value={episodeTitle}
                onChange={(e) => setEpisodeTitle(e.target.value)}
                placeholder="Rhythm Lab Radio — Episode 412"
                className="bg-wood border-edge text-cream"
              />
            </div>
            <div>
              <label className="text-sleeve text-xs font-data block mb-1">Air Date</label>
              <Input
                type="date"
                value={airDate}
                onChange={(e) => setAirDate(e.target.value)}
                className="bg-wood border-edge text-cream"
              />
            </div>
          </div>

          <div>
            <label className="text-sleeve text-xs font-data block mb-1">
              Paste tracklist (auto-detects format)
            </label>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={"Fela Kuti - Zombie\nTony Allen - Secret Agent\nKokoroko - Abusey Junction"}
              rows={10}
              className="bg-wood border-edge text-cream font-data text-sm"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={!rawText}
              className="text-vinyl-blue border-vinyl-blue hover:bg-vinyl-blue hover:text-walnut"
            >
              Preview Parse
            </Button>
            <Button
              onClick={handleIngest}
              disabled={!rawText || !episodeTitle || !airDate || isIngesting}
              className="bg-amber text-walnut hover:bg-amber/80"
            >
              {isIngesting ? "Ingesting..." : "Ingest Episode"}
            </Button>
          </div>

          {/* Results */}
          {result && (
            <div className="bg-wood rounded-lg p-4 mt-4">
              <pre className="text-cream text-xs font-data whitespace-pre-wrap overflow-auto max-h-60">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
