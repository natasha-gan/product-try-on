"use client";

import { useState, useEffect, useCallback } from "react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { TryOnView } from "@/components/TryOnView";
import { History } from "@/components/History";

interface Photo {
  id: string;
  path: string;
  createdAt: string;
}

interface TryOn {
  id: string;
  photoId: string;
  clothingUrl: string;
  clothingName: string | null;
  clothingImage: string | null;
  resultImage: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  photo: Photo;
}

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [url, setUrl] = useState("");
  const [activeTryOn, setActiveTryOn] = useState<TryOn | null>(null);
  const [history, setHistory] = useState<TryOn[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPhotos = useCallback(async () => {
    const res = await fetch("/api/photos");
    const data = await res.json();
    if (data.success) {
      setPhotos(data.data);
      // Auto-select most recent if none selected
      if (!selectedPhoto && data.data.length > 0) {
        setSelectedPhoto(data.data[0]);
      }
    }
  }, [selectedPhoto]);

  const fetchHistory = useCallback(async () => {
    const res = await fetch("/api/tryon");
    const data = await res.json();
    if (data.success) setHistory(data.data);
  }, []);

  useEffect(() => {
    fetchPhotos();
    fetchHistory();
  }, [fetchPhotos, fetchHistory]);

  // Poll active try-on for status updates
  useEffect(() => {
    if (!activeTryOn || activeTryOn.status === "done" || activeTryOn.status === "failed") return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/tryon?id=${activeTryOn.id}`);
      const data = await res.json();
      if (data.success && data.data) {
        setActiveTryOn(data.data);
        if (data.data.status === "done" || data.data.status === "failed") {
          fetchHistory();
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeTryOn, fetchHistory]);

  const handlePhotoUploaded = async (photo: Photo) => {
    setPhotos((prev) => [photo, ...prev]);
    setSelectedPhoto(photo);
  };

  const handleSubmit = async () => {
    if (!selectedPhoto || !url.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: selectedPhoto.id, clothingUrl: url.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveTryOn(data.data);
        setUrl("");
      }
    } catch (err) {
      console.error("Failed to start try-on:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHistorySelect = (tryOn: TryOn) => {
    setActiveTryOn(tryOn);
    // Set the photo that was used
    const photo = photos.find((p) => p.id === tryOn.photoId) || tryOn.photo;
    if (photo) setSelectedPhoto(photo);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/tryon?id=${id}`, { method: "DELETE" });
    if (activeTryOn?.id === id) setActiveTryOn(null);
    fetchHistory();
  };

  const handleDeletePhoto = async (id: string) => {
    const res = await fetch(`/api/photos?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      alert(data.error || "Failed to delete photo");
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    if (selectedPhoto?.id === id) {
      setSelectedPhoto(photos.find((p) => p.id !== id) || null);
    }
  };

  const isProcessing = activeTryOn?.status === "scraping" || activeTryOn?.status === "generating";
  const canSubmit = selectedPhoto && url.trim() && !isSubmitting && !isProcessing;

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <h1 className="text-lg font-semibold tracking-tight">natasha</h1>
        <span className="text-xs text-muted-foreground tracking-wide uppercase">Virtual Try-On</span>
      </header>

      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-5 py-6 gap-8">
        {/* Active try-on result */}
        {activeTryOn && (
          <TryOnView
            tryOn={activeTryOn}
            onDismiss={() => setActiveTryOn(null)}
            onDelete={() => handleDelete(activeTryOn.id)}
          />
        )}

        {/* Try-on input form */}
        {!isProcessing && (
          <div className="space-y-6 slide-up">
            {/* Photo picker */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Your Photo
              </label>
              <PhotoPicker
                photos={photos}
                selected={selectedPhoto}
                onSelect={setSelectedPhoto}
                onUploaded={handlePhotoUploaded}
                onDelete={handleDeletePhoto}
              />
            </div>

            {/* URL input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Clothing URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
                  placeholder="Paste a product link…"
                  className="flex-1 h-12 px-4 rounded-xl border border-border bg-white text-sm
                             placeholder:text-muted-foreground/60
                             focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/20
                             transition-all"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="h-12 px-6 rounded-xl bg-foreground text-background text-sm font-medium
                             hover:bg-foreground/90 active:scale-[0.98]
                             disabled:opacity-30 disabled:pointer-events-none
                             transition-all"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Spinner />
                      <span className="hidden sm:inline">Starting…</span>
                    </span>
                  ) : (
                    "Try On"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <History
            items={history}
            activeId={activeTryOn?.id}
            onSelect={handleHistorySelect}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
