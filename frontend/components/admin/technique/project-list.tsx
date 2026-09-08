"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  LayoutGrid,
  List as ListIcon,
  ListChecks,
  Loader2,
  Lock,
  MoreVertical,
  PauseCircle,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  toggleProjectPin,
} from "@/lib/api/projects";
import type { Project, ProjectPriority, ProjectStatus } from "@/lib/api/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  EN_COURS: "En cours",
  EN_PAUSE: "En pause",
  TERMINE: "Terminé",
  ANNULE: "Annulé",
};

const STATUS_COLORS: Record<ProjectStatus, string> = {
  EN_COURS: "bg-indigo-100 text-indigo-700",
  EN_PAUSE: "bg-neutral-100 text-neutral-500",
  TERMINE: "bg-emerald-100 text-emerald-700",
  ANNULE: "bg-rose-100 text-rose-600",
};

const PRIORITY_LABELS: Record<ProjectPriority, string> = {
  BASSE: "Basse",
  MOYENNE: "Moyenne",
  HAUTE: "Haute",
};

const PRIORITY_COLORS: Record<ProjectPriority, string> = {
  BASSE: "bg-sky-100 text-sky-700",
  MOYENNE: "bg-violet-100 text-violet-700",
  HAUTE: "bg-orange-100 text-orange-700",
};

// Free-text category → deterministic pastel pill so each distinct category
// reads as its own color, without needing a fixed enum on the backend.
const CATEGORY_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-teal-100 text-teal-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
];

// Purely cosmetic per-card icon — no backend field, just a stable pick per
// project id so the same project always shows the same icon.
const CARD_ICONS = ["🐢", "🔥", "🌍", "✨", "🚀", "🎯", "🎨", "📦", "🛠️", "🌟", "🧭", "🪁"];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickCardIcon(id: string) {
  return CARD_ICONS[hashString(id) % CARD_ICONS.length];
}

function categoryColor(category: string) {
  return CATEGORY_COLORS[hashString(category) % CATEGORY_COLORS.length];
}

type TabKey = "all" | "pinned" | "in_progress" | "completed" | "paused" | "archived";

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Looping muted video behind the whole module — spans the full height of
 * the content column (grows with it, via `inset-0` on a `relative isolate`
 * parent) rather than just the header band, so it reads as the page's
 * background rather than a strip. Cards sit on their own opaque white
 * background so they stay perfectly legible on top of it regardless; the
 * title/tabs row gets a light scrim just for contrast. Paused under
 * prefers-reduced-motion instead of using CSS (no CSS-only way to stop a
 * <video>'s own playback). */
function AmbientBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      videoRef.current?.pause();
    }
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="size-full object-cover opacity-70"
      >
        <source src="/assets/projects-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/20 to-white/40" />
    </div>
  );
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"card" | "list">("card");
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Set<ProjectPriority>>(new Set());

  async function load(search?: string) {
    try {
      const data = await listProjects(search ? { search } : undefined);
      setProjects(data.results);
    } catch {
      setError("Impossible de charger les projets.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const trimmed = search.trim();
    const handle = setTimeout(() => load(trimmed || undefined), 300);
    return () => clearTimeout(handle);
  }, [search]);

  async function handleTogglePin(project: Project) {
    setProjects((prev) =>
      prev ? prev.map((p) => (p.id === project.id ? { ...p, is_pinned: !p.is_pinned } : p)) : prev
    );
    try {
      await toggleProjectPin(project.id);
    } catch {
      setProjects((prev) =>
        prev ? prev.map((p) => (p.id === project.id ? { ...p, is_pinned: project.is_pinned } : p)) : prev
      );
    }
  }

  async function handleToggleArchive(project: Project) {
    const next = !project.is_archived;
    setProjects((prev) =>
      prev ? prev.map((p) => (p.id === project.id ? { ...p, is_archived: next } : p)) : prev
    );
    try {
      await updateProject(project.id, { is_archived: next });
    } catch {
      setProjects((prev) =>
        prev ? prev.map((p) => (p.id === project.id ? { ...p, is_archived: !next } : p)) : prev
      );
    }
  }

  async function handleToggleLock(project: Project) {
    const next = !project.is_locked;
    setProjects((prev) =>
      prev ? prev.map((p) => (p.id === project.id ? { ...p, is_locked: next } : p)) : prev
    );
    try {
      await updateProject(project.id, { is_locked: next });
    } catch {
      setProjects((prev) =>
        prev ? prev.map((p) => (p.id === project.id ? { ...p, is_locked: !next } : p)) : prev
      );
    }
  }

  async function handleDelete(project: Project) {
    if (!confirm(`Supprimer "${project.name}" ?`)) return;
    setProjects((prev) => (prev ? prev.filter((p) => p.id !== project.id) : prev));
    try {
      await deleteProject(project.id);
    } catch {
      setError("Impossible de supprimer le projet.");
      load();
    }
  }

  const counts = useMemo(() => {
    const list = projects ?? [];
    const active = list.filter((p) => !p.is_archived);
    return {
      all: active.length,
      pinned: active.filter((p) => p.is_pinned).length,
      in_progress: active.filter((p) => p.status === "EN_COURS").length,
      completed: active.filter((p) => p.status === "TERMINE").length,
      paused: active.filter((p) => p.status === "EN_PAUSE").length,
      archived: list.filter((p) => p.is_archived).length,
    };
  }, [projects]);

  const visibleProjects = useMemo(() => {
    let list = projects ?? [];
    switch (tab) {
      case "pinned":
        list = list.filter((p) => !p.is_archived && p.is_pinned);
        break;
      case "in_progress":
        list = list.filter((p) => !p.is_archived && p.status === "EN_COURS");
        break;
      case "completed":
        list = list.filter((p) => !p.is_archived && p.status === "TERMINE");
        break;
      case "paused":
        list = list.filter((p) => !p.is_archived && p.status === "EN_PAUSE");
        break;
      case "archived":
        list = list.filter((p) => p.is_archived);
        break;
      default:
        list = list.filter((p) => !p.is_archived);
    }
    if (priorityFilter.size > 0) {
      list = list.filter((p) => priorityFilter.has(p.priority));
    }
    return list;
  }, [projects, tab, priorityFilter]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "Tous", icon: <ListChecks className="size-3.5" /> },
    { key: "pinned", label: "Épinglés", icon: <Pin className="size-3.5" /> },
    { key: "in_progress", label: "En cours", icon: <CircleDot className="size-3.5" /> },
    { key: "completed", label: "Terminés", icon: <CheckCircle2 className="size-3.5" /> },
    { key: "paused", label: "En pause", icon: <PauseCircle className="size-3.5" /> },
    { key: "archived", label: "Archivés", icon: <Archive className="size-3.5" /> },
  ];

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!projects) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="relative isolate -mx-6 -mt-8 min-h-[calc(100dvh-4rem)] lg:-mx-10">
      <AmbientBackground />

      <div className="px-6 pt-8 lg:px-10">
      <div className="mb-5 rounded-2xl bg-white/75 p-4 backdrop-blur-md">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Projets</h1>
            <p className="text-sm text-neutral-500">Projets que tu diriges ou dont tu es membre.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-neutral-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === "list" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                <ListIcon className="size-3.5" /> Liste
              </button>
              <button
                type="button"
                onClick={() => setView("card")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === "card" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
                }`}
              >
                <LayoutGrid className="size-3.5" /> Cartes
              </button>
            </div>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                render={
                  <Button data-tour="module-technique-projets" className="gap-1.5 rounded-full px-4">
                    <Plus className="size-4" /> Nouveau projet
                  </Button>
                }
              />
              <SheetContent title="Nouveau projet">
                <NewProjectForm onSaved={() => { setOpen(false); load(); }} />
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key ? "bg-primary/10 text-primary" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                {t.icon}
                {t.label}
                <span className={tab === t.key ? "text-primary/70" : "text-neutral-400"}>({counts[t.key]})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2 transition-colors focus-within:border-primary/40 focus-within:bg-white">
              <Search className="size-4 shrink-0 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un projet…"
                className="w-44 min-w-0 bg-transparent text-sm text-neutral-700 outline-none placeholder:text-neutral-400"
              />
            </div>
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="outline" className="gap-1.5 rounded-full px-4">
                    <SlidersHorizontal className="size-3.5" /> Filtre
                    {priorityFilter.size > 0 && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        {priorityFilter.size}
                      </span>
                    )}
                  </Button>
                }
              />
              <PopoverContent className="w-48 p-3">
                <p className="mb-2 text-xs font-medium text-neutral-500">Priorité</p>
                <div className="space-y-1.5">
                  {(Object.keys(PRIORITY_LABELS) as ProjectPriority[]).map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={priorityFilter.has(p)}
                        onChange={(e) => {
                          setPriorityFilter((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p);
                            else next.delete(p);
                            return next;
                          });
                        }}
                      />
                      {PRIORITY_LABELS[p]}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {visibleProjects.length === 0 && (
        <p className="text-sm text-neutral-400">Aucun projet dans cette vue.</p>
      )}

      {view === "card" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onTogglePin={handleTogglePin}
              onToggleArchive={handleToggleArchive}
              onToggleLock={handleToggleLock}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs text-neutral-400">
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Priorité</th>
                <th className="px-4 py-3 font-medium">Tâches</th>
                <th className="px-4 py-3 font-medium">Équipe</th>
                <th className="px-4 py-3 font-medium">Échéance</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((project) => (
                <tr key={project.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/technique/projets/${project.id}`} className="flex items-center gap-1.5 font-medium text-neutral-900 hover:text-primary">
                      <span>{pickCardIcon(project.id)}</span>
                      {project.name}
                      {project.is_locked && <Lock className="size-3.5 text-neutral-400" />}
                      {!project.is_locked && project.is_pinned && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[project.status]}`}>
                      {STATUS_LABELS[project.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_COLORS[project.priority]}`}>
                      {PRIORITY_LABELS[project.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {project.tasks_done}/{project.tasks_total}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{project.members.length}</td>
                  <td className="px-4 py-3 text-neutral-500">{formatDate(project.end_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        danger ? "text-destructive hover:bg-destructive/10" : "text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function ProjectCard({
  project,
  onTogglePin,
  onToggleArchive,
  onToggleLock,
  onDelete,
}: {
  project: Project;
  onTogglePin: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
  onToggleLock: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const progress = project.tasks_total > 0 ? Math.round((project.tasks_done / project.tasks_total) * 100) : 0;
  const avatarUsers = [
    ...(project.lead_project_manager ? [project.lead_project_manager] : []),
    ...project.members.map((m) => m.user),
  ].filter((u, index, arr) => arr.findIndex((x) => x.id === u.id) === index);
  const shown = avatarUsers.slice(0, 3);
  const overflow = avatarUsers.length - shown.length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-primary/40">
      <div className="mb-3 flex items-center justify-between">
        <Link href={`/admin/technique/projets/${project.id}`} className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-neutral-900 hover:text-primary">
          <span className="shrink-0">{pickCardIcon(project.id)}</span>
          <span className="truncate">{project.name}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1 pl-2">
          {project.is_locked && <Lock className="size-3.5 text-neutral-400" />}
          {!project.is_locked && project.is_pinned && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onTogglePin(project);
              }}
              aria-label="Désépingler"
            >
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
            </button>
          )}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <button
                  type="button"
                  onClick={(e) => e.preventDefault()}
                  aria-label="Actions du projet"
                  className="rounded-full p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <MoreVertical className="size-3.5" />
                </button>
              }
            />
            <SheetContent title={project.name}>
              <div className="space-y-1">
                <ActionRow
                  icon={Pin}
                  label={project.is_pinned ? "Désépingler" : "Épingler"}
                  onClick={() => { onTogglePin(project); setMenuOpen(false); }}
                />
                <ActionRow
                  icon={project.is_locked ? Unlock : Lock}
                  label={project.is_locked ? "Déverrouiller" : "Verrouiller"}
                  onClick={() => { onToggleLock(project); setMenuOpen(false); }}
                />
                <ActionRow
                  icon={Archive}
                  label={project.is_archived ? "Désarchiver" : "Archiver"}
                  onClick={() => { onToggleArchive(project); setMenuOpen(false); }}
                />
                <ActionRow
                  icon={Trash2}
                  label="Supprimer"
                  danger
                  onClick={() => { setMenuOpen(false); onDelete(project); }}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-400">
        <span className="flex items-center gap-1">
          <ListChecks className="size-3.5" />
          {project.tasks_total > 0 ? `${project.tasks_done}/${project.tasks_total}` : "Aucune tâche"}
        </span>
        {project.tasks_total > 0 && <span>({progress}% terminé)</span>}
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-400">Assigné à</p>
          <div className="mt-1 flex -space-x-1.5">
            {shown.map((user) => (
              <span
                key={user.id}
                title={`${user.first_name} ${user.last_name}`}
                className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-primary/10 text-[10px] font-semibold text-primary"
              >
                {initials(user.first_name, user.last_name)}
              </span>
            ))}
            {overflow > 0 && (
              <span className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-[10px] font-semibold text-neutral-500">
                +{overflow}
              </span>
            )}
            {avatarUsers.length === 0 && <span className="text-xs text-neutral-300">—</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-neutral-400">Échéance</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-neutral-600">
            <CalendarDays className="size-3.5 text-neutral-400" />
            {formatDate(project.end_date)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${PRIORITY_COLORS[project.priority]}`}>
          {PRIORITY_LABELS[project.priority]}
        </span>
        {project.category && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${categoryColor(project.category)}`}>
            {project.category}
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLORS[project.status]}`}>
          {STATUS_LABELS[project.status]}
        </span>
      </div>
    </div>
  );
}

function NewProjectForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [priority, setPriority] = useState<ProjectPriority>("MOYENNE");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createProject({
        name,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        budget: budget || undefined,
        priority,
        category: category || undefined,
      });
      onSaved();
    } catch {
      setError("Impossible de créer le projet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <label className="block">
        <span className={labelClass}>Nom</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className={labelClass}>Priorité</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as ProjectPriority)} className={inputClass}>
            {(Object.keys(PRIORITY_LABELS) as ProjectPriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Catégorie</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
            placeholder="Site web, App mobile…"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className={labelClass}>Date de début</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Date de fin</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Budget</span>
        <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} />
      </label>
      <p className="text-xs text-neutral-400">Tu deviens automatiquement le chef de ce projet.</p>
      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
        </Button>
      </div>
    </form>
  );
}
