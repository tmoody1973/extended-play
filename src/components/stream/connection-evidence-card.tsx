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
    <div className="bg-wood border border-edge rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded bg-vinyl-blue/20 flex items-center justify-center">
          <span className="text-vinyl-blue text-[10px] font-data">
            {publication.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-sleeve text-xs font-data uppercase">{publication}</span>
      </div>
      <blockquote className="text-cream text-sm italic leading-relaxed border-l-2 border-amber pl-3">
        &ldquo;{excerpt}&rdquo;
      </blockquote>
      {artistNames && artistNames.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {artistNames.map((name) => (
            <span key={name} className="text-[10px] font-data px-1.5 py-0.5 bg-shelf rounded text-sleeve">
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
          className="text-vinyl-blue text-xs font-data mt-2 inline-block hover:underline"
        >
          Read full article &rarr;
        </a>
      )}
    </div>
  );
}
