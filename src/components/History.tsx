"use client";

interface TryOn {
  id: string;
  photoId: string;
  clothingName: string | null;
  clothingImage: string | null;
  clothingUrl: string;
  resultImage: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  photo: { id: string; path: string; createdAt: string };
}

interface Props {
  items: TryOn[];
  activeId?: string;
  onSelect: (item: TryOn) => void;
  onDelete: (id: string) => void;
}

export function History({ items, activeId, onSelect, onDelete }: Props) {
  const completed = items.filter((t) => t.status === "done" && t.id !== activeId);

  if (completed.length === 0) return null;

  return (
    <div className="space-y-3 slide-up">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Recent
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {completed.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-muted
                       ring-1 ring-border hover:ring-foreground/20
                       active:scale-[0.97] transition-all"
          >
            {item.resultImage ? (
              <img
                src={item.resultImage}
                alt={item.clothingName || "Try-on result"}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : item.clothingImage ? (
              <img
                src={item.clothingImage}
                alt={item.clothingName || "Clothing"}
                className="w-full h-full object-cover opacity-60"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-xs text-muted-foreground">No image</span>
              </div>
            )}

            {/* Overlay with name */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
              <p className="text-[11px] text-white/90 font-medium truncate leading-tight">
                {item.clothingName || "Try-on"}
              </p>
            </div>

            {/* Delete on hover (desktop) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white
                         flex items-center justify-center
                         opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}
