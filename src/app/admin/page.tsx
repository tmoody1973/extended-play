"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tab 1 — Ingest Panel
// ---------------------------------------------------------------------------
function IngestPanel() {
  const [rawText, setRawText] = useState("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [airDate, setAirDate] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [result, setResult] = useState<any>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseAndIngest = useMutation(
    (api as any).admin.parseAndIngestPlaylist
  );
  const previewParse = useMutation((api as any).admin.previewParse);

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
        ...(sourceUrl ? { sourceUrl } : {}),
      });
      setResult({ type: "ingest", data: res });
      if (res.status === "success") {
        setRawText("");
        setEpisodeTitle("");
        setAirDate("");
        setSourceUrl("");
      }
    } finally {
      setIsIngesting(false);
    }
  };

  const readFileIntoTextarea = useCallback((file: File) => {
    if (!file.name.endsWith(".md") && !file.name.endsWith(".txt")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        setRawText(text);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) readFileIntoTextarea(file);
    },
    [readFileIntoTextarea]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFileIntoTextarea(file);
    },
    [readFileIntoTextarea]
  );

  return (
    <div className="space-y-4">
      {/* Drag-and-drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          isDragOver
            ? "border-amber bg-amber/10 text-amber"
            : "border-edge text-sleeve hover:border-amber/50 hover:text-cream"
        )}
      >
        <p className="font-data text-sm">
          Drop a <span className="text-amber">.md</span> or{" "}
          <span className="text-amber">.txt</span> file here, or click to
          browse
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label-uppercase text-sleeve font-data block mb-1">
            Episode Title
          </label>
          <Input
            value={episodeTitle}
            onChange={(e) => setEpisodeTitle(e.target.value)}
            placeholder="Rhythm Lab Radio — Episode 412"
            className="bg-shelf border-edge text-cream"
          />
        </div>
        <div>
          <label className="label-uppercase text-sleeve font-data block mb-1">
            Air Date
          </label>
          <Input
            type="date"
            value={airDate}
            onChange={(e) => setAirDate(e.target.value)}
            className="bg-shelf border-edge text-cream"
          />
        </div>
      </div>

      <div>
        <label className="label-uppercase text-sleeve font-data block mb-1">
          Source URL (optional)
        </label>
        <Input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://rhythmlab.org/episode-412"
          className="bg-shelf border-edge text-cream"
        />
      </div>

      <div>
        <label className="label-uppercase text-sleeve font-data block mb-1">
          Paste tracklist (auto-detects format)
        </label>
        <Textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={
            "Fela Kuti - Zombie\nTony Allen - Secret Agent\nKokoroko - Abusey Junction"
          }
          rows={10}
          className="bg-shelf border-edge text-cream font-data text-sm"
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

      {/* Result card */}
      {result && (
        <Card className="bg-wood border-edge">
          <CardHeader className="pb-2">
            <CardTitle className="font-editorial text-sm text-amber">
              {result.type === "preview" ? "Parse Preview" : "Ingest Result"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-cream text-xs font-data whitespace-pre-wrap overflow-auto max-h-60">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Enrichment Monitor Panel
// ---------------------------------------------------------------------------
function MonitorPanel() {
  const monitor = useQuery((api as any).queries.getEnrichmentMonitor);
  const retryFailed = useMutation((api as any).admin.retryFailedJobs);
  const buildSnapshot = useAction((api as any).admin.buildGraphSnapshot);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retryFailed({});
    } finally {
      setIsRetrying(false);
    }
  };

  const handleBuildSnapshot = async () => {
    setIsBuilding(true);
    try {
      await buildSnapshot({});
    } finally {
      setIsBuilding(false);
    }
  };

  if (!monitor) {
    return <p className="text-sleeve text-sm">Loading monitor data...</p>;
  }

  const steps: Array<{
    name: string;
    queued: number;
    running: number;
    completed: number;
    failed: number;
  }> = monitor.steps ?? [];

  const totalFailed = steps.reduce((sum, s) => sum + s.failed, 0);

  return (
    <div className="space-y-6">
      {/* Per-step progress bars */}
      <div className="space-y-4">
        {steps.map((step) => {
          const total = step.queued + step.running + step.completed + step.failed;
          const pct = total > 0 ? Math.round((step.completed / total) * 100) : 0;

          return (
            <Card key={step.name} className="bg-wood border-edge">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-data text-cream text-sm">
                    {step.name}
                  </span>
                  <span className="font-data text-amber text-sm">{pct}%</span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-shelf rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-amber rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Counts */}
                <div className="grid grid-cols-4 gap-2 text-xs font-data">
                  <div>
                    <span className="text-shadow">Queued</span>
                    <p className="text-cream">{step.queued}</p>
                  </div>
                  <div>
                    <span className="text-shadow">Running</span>
                    <p className="text-vinyl-blue">{step.running}</p>
                  </div>
                  <div>
                    <span className="text-shadow">Done</span>
                    <p className="text-led-green">{step.completed}</p>
                  </div>
                  <div>
                    <span className="text-shadow">Failed</span>
                    <p className="text-skip-red">{step.failed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {steps.length === 0 && (
          <p className="text-sleeve text-sm">No enrichment steps found.</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {totalFailed > 0 && (
          <Button
            variant="outline"
            onClick={handleRetry}
            disabled={isRetrying}
            className="text-skip-red border-skip-red hover:bg-skip-red hover:text-walnut"
          >
            {isRetrying ? "Retrying..." : `Retry Failed (${totalFailed})`}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleBuildSnapshot}
          disabled={isBuilding}
          className="text-vinyl-blue border-vinyl-blue hover:bg-vinyl-blue hover:text-walnut"
        >
          {isBuilding ? "Building..." : "Rebuild Graph Snapshot"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Stats Panel
// ---------------------------------------------------------------------------
function StatsPanel() {
  const stats = useQuery((api as any).queries.getEnrichmentStats);

  if (!stats) {
    return <p className="text-sleeve text-sm">Loading stats...</p>;
  }

  const cards = [
    {
      title: "Artists",
      items: [
        { label: "Total", value: stats.artistStats.total, accent: true },
        { label: "Stubs", value: stats.artistStats.stub },
        { label: "Identified", value: stats.artistStats.identified },
        { label: "Complete", value: stats.artistStats.complete },
        { label: "With images", value: stats.artistStats.withImages },
      ],
    },
    {
      title: "Tracks",
      items: [
        { label: "Total", value: stats.trackStats.total, accent: true },
        { label: "Raw", value: stats.trackStats.raw },
        { label: "With art", value: stats.trackStats.withAlbumArt },
        { label: "Complete", value: stats.trackStats.complete },
      ],
    },
    {
      title: "Knowledge Graph",
      items: [
        {
          label: "Connections",
          value: stats.graphStats?.connections ?? 0,
          accent: true,
        },
        {
          label: "Communities",
          value: stats.graphStats?.communities ?? 0,
        },
        {
          label: "Bridge artists",
          value: stats.graphStats?.bridgeArtists ?? 0,
        },
      ],
    },
    {
      title: "Jobs",
      items: [
        { label: "Queued", value: stats.jobStats.queued, accent: true },
        { label: "Running", value: stats.jobStats.running },
        {
          label: "Completed",
          value: stats.jobStats.completed,
          color: "text-led-green",
        },
        {
          label: "Failed",
          value: stats.jobStats.failed,
          color: "text-skip-red",
        },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="bg-wood border-edge">
          <CardHeader className="pb-2">
            <CardTitle className="font-editorial text-amber text-base">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {card.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-sleeve font-data">{item.label}</span>
                  <span
                    className={cn(
                      "font-data",
                      (item as any).color ??
                        ((item as any).accent ? "text-amber" : "text-cream")
                    )}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Admin Page
// ---------------------------------------------------------------------------
export default function AdminPage() {
  return (
    <div className="min-h-screen bg-walnut p-6">
      <h1 className="font-editorial text-cream text-2xl mb-6">
        Admin Dashboard
      </h1>

      <Tabs defaultValue="ingest">
        <TabsList className="bg-wood border border-edge mb-6">
          <TabsTrigger
            value="ingest"
            className="data-[state=active]:bg-amber data-[state=active]:text-walnut text-sleeve"
          >
            Ingest
          </TabsTrigger>
          <TabsTrigger
            value="monitor"
            className="data-[state=active]:bg-amber data-[state=active]:text-walnut text-sleeve"
          >
            Enrichment
          </TabsTrigger>
          <TabsTrigger
            value="stats"
            className="data-[state=active]:bg-amber data-[state=active]:text-walnut text-sleeve"
          >
            Stats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ingest">
          <Card className="bg-wood border-edge">
            <CardHeader>
              <CardTitle className="font-editorial text-cream">
                Ingest Playlist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IngestPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitor">
          <Card className="bg-wood border-edge">
            <CardHeader>
              <CardTitle className="font-editorial text-cream">
                Enrichment Monitor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MonitorPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats">
          <StatsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
