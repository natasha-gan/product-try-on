"use client";

interface TryOn {
  id: string;
  clothingName: string | null;
  clothingImage: string | null;
  clothingUrl: string;
  resultImage: string | null;
  status: string;
  error: string | null;
  photo: { id: string; path: string; createdAt: string };
}

interface Props {
  tryOn: TryOn;
  onDismiss: () => void;
  onDelete: () => void;
}

export function TryOnView({ tryOn, onDismiss, onDelete }: Props) {
  const isProcessing = tryOn.status === "scraping" || tryOn.status === "generating";
  const isDone = tryOn.status === "done";
  const isFailed = tryOn.status === "failed";

  return (
    <div className="space-y-4 fade-in">
      {/* Status + actions bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-80" d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span>
                {tryOn.status === "scraping" ? "Fetching product…" : "Generating try-on…"}
              </span>
            </div>
          )}
          {isDone && tryOn.clothingName && (
            <p className="text-sm font-medium truncate max-w-[240px]">{tryOn.clothingName}</p>
          )}
          {isFailed && (
            <p className="text-sm text-destructive">
              Failed{tryOn.error ? `: ${tryOn.error}` : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isDone && (
            <a
              href={tryOn.clothingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="View product"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
          {(isDone || isFailed) && (
            <button
              onClick={onDelete}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
          <button
            onClick={onDismiss}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Result image or loading state */}
      {isProcessing && (
        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted">
          {/* Show the user's photo as backdrop during processing */}
          <img
            src={tryOn.photo.path}
            alt=""
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-foreground/10" />
              <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">
                {tryOn.status === "scraping" ? "Analyzing product…" : "Creating your look…"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {tryOn.status === "scraping" ? "Extracting product details" : "This usually takes 10–20 seconds"}
              </p>
            </div>
          </div>
        </div>
      )}

      {isDone && tryOn.resultImage && (
        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted scale-in">
          <img
            src={tryOn.resultImage}
            alt={`Try-on: ${tryOn.clothingName}`}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {isFailed && (
        <div className="aspect-[3/4] rounded-2xl border border-dashed border-border flex items-center justify-center">
          <div className="text-center px-6">
            <p className="text-muted-foreground text-sm">Something went wrong</p>
            {tryOn.error && (
              <p className="text-xs text-muted-foreground/70 mt-2 max-w-xs">{tryOn.error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
