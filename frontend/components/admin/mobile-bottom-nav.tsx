"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { ADMIN_SECTIONS, SECTION_ICONS, SECTION_SHORT_LABELS, findNavMatch, filterSectionsByAccess, type NavSection } from "@/lib/admin-nav";
import { MobileSectionArc } from "@/components/admin/mobile-section-arc";
import { useAuth } from "@/lib/auth/auth-context";
import { usePermissions } from "@/lib/admin/permissions-context";
import { ROLE_QUICK_ACTIONS, type QuickAction } from "@/lib/admin/role-quick-actions";
import { useProfileModal } from "@/lib/admin/profile-modal-context";
import { cn } from "@/lib/utils";

const MAIN_BUTTON_SIZE = 56;
const ACTION_BUTTON_SIZE = 44;
const ACTION_REST_OFFSET = (MAIN_BUTTON_SIZE - ACTION_BUTTON_SIZE) / 2;
const ARC_RADIUS = 68;
// Most of the FAB floats above the bar; only this many px dip into it, well
// clear of the icon row so it never sits on top of the middle department.
const BAR_OVERLAP = 8;

/** Spreads N actions across an upward arc centered on straight-up (90°),
 * closest in feel to the reference's fan of bubbles rather than a vertical
 * stack — e.g. 3 actions land at 40°/90°/140°. */
function arcOffset(index: number, count: number) {
  if (count <= 1) return { x: 0, y: -ARC_RADIUS };
  const spread = count === 2 ? 70 : 100;
  const start = 90 - spread / 2;
  const angleDeg = start + (spread / (count - 1)) * index;
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: ARC_RADIUS * Math.cos(angleRad), y: -ARC_RADIUS * Math.sin(angleRad) };
}

/** Mobile-only replacement for the sidebar (dribbble.com/shots/… "Tab Bar
 * Call To Action Button" by Julien Deriaz): 5 department icons in a bottom
 * bar with a raised circular FAB centered above them. Tapping the FAB fans
 * out 2-3 role-specific quick actions in a connected gooey arc (dribbble.com
 * /shots/26592910, "Multi-action Button/Split Button"). Desktop is
 * untouched — this whole component is `lg:hidden`, mirroring the sidebar's
 * `hidden lg:flex`. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();
  const { openProfileModal } = useProfileModal();
  const { canAccessModule } = usePermissions();
  const sections = filterSectionsByAccess(ADMIN_SECTIONS, canAccessModule);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [openSection, setOpenSection] = useState<NavSection | null>(null);
  // Reset during render on navigation rather than in an effect — avoids a
  // flash of the fan-out menu still open on the page it was triggered from.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setActionsOpen(false);
    setOpenSection(null);
  }

  const match = findNavMatch(pathname, sections);
  const activeSectionTitle = match?.section.title ?? null;
  const quickActions = ROLE_QUICK_ACTIONS[profile?.role ?? "AUTRE"];

  /** Un département n'ayant qu'un ecran n'a rien a deployer : on y va
   * directement plutot que d'ouvrir un arc a une seule bulle. Un second tap
   * sur le meme departement referme l'arc. */
  function handleSectionTap(section: NavSection) {
    setActionsOpen(false);
    if (section.items.length === 1) {
      setOpenSection(null);
      router.push(section.items[0].href);
      return;
    }
    setOpenSection((current) => (current?.title === section.title ? null : section));
  }

  function handleQuickAction(action: QuickAction) {
    setActionsOpen(false);
    if (action.action === "open-profile") openProfileModal();
    else if (action.href) router.push(action.href);
  }

  return (
    <>
      {(actionsOpen || openSection) && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          onClick={() => {
            setActionsOpen(false);
            setOpenSection(null);
          }}
          aria-hidden
        />
      )}

      <svg aria-hidden className="absolute size-0">
        <filter id="admin-quickactions-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 21 -10"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>

      <nav className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <div className="relative border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}>
            {sections.map((section) => {
              const Icon = SECTION_ICONS[section.title];
              const isActive = activeSectionTitle === section.title;
              const isOpen = openSection?.title === section.title;
              return (
                <div key={section.title} className="relative">
                  {/* Repere de l'arc : le centre de l'icone, d'ou les
                      bulles se deploient. */}
                  <div className="pointer-events-none absolute left-1/2 top-4 z-10 size-0">
                    {isOpen && (
                      <MobileSectionArc
                        items={section.items}
                        onClose={() => setOpenSection(null)}
                      />
                    )}
                  </div>
                  <button
                    onClick={() => handleSectionTap(section)}
                    aria-haspopup={section.items.length > 1 ? "menu" : undefined}
                    aria-expanded={section.items.length > 1 ? isOpen : undefined}
                    className={cn(
                      // min-h-14 : cible tactile d'au moins 44px, le py-2.5
                      // seul laissait des boutons trop bas pour le pouce.
                      "flex min-h-14 w-full flex-col items-center justify-center gap-1 px-0.5 py-2 transition-colors",
                      isActive || isOpen ? "text-primary" : "text-neutral-400"
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="w-full text-center text-[0.6rem] leading-none font-medium">
                      {SECTION_SHORT_LABELS[section.title]}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Anchor box, exactly MAIN_BUTTON_SIZE — every child (blobs, icons,
              main button) shares this single coordinate system, so the goo
              layer and the crisp icon layer always land on the same pixel. */}
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2"
            style={{ top: -(MAIN_BUTTON_SIZE - BAR_OVERLAP), width: MAIN_BUTTON_SIZE, height: MAIN_BUTTON_SIZE }}
          >
            <div className="pointer-events-none absolute inset-0 [filter:url(#admin-quickactions-goo)]">
              <span className="absolute inset-0 rounded-full bg-neutral-900" />
              <AnimatePresence>
                {actionsOpen &&
                  quickActions.map((action, index) => {
                    const { x, y } = arcOffset(index, quickActions.length);
                    return (
                      <motion.span
                        key={action.label}
                        initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                        animate={{ x, y, scale: 1, opacity: 1 }}
                        exit={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 360, damping: 24, delay: index * 0.03 }}
                        className="absolute rounded-full bg-neutral-900"
                        style={{ top: ACTION_REST_OFFSET, left: ACTION_REST_OFFSET, width: ACTION_BUTTON_SIZE, height: ACTION_BUTTON_SIZE }}
                      />
                    );
                  })}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {actionsOpen &&
                quickActions.map((action, index) => {
                  const Icon = action.icon;
                  const { x, y } = arcOffset(index, quickActions.length);
                  return (
                    <motion.button
                      key={action.label}
                      initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                      animate={{ x, y, scale: 1, opacity: 1 }}
                      exit={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 360, damping: 24, delay: index * 0.03 }}
                      onClick={() => handleQuickAction(action)}
                      className="pointer-events-auto absolute"
                      style={{ top: ACTION_REST_OFFSET, left: ACTION_REST_OFFSET, width: ACTION_BUTTON_SIZE, height: ACTION_BUTTON_SIZE }}
                    >
                      <span className="flex size-full items-center justify-center rounded-full">
                        <Icon className="size-5 text-white" />
                      </span>
                      <span className="absolute top-full left-1/2 mt-1.5 -translate-x-1/2 rounded-full bg-neutral-900 px-2 py-0.5 text-[0.65rem] font-medium whitespace-nowrap text-white shadow-md">
                        {action.label}
                      </span>
                    </motion.button>
                  );
                })}
            </AnimatePresence>

            <button
              onClick={() => {
                setOpenSection(null);
                setActionsOpen((value) => !value);
              }}
              aria-label="Actions rapides"
              aria-expanded={actionsOpen}
              className="pointer-events-auto relative z-10 flex size-full items-center justify-center rounded-full text-white shadow-lg shadow-black/25 transition-transform active:scale-95"
            >
              <motion.span
                animate={{ rotate: actionsOpen ? 45 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Plus className="size-6" />
              </motion.span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
