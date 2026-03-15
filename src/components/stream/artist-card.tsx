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
    <div className="rounded-lg overflow-hidden shadow-vinyl">
      {/* Hero image section */}
      <div className="relative h-40 bg-walnut overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover opacity-60"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber/20 via-walnut to-vinyl-blue/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-shelf via-shelf/40 to-transparent" />

        {/* Name overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-end gap-3">
            {/* Circular avatar */}
            <div
              className="w-14 h-14 rounded-full flex-shrink-0 ring-2 ring-gold/60 bg-wood bg-cover bg-center flex items-center justify-center"
              style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
            >
              {!imageUrl && (
                <span className="text-gold font-editorial text-xl font-bold">
                  {name.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <h4 className="text-cream font-editorial text-xl font-bold tracking-tight leading-tight">
                {name}
              </h4>
              <div className="flex items-center gap-2 mt-0.5">
                {country && (
                  <span className="text-cream/60 text-[10px] font-data uppercase">{country}</span>
                )}
                {communityLabel && (
                  <span className="text-[10px] font-data text-gold/80 bg-gold/10 px-1.5 py-0.5 rounded">
                    {communityLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="bg-shelf p-4">
        {genres && genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {genres.slice(0, 5).map((g) => (
              <span
                key={g}
                className="text-[10px] font-data uppercase tracking-wider px-2 py-0.5 rounded-full border border-edge text-sleeve"
              >
                {g}
              </span>
            ))}
          </div>
        )}
        {bio && (
          <p className="text-cream/70 text-sm leading-relaxed line-clamp-3">{bio}</p>
        )}
      </div>
    </div>
  );
}
