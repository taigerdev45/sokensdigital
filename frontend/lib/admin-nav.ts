import {
  LayoutDashboard,
  Users,
  Building2,
  UserCog,
  ScrollText,
  Target,
  Newspaper,
  CalendarClock,
  FileText,
  Clock,
  Banknote,
  FolderKanban,
  MessageSquare,
  Lock,
  BookOpen,
  Receipt,
  Landmark,
  Percent,
  PieChart,
  Settings,
  Contact2,
  ClipboardList,
  ShoppingCart,
  Wallet,
  ArrowDownToLine,
  Wrench,
  Headset,
  Library,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Matches a key in backend/core/constants.py's MODULES and
   * lib/admin/permission-modules.ts's PERMISSION_MODULES — used to filter
   * this item out of the nav (and block direct URL access) for a role
   * whose Role.permissions doesn't include it. */
  moduleKey: string;
  /** Libellé court, pour l'arc de navigation mobile : les bulles y sont
   * disposées en cercle autour de l'icône du département, et un nom comme
   * « Rapprochement bancaire » y recouvre ses voisins. Facultatif — sans
   * lui, `label` est utilisé tel quel. */
  shortLabel?: string;
  /** Optional sub-grouping within a section — rendered as a small
   * secondary heading in the sidebar (e.g. "RH" items inside the
   * "Administration" section). Purely cosmetic, doesn't affect
   * findNavMatch/filterSectionsByAccess. */
  group?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Single source of truth for the sidebar AND the header's breadcrumb/quick
 * search — both need to know "which section + label does this URL belong
 * to", so it lives here instead of being duplicated. */
export const ADMIN_SECTIONS: NavSection[] = [
  {
    title: "Général",
    items: [
      { label: "Tableau de bord", shortLabel: "Dashboard", href: "/admin", icon: LayoutDashboard, moduleKey: "dashboard" },
      { label: "Messagerie", href: "/admin/messagerie", icon: MessageSquare, moduleKey: "messagerie" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Clients", href: "/admin/rh/clients", icon: Contact2, moduleKey: "clients" },
      { label: "Utilisateurs & Rôles", shortLabel: "Utilisateurs", href: "/admin/rh/utilisateurs", icon: UserCog, moduleKey: "utilisateurs" },
      { label: "Audit Log", href: "/admin/rh/audit-log", icon: ScrollText, moduleKey: "audit-log" },
      // RH — sous-interface d'Administration, regroupée visuellement dans
      // la sidebar (voir AdminSidebar) plutôt qu'être son propre
      // département de premier niveau.
      { label: "Tableau de bord", shortLabel: "Dashboard", href: "/admin/rh/dashboard", icon: LayoutDashboard, moduleKey: "rh-dashboard", group: "RH" },
      { label: "Employés", href: "/admin/rh", icon: Users, moduleKey: "employes", group: "RH" },
      { label: "Départements", href: "/admin/rh/departements", icon: Building2, moduleKey: "departements", group: "RH" },
    ],
  },
  {
    title: "Marketing & Commercial",
    items: [
      { label: "Dashboard", href: "/admin/marketing/dashboard", icon: LayoutDashboard, moduleKey: "marketing-dashboard" },
      { label: "Gestion de contenu", shortLabel: "Contenu", href: "/admin/marketing/blog", icon: Newspaper, moduleKey: "contenu" },
      { label: "Plan Éditorial", shortLabel: "Éditorial", href: "/admin/marketing/plan-editorial", icon: CalendarClock, moduleKey: "plan-editorial" },
      { label: "Tunnel commercial", shortLabel: "Tunnel", href: "/admin/marketing/leads", icon: Target, moduleKey: "leads" },
      { label: "Devis", href: "/admin/marketing/devis", icon: FileText, moduleKey: "devis" },
      { label: "Cahier des charges", shortLabel: "Cahier", href: "/admin/marketing/cahier-des-charges", icon: ClipboardList, moduleKey: "cahier-des-charges" },
    ],
  },
  {
    title: "Technique",
    items: [
      { label: "Gestion de projet", shortLabel: "Projets", href: "/admin/technique/projets", icon: FolderKanban, moduleKey: "projets" },
      { label: "Timesheets", href: "/admin/technique/timesheets", icon: Clock, moduleKey: "timesheets" },
      { label: "Maintenance", href: "/admin/technique/maintenance", icon: Wrench, moduleKey: "maintenance" },
      { label: "Décaissements", href: "/admin/technique/decaissements", icon: Banknote, moduleKey: "decaissements" },
      { label: "Devis", href: "/admin/technique/devis", icon: FileText, moduleKey: "devis" },
      { label: "Cahier des charges", shortLabel: "Cahier", href: "/admin/technique/cahier-des-charges", icon: ClipboardList, moduleKey: "cahier-des-charges" },
    ],
  },
  {
    title: "Finance & Comptabilité",
    items: [
      { label: "Analytique", href: "/admin/finance/dashboard", icon: PieChart, moduleKey: "finance-dashboard" },
      { label: "Clôture comptable", shortLabel: "Clôture", href: "/admin/finance/cloture", icon: Lock, moduleKey: "cloture" },
      { label: "Grand Livre", href: "/admin/finance/grand-livre", icon: BookOpen, moduleKey: "grand-livre" },
      { label: "Facturation", href: "/admin/finance/facturation", icon: Receipt, moduleKey: "facturation" },
      { label: "Encaissements", href: "/admin/finance/encaissements", icon: ArrowDownToLine, moduleKey: "encaissements" },
      { label: "Rapprochement bancaire", shortLabel: "Rappro.", href: "/admin/finance/rapprochement", icon: Landmark, moduleKey: "rapprochement" },
      { label: "Fiscalité (TVA)", shortLabel: "TVA", href: "/admin/finance/tva", icon: Percent, moduleKey: "tva" },
      { label: "Opérations d'achats", shortLabel: "Achats", href: "/admin/finance/achats", icon: ShoppingCart, moduleKey: "achats" },
      { label: "Trésorerie", href: "/admin/finance/tresorerie", icon: Wallet, moduleKey: "tresorerie" },
    ],
  },
  {
    title: "Support Client",
    items: [
      { label: "Tickets", href: "/admin/support/tickets", icon: Headset, moduleKey: "tickets" },
      { label: "Base de connaissances", shortLabel: "Connaissances", href: "/admin/support/base-connaissances", icon: Library, moduleKey: "base-connaissances" },
    ],
  },
  {
    title: "Paramètres",
    items: [
      { label: "Réseaux sociaux", href: "/admin/parametres/reseaux-sociaux", icon: Settings, moduleKey: "parametres" },
    ],
  },
];

/** One representative icon per section — used by the header's department
 * switcher and the mobile bottom nav, which both need a single glyph per
 * department rather than the per-item icons above. */
export const SECTION_ICONS: Record<string, LucideIcon> = {
  "Général": LayoutDashboard,
  "Administration": Users,
  "Marketing & Commercial": Target,
  "Technique": FolderKanban,
  "Finance & Comptabilité": PieChart,
  "Support Client": Headset,
  "Paramètres": Settings,
};

/** Short, single-word labels for the mobile bottom nav — the full section
 * titles ("Administration", "Finance & Comptabilité"...) don't fit
 * under a 5-column icon row without truncating illegibly. */
export const SECTION_SHORT_LABELS: Record<string, string> = {
  "Général": "Accueil",
  "Administration": "Admin",
  "Marketing & Commercial": "Marketing",
  "Technique": "Technique",
  "Finance & Comptabilité": "Finance",
  "Support Client": "Support",
  "Paramètres": "Réglages",
};

/** Longest-prefix match — /admin/rh/departements should resolve to the
 * "Départements" item, not fall through to a shorter, unrelated prefix. */
export function findNavMatch(
  pathname: string,
  sections: NavSection[] = ADMIN_SECTIONS
): { section: NavSection; item: NavItem } | null {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (matches && (!best || item.href.length > best.item.href.length)) {
        best = { section, item };
      }
    }
  }
  return best;
}

/** ADMIN_SECTIONS narrowed to what the current role can see — items whose
 * moduleKey fails canAccess are dropped, and any section left with zero
 * items is dropped entirely (no empty department header/rail icon). */
export function filterSectionsByAccess(
  sections: NavSection[],
  canAccessModule: (moduleKey: string) => boolean
): NavSection[] {
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => canAccessModule(item.moduleKey)) }))
    .filter((section) => section.items.length > 0);
}
