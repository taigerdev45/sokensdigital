"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SECTION_ICONS, type NavSection } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";

/**
 * Liste les écrans d'un département, sur mobile.
 *
 * La barre du bas ouvrait directement `section.items[0].href`, donc seul le
 * premier écran de chaque département était atteignable : 25 des 32 écrans
 * de l'application n'avaient aucun chemin d'accès sur petit écran, y compris
 * tout le sous-groupe RH, Maintenance et Encaissements.
 *
 * Les sous-groupes sont rendus comme dans la sidebar (même règle : l'intitulé
 * n'apparaît qu'au premier item d'un nouveau groupe), pour qu'un utilisateur
 * qui passe du poste au téléphone retrouve la même arborescence.
 */
export function MobileSectionSheet({
  section,
  activeItemHref,
  onClose,
}: {
  section: NavSection | null;
  activeItemHref: string | null;
  onClose: () => void;
}) {
  // Échap ferme le panneau, et le fond ne défile pas derrière lui.
  useEffect(() => {
    if (!section) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [section, onClose]);

  const Icon = section ? SECTION_ICONS[section.title] : null;

  return (
    <AnimatePresence>
      {section && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden
            className="fixed inset-0 z-40 bg-neutral-950/40 backdrop-blur-[2px] lg:hidden"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Écrans du département ${section.title}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-neutral-200 bg-white lg:hidden"
          >
            {/* Poignée décorative — repère visuel du panneau glissant. */}
            <div className="sticky top-0 z-10 bg-white/95 px-5 pt-3 pb-2 backdrop-blur-md">
              <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-neutral-200" />
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-sm font-semibold text-neutral-900">
                  {Icon && <Icon className="size-4 text-neutral-500" />}
                  {section.title}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fermer"
                  className="-mr-1.5 rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <nav
              className="px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
              // La barre du bas reste visible sous le panneau ; cette marge
              // evite que le dernier item finisse dessous.
              style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
            >
              {section.items.map((item, index) => {
                const ItemIcon = item.icon;
                const isActive = item.href === activeItemHref;
                // Même règle que la sidebar : l'intitulé de groupe n'est
                // affiché qu'au premier item d'un nouveau groupe.
                const previousGroup = index > 0 ? section.items[index - 1].group : undefined;
                const showGroupHeading = item.group && item.group !== previousGroup;

                return (
                  <div key={item.href}>
                    {showGroupHeading && (
                      <p className="mt-4 mb-1 px-3 text-[0.65rem] font-semibold tracking-wider text-neutral-400 uppercase first:mt-1">
                        {item.group}
                      </p>
                    )}
                    <Link
                      href={item.href}
                      onClick={onClose}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        // min-h-11 : cible tactile confortable (~44px), le
                        // py-2 de la sidebar est trop serré au doigt.
                        "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                        item.group && "ml-2",
                        isActive
                          ? "bg-primary/10 font-semibold text-primary"
                          : "text-neutral-700 active:bg-neutral-100"
                      )}
                    >
                      <ItemIcon className="size-4 shrink-0 text-neutral-400" />
                      {item.label}
                    </Link>
                  </div>
                );
              })}
            </nav>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
