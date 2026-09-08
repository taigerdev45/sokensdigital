"use client";

import { Check, User, Cog, Archive, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepKey = "concept" | "technique" | "logistique" | "validation";

const STAGES: { key: StepKey; label: string; icon: LucideIcon }[] = [
  { key: "concept", label: "Concept", icon: User },
  { key: "technique", label: "Technique", icon: Cog },
  { key: "logistique", label: "Logistique", icon: Archive },
  { key: "validation", label: "Validation", icon: Send },
];

export function Stepper({ current }: { current: StepKey }) {
  const currentIndex = STAGES.findIndex((s) => s.key === current);

  return (
    <div className="flex items-start">
      {STAGES.map((stage, i) => {
        const status = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        return (
          // `min-w-0` : sans lui, la largeur naturelle des libellés
          // (« Logistique » en majuscules espacées) impose au conteneur une
          // largeur minimale, et les quatre étapes débordaient l'écran sur
          // les plus étroits — la page ne s'ouvrait qu'au prix d'un dézoom.
          <div key={stage.key} className="flex min-w-0 flex-1 items-center last:flex-none">
            <div className="flex min-w-0 flex-col items-center gap-2 text-center">
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors sm:size-11",
                  status === "done" &&
                    "border-primary bg-primary text-primary-foreground",
                  status === "current" &&
                    "border-primary/60 bg-primary/10 text-primary",
                  status === "upcoming" &&
                    "border-white/10 bg-white/[0.03] text-muted-foreground"
                )}
              >
                {status === "done" ? (
                  <Check className="size-5" />
                ) : (
                  <stage.icon className="size-5" />
                )}
              </div>
              <span
                className={cn(
                  // L'interlettrage large est la moitié de l'encombrement
                  // du libellé : on le réserve aux écrans qui l'absorbent.
                  "text-[10px] font-semibold uppercase sm:text-xs sm:tracking-[0.1em]",
                  status === "upcoming" ? "text-muted-foreground" : "text-primary"
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-px min-w-2 flex-1 sm:mx-3",
                  status === "done" ? "bg-primary" : "bg-white/10"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
