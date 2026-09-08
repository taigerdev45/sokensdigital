"use client";

import { useRef, useState } from "react";
import { GripVertical, ImagePlus, Loader2, X } from "lucide-react";
import { uploadImage } from "@/lib/api/upload";

/** The first image is the cover / single-image post; any further ones
 * become carousel slides (Instagram) or are simply ignored past the
 * first on platforms that don't support multi-image posts (Facebook
 * still posts just the cover). Reorder by dragging — the first slot
 * always wins as "cover". */
export function MultiImageUploadField({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await Promise.all(files.map((file) => uploadImage(file)));
      onChange([...images, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'upload.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function handleDrop(index: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    onChange(next);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((url, index) => (
          <div
            key={url}
            draggable
            onDragStart={() => (dragIndex.current = index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="group relative size-20 shrink-0 overflow-hidden rounded-lg border border-neutral-200"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="size-full object-cover" />
            {index === 0 && (
              <span className="absolute bottom-0 left-0 rounded-tr-md bg-black/60 px-1.5 py-0.5 text-[0.6rem] font-medium text-white">
                Couverture
              </span>
            )}
            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label="Retirer l'image"
              className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
            <span className="absolute top-0.5 left-0.5 flex size-5 cursor-grab items-center justify-center text-white/70 opacity-0 transition-opacity group-hover:opacity-100">
              <GripVertical className="size-3.5" />
            </span>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 hover:border-primary/40 hover:text-primary"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-5" />}
          <span className="text-[0.65rem] font-medium">Ajouter</span>
        </button>
      </div>
      {images.length > 1 && (
        <p className="mt-1.5 text-xs text-neutral-400">
          {images.length} images — publiées en carrousel sur Instagram. Glissez pour changer l&apos;ordre.
        </p>
      )}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.gif" multiple onChange={handleFiles} className="hidden" />
    </div>
  );
}
