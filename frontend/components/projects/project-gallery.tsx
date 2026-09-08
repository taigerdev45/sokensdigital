"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LayoutDashboard, Smartphone, Server, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "dashboard", label: "Vue tableau de bord", icon: LayoutDashboard },
  { key: "mobile", label: "Vue mobile", icon: Smartphone },
  { key: "infra", label: "Vue infrastructure", icon: Server },
  { key: "analytics", label: "Vue analytique", icon: BarChart3 },
];

const CYCLE_DURATION = 5000;

type Props = {
  title: string;
  images?: string[];
  videoSrc?: string;
};

export function ProjectGallery({ title, images, videoSrc }: Props) {
  const hasImages = Boolean(images && images.length > 0);
  const hasMedia = Boolean(videoSrc) || hasImages;
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!hasImages || !images || images.length < 2) return;
    const id = setInterval(() => setActive((i) => (i + 1) % images.length), CYCLE_DURATION);
    return () => clearInterval(id);
  }, [hasImages, images]);

  if (hasMedia) {
    return (
      <div>
        <div className="relative aspect-video overflow-hidden rounded-2xl border-2 border-primary/25 bg-black">
          {videoSrc ? (
            <video
              src={videoSrc}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <AnimatePresence mode="sync">
              <motion.img
                key={images![active]}
                src={images![active]}
                alt={title}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </AnimatePresence>
          )}
        </div>

        {!videoSrc && images && images.length > 1 && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Image ${i + 1}`}
                aria-pressed={active === i}
                className={cn(
                  "relative aspect-video overflow-hidden rounded-lg border transition-colors",
                  active === i ? "border-primary/60" : "border-white/10 hover:border-white/20"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        aria-label={`${title} — ${VIEWS[active].label}`}
        className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_60%_20%,color-mix(in_oklch,var(--primary),transparent_78%),transparent_60%),linear-gradient(150deg,oklch(0.16_0.02_235),oklch(0.07_0.01_240))]"
      >
        <div className="absolute inset-0 [background-image:linear-gradient(color-mix(in_oklch,var(--primary),transparent_92%)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklch,var(--primary),transparent_92%)_1px,transparent_1px)] [background-size:28px_28px]" />
        {(() => {
          const ActiveIcon = VIEWS[active].icon;
          return <ActiveIcon className="relative size-14 text-primary/40" />;
        })()}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {VIEWS.map((view, i) => (
          <button
            key={view.key}
            type="button"
            onClick={() => setActive(i)}
            aria-label={view.label}
            aria-pressed={active === i}
            className={cn(
              "relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border transition-colors",
              active === i
                ? "border-primary/60 bg-primary/5"
                : "border-white/10 bg-white/[0.02] hover:border-white/20"
            )}
          >
            <view.icon
              className={cn(
                "size-5",
                active === i ? "text-primary" : "text-muted-foreground"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
