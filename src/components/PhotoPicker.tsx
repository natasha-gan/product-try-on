"use client";

import { useRef, useState } from "react";

interface Photo {
  id: string;
  path: string;
  createdAt: string;
}

interface Props {
  photos: Photo[];
  selected: Photo | null;
  onSelect: (photo: Photo) => void;
  onUploaded: (photo: Photo) => void;
  onDelete: (id: string) => void;
}

export function PhotoPicker({ photos, selected, onSelect, onUploaded, onDelete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/photos", { method: "POST", body: form });
      const data = await res.json();
      if (data.success) {
        onUploaded(data.data);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startLongPress = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      setLongPressId(id);
    }, 500);
  };

  const endLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="relative">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />

      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {/* Add photo button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 w-[72px] h-[96px] rounded-xl border-2 border-dashed border-border
                     flex flex-col items-center justify-center gap-1
                     hover:border-foreground/30 hover:bg-muted/50
                     active:scale-95 transition-all"
        >
          {uploading ? (
            <svg className="animate-spin h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <>
              <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="text-[10px] text-muted-foreground font-medium">Add</span>
            </>
          )}
        </button>

        {/* Photo thumbnails */}
        {photos.map((photo) => (
          <div key={photo.id} className="relative shrink-0">
            <button
              onClick={() => {
                if (longPressId === photo.id) {
                  setLongPressId(null);
                  return;
                }
                onSelect(photo);
              }}
              onMouseDown={() => startLongPress(photo.id)}
              onMouseUp={endLongPress}
              onMouseLeave={endLongPress}
              onTouchStart={() => startLongPress(photo.id)}
              onTouchEnd={endLongPress}
              className={`w-[72px] h-[96px] rounded-xl overflow-hidden transition-all active:scale-95
                ${selected?.id === photo.id
                  ? "ring-2 ring-foreground ring-offset-2"
                  : "ring-1 ring-border hover:ring-foreground/30"
                }`}
            >
              <img
                src={photo.path}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            </button>

            {/* Delete button (shown on long press or hover on desktop) */}
            {longPressId === photo.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLongPressId(null);
                  onDelete(photo.id);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-white
                           flex items-center justify-center scale-in shadow-md"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {photos.length === 0 && !uploading && (
        <p className="text-sm text-muted-foreground mt-2">
          Upload a photo of yourself to get started
        </p>
      )}
    </div>
  );
}
