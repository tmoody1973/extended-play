interface AlbumArtCardProps {
  artUrl?: string;
  title: string;
  artistName: string;
  albumTitle?: string;
  year?: number;
}

export function AlbumArtCard({ artUrl, title, artistName, albumTitle, year }: AlbumArtCardProps) {
  return (
    <div className="bg-shelf rounded-lg overflow-hidden shadow-vinyl animate-slide-up">
      {artUrl && (
        <div
          className="w-full aspect-square bg-wood bg-cover bg-center"
          style={{ backgroundImage: `url(${artUrl})` }}
        />
      )}
      <div className="p-3">
        <p className="text-cream text-sm font-medium truncate">{title}</p>
        <p className="text-sleeve text-xs truncate">{artistName}</p>
        {albumTitle && (
          <p className="text-shadow text-xs font-data mt-1">
            {albumTitle}{year ? ` (${year})` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
