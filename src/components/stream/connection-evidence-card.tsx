"use client";

interface ConnectionEvidenceCardProps {
  publication: string;
  excerpt: string;
  url?: string;
  artistNames?: string[];
}

export function ConnectionEvidenceCard({
  publication,
  excerpt,
  url,
  artistNames,
}: ConnectionEvidenceCardProps) {
  return (
    <div className="rounded-lg bg-shelf/50 p-4 border-l-2 border-vinyl-blue">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-vinyl-blue/20 flex items-center justify-center">
          <span className="text-vinyl-blue text-[11px] font-editorial font-bold">
            {publication.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-vinyl-blue text-xs font-data uppercase tracking-wider">{publication}</span>
      </div>
      <blockquote className="text-cream text-[15px] italic leading-relaxed font-editorial">
        &ldquo;{excerpt}&rdquo;
      </blockquote>
      {artistNames && artistNames.length > 0 && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {artistNames.map((name) => (
            <span key={name} className="text-[10px] font-data px-2 py-0.5 rounded-full bg-vinyl-blue/10 text-vinyl-blue/80 border border-vinyl-blue/20">
              {name}
            </span>
          ))}
        </div>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-vinyl-blue/70 text-xs font-data mt-3 inline-block hover:text-vinyl-blue transition-colors"
        >
          Read full article &rarr;
        </a>
      )}
    </div>
  );
}
