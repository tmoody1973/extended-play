export default function Home() {
  return (
    <main className="min-h-screen bg-walnut bg-wood-grain p-8">
      <h1 className="text-4xl font-editorial text-cream mb-6">Extended Play</h1>
      <p className="text-sleeve font-body mb-8">Tokyo Record Bar Theme Test</p>
      <div className="flex gap-3 mb-6 flex-wrap">
        {[
          ["walnut", "bg-walnut"],
          ["wood", "bg-wood"],
          ["shelf", "bg-shelf"],
          ["amber", "bg-amber"],
          ["vinyl-blue", "bg-vinyl-blue"],
          ["cream", "bg-cream"],
          ["sleeve", "bg-sleeve"],
          ["shadow", "bg-shadow"],
          ["led-green", "bg-led-green"],
          ["skip-red", "bg-skip-red"],
          ["edge", "bg-edge"],
        ].map(([name, cls]) => (
          <div key={name} className="flex flex-col items-center gap-1">
            <div className={`w-12 h-12 rounded ${cls} ring-1 ring-edge`} />
            <span className="text-sleeve text-xs font-data">{name}</span>
          </div>
        ))}
      </div>
      <div className="bg-shelf p-6 rounded-lg shadow-vinyl max-w-md mb-6">
        <h2 className="text-2xl font-editorial text-cream mb-2">Album Card</h2>
        <p className="text-sleeve text-sm font-data">JetBrains Mono metadata</p>
        <p className="text-cream mt-2">This card uses the shelf background with vinyl shadow.</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-shelf ring-2 ring-amber ring-tube-glow flex items-center justify-center">
          <span className="text-amber font-editorial text-xl">F</span>
        </div>
        <div>
          <p className="text-cream font-editorial">Graph Node Preview</p>
          <p className="text-sleeve text-sm">Amber tube glow ring</p>
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-amber animate-vu-pulse" />
        <span className="text-sleeve text-sm">VU Pulse Animation</span>
      </div>
      <div className="mt-4 bg-shelf p-4 rounded-lg animate-slide-up">
        <p className="text-cream text-sm">Slide-up animation card</p>
      </div>
    </main>
  );
}
