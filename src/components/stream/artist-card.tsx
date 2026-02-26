interface ArtistCardProps {
  name: string;
  imageUrl?: string;
  genres?: string[];
  bio?: string;
  country?: string;
  communityLabel?: string;
}

export function ArtistCard({ name, imageUrl, genres, bio, country, communityLabel }: ArtistCardProps) {
  return (
    <div className="bg-shelf rounded-lg p-4 shadow-vinyl animate-slide-up">
      <div className="flex items-start gap-3">
        {/* Artist photo */}
        <div
          className="w-16 h-16 rounded-full bg-wood flex-shrink-0 ring-2 ring-amber ring-tube-glow bg-cover bg-center flex items-center justify-center"
          style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
        >
          {!imageUrl && (
            <span className="text-amber font-editorial text-lg">
              {name.charAt(0)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-cream font-editorial text-lg">{name}</h4>
          {country && (
            <p className="text-sleeve text-xs font-data">{country}</p>
          )}
          {communityLabel && (
            <span className="inline-block text-xs bg-wood text-amber px-2 py-0.5 rounded mt-1">
              {communityLabel}
            </span>
          )}
        </div>
      </div>
      {genres && genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {genres.slice(0, 5).map((g) => (
            <span key={g} className="text-xs bg-wood text-sleeve px-2 py-0.5 rounded">
              {g}
            </span>
          ))}
        </div>
      )}
      {bio && (
        <p className="text-sleeve text-sm mt-3 line-clamp-3">{bio}</p>
      )}
    </div>
  );
}
