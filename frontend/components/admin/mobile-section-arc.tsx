"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { NavItem } from "@/lib/admin-nav";

/** Rayon de la première couronne, depuis le centre de l'icône du
 * département. Assez grand pour que les bulles dégagent la barre et que
 * leurs étiquettes ne se recouvrent pas. */
const RING_RADIUS = 132;
/** Écart entre deux couronnes. Au-delà de RING_CAPACITY items l'arc se
 * dédouble : à rayon constant, les neuf écrans de Finance se
 * chevauchaient — bulles ET étiquettes. */
const RING_GAP = 84;
/** Bulles par couronne, selon la largeur disponible.
 *
 * Fixe, ce nombre écrasait la couronne intérieure sur les petits écrans :
 * cinq bulles compressées pour tenir dans 375px finissaient collées, et
 * leurs étiquettes se recouvraient. Mieux vaut une couronne de plus, qui
 * s'étale vers le haut, qu'une couronne serrée qui s'étale vers nulle part.
 */
function ringCapacity(viewportWidth: number) {
  if (!viewportWidth || viewportWidth >= 600) return 5;
  if (viewportWidth >= 400) return 4;
  return 3;
}
const BUBBLE_SIZE = 44;
/** Demi-largeur d'étiquette retenue pour le recentrage. Calée sur la plus
 * large après raccourcissement (« Encaissements », ~150px) : sous-estimée,
 * l'arc se recentre trop peu et la première étiquette sort de l'écran. */
const LABEL_HALF_WIDTH = 78;

/** Positions de toutes les bulles, en pixels relatifs au centre de l'icône.
 *
 * Les items se répartissent sur un arc centré sur la verticale (90°), en
 * couronnes successives dès que leur nombre dépasse RING_CAPACITY : à rayon
 * constant, les neuf écrans de Finance se chevauchaient.
 *
 * Calculé pour l'arc entier plutôt que bulle par bulle, parce que le
 * recentrage dans la fenêtre est une translation d'ensemble. Borner chaque
 * bulle séparément, la version précédente, écrasait les unes sur les autres
 * toutes celles qui dépassaient — « Clôture » finissait sous « Rappro. ».
 */
function arcPositions(count: number, anchorPx: number, viewportWidth: number) {
  const capacity = ringCapacity(viewportWidth);
  const raw = Array.from({ length: count }, (_, index) => {
    const ringIndex = Math.floor(index / capacity);
    const radius = RING_RADIUS + ringIndex * RING_GAP;
    const inRing = Math.min(capacity, count - ringIndex * capacity);
    const positionInRing = index % capacity;

    if (inRing === 1) return { x: 0, y: -radius };

    // Borné à 110° (±55° depuis la verticale). Plus ouvert, les bulles
    // extrêmes approchent l'horizontale et se posent sur la barre.
    const spread = Math.min(110, 52 + inRing * 16);
    const start = 90 - spread / 2;
    const angle = ((start + (spread / (inRing - 1)) * positionInRing) * Math.PI) / 180;
    return { x: radius * Math.cos(angle), y: -radius * Math.sin(angle) };
  });

  if (!viewportWidth) return raw;

  const minX = Math.min(...raw.map((p) => p.x));
  const maxX = Math.max(...raw.map((p) => p.x));
  const available = viewportWidth - 2 * LABEL_HALF_WIDTH;

  // Compression horizontale quand l'arc est plus large que la fenêtre —
  // Finance et ses neuf écrans. Aucune translation ne peut faire tenir un
  // arc trop large : sans ce facteur, la dernière bulle restait hors champ
  // quel que soit le décalage. L'arc devient une ellipse, ce qui se lit
  // encore comme un arc.
  const width = maxX - minX;
  const scale = width > available ? available / width : 1;
  const scaled = raw.map((p) => ({ x: p.x * scale, y: p.y }));

  // Puis translation d'ensemble : l'arc garde sa forme et glisse jusqu'à
  // tenir dans la fenêtre. La demi-largeur d'étiquette est la marge à
  // respecter, l'étiquette étant centrée sous sa bulle.
  const left = anchorPx + minX * scale - LABEL_HALF_WIDTH;
  const right = anchorPx + maxX * scale + LABEL_HALF_WIDTH;
  let shift = 0;
  if (left < 0) shift = -left;
  else if (right > viewportWidth) shift = viewportWidth - right;

  return scaled.map((p) => ({ x: p.x + shift, y: p.y }));
}

/**
 * Sous-interfaces d'un département, déployées en arc au-dessus de son icône.
 *
 * La barre du bas n'ouvrait que `items[0]` de chaque département : les autres
 * écrans n'avaient aucun chemin d'accès sur téléphone. Le déploiement reprend
 * le geste du bouton d'actions rapides — même ressort, même filtre gooey —
 * pour que les deux menus de la barre se comportent pareil.
 */
export function MobileSectionArc({
  items,
  onClose,
}: {
  items: NavItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState({ anchorPx: 0, viewportWidth: 0 });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Position réelle de l'ancre, mesurée plutôt que déduite du rang du
  // département : le nombre de départements visibles dépend des droits de
  // l'utilisateur, donc la largeur d'une cellule aussi. Mesuré avant peinture
  // pour que les bulles partent tout de suite au bon endroit.
  useLayoutEffect(() => {
    const measure = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (rect) setFrame({ anchorPx: rect.left, viewportWidth: window.innerWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const positions = arcPositions(items.length, frame.anchorPx, frame.viewportWidth);

  return (
    <>
      <span ref={anchorRef} className="absolute size-0" aria-hidden />
      <div className="pointer-events-none absolute inset-0 [filter:url(#admin-quickactions-goo)]">
        {/* Bulle d'ancrage : c'est elle qui fait « couler » les autres hors
            de l'icône quand le filtre gooey les fusionne au départ. */}
        <span
          className="absolute rounded-full bg-neutral-900"
          style={{ left: -BUBBLE_SIZE / 2, top: -BUBBLE_SIZE / 2, width: BUBBLE_SIZE, height: BUBBLE_SIZE }}
        />
        <AnimatePresence>
          {items.map((item, index) => {
            const { x, y } = positions[index];
            return (
              <motion.span
                key={item.href}
                initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                animate={{ x, y, scale: 1, opacity: 1 }}
                exit={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                transition={{ type: "spring", stiffness: 360, damping: 24, delay: index * 0.028 }}
                className="absolute rounded-full bg-neutral-900"
                style={{ left: -BUBBLE_SIZE / 2, top: -BUBBLE_SIZE / 2, width: BUBBLE_SIZE, height: BUBBLE_SIZE }}
              />
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {items.map((item, index) => {
          const Icon = item.icon;
          const { x, y } = positions[index];
          return (
            <motion.button
              key={item.href}
              type="button"
              initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
              animate={{ x, y, scale: 1, opacity: 1 }}
              exit={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 24, delay: index * 0.028 }}
              onClick={() => {
                onClose();
                router.push(item.href);
              }}
              aria-label={item.label}
              className="pointer-events-auto absolute"
              style={{ left: -BUBBLE_SIZE / 2, top: -BUBBLE_SIZE / 2, width: BUBBLE_SIZE, height: BUBBLE_SIZE }}
            >
              <span className="flex size-full items-center justify-center rounded-full">
                <Icon className="size-[18px] text-white" />
              </span>
              <span className="absolute top-full left-1/2 mt-1.5 -translate-x-1/2 rounded-full bg-neutral-900 px-2 py-0.5 text-[0.65rem] font-medium whitespace-nowrap text-white shadow-md">
                {item.shortLabel ?? item.label}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </>
  );
}
