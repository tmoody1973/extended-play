interface NarrationCardProps {
  content: string;
  timestamp?: string;
  style?: string;
}

export function NarrationCard({ content, timestamp }: NarrationCardProps) {
  return (
    <div className="bg-shelf rounded-lg p-4 shadow-vinyl animate-slide-up">
      <p className="text-cream text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      {timestamp && (
        <p className="text-shadow text-xs font-data mt-2">{timestamp}</p>
      )}
    </div>
  );
}
