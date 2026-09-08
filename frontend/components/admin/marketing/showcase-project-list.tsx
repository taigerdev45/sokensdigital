"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Diamond, ExternalLink, LayoutGrid, List, Loader2, Plus, Trash2, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SectionIcon } from "@/components/dynamic-icon";
import { IconPicker } from "@/components/admin/marketing/icon-picker";
import { ProjectCardMedia } from "@/components/projects/card-media";
import {
  ImageUploadField,
  EditableInput,
  EditableTextarea,
  RemoveItemButton,
  AddItemButton,
} from "@/components/admin/marketing/page-section-editor";
import { ApiError } from "@/lib/api/client";
import { uploadVideo } from "@/lib/api/upload";
import {
  listShowcaseProjects,
  createShowcaseProject,
  updateShowcaseProject,
  deleteShowcaseProject,
  type ShowcaseProjectInput,
} from "@/lib/api/marketing";
import type { ShowcaseProject } from "@/lib/api/types";

const SCENE_VARIANTS = ["chart", "network", "map", "code", "security", "medical"] as const;

const EMPTY: ShowcaseProjectInput = {
  category: "",
  sector: "",
  type: "",
  featured: false,
  show_on_homepage: false,
  order: 0,
  is_active: true,
  status_tag: "",
  tag: "",
  title: "",
  description: "",
  visual_icon: "shield-check",
  project_url: "",
  video_src: "",
  images: [],
  scene_variants: [],
  client: "",
  technologies: [],
  timeline: "",
  lead_name: "",
  lead_role: "",
  challenge: "",
  stats: [],
  solution: "",
  solution_points: [],
};

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2) || "?";
}

function VideoUploadField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadVideo(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'upload.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2.5 py-1.5 text-xs text-muted-foreground ring-1 ring-white/10 transition-colors hover:bg-white/10"
      >
        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />}
        {value ? "Remplacer la vidéo" : "Ajouter une vidéo"}
      </button>
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Retirer la vidéo" className="text-muted-foreground transition-colors hover:text-destructive">
          <X className="size-3.5" />
        </button>
      )}
      <input ref={inputRef} type="file" accept=".mp4,.webm,.mov" onChange={handleFile} className="hidden" />
      {error && <p className="text-[0.6rem] text-destructive">{error}</p>}
    </div>
  );
}

export function ShowcaseProjectList() {
  const [projects, setProjects] = useState<ShowcaseProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShowcaseProject | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "card">("card");

  async function load() {
    try {
      const data = await listShowcaseProjects();
      setProjects(data.results);
    } catch {
      setError("Impossible de charger les projets.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(project: ShowcaseProject) {
    if (!confirm(`Supprimer "${project.title}" ?`)) return;
    try {
      await deleteShowcaseProject(project.id!);
      load();
    } catch {
      setError(`Impossible de supprimer "${project.title}".`);
    }
  }

  function edit(project: ShowcaseProject) {
    setEditing(project);
    setOpen(true);
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!projects) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Projets vitrine</h1>
          <p className="text-sm text-neutral-500">
            Les études de cas de la grille /projects et de la fiche détaillée /projects/[slug].
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-neutral-200 p-0.5">
            <button
              type="button"
              onClick={() => setView("card")}
              aria-label="Vue carte"
              aria-pressed={view === "card"}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-colors",
                view === "card" ? "bg-neutral-900 text-white" : "text-neutral-400 hover:text-neutral-700"
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="Vue liste"
              aria-pressed={view === "list"}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-colors",
                view === "list" ? "bg-neutral-900 text-white" : "text-neutral-400 hover:text-neutral-700"
              )}
            >
              <List className="size-4" />
            </button>
          </div>
          <Sheet
            open={open && !editing}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setEditing(null);
            }}
          >
            <SheetTrigger
              render={
                <Button className="gap-1.5 rounded-full px-4">
                  <Plus className="size-4" /> Nouveau projet
                </Button>
              }
            />
            <SheetContent title="Nouveau projet" className="max-w-3xl">
              <ShowcaseProjectForm
                onSaved={() => {
                  setOpen(false);
                  load();
                }}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 py-16 text-center text-sm text-neutral-400">
          Aucun projet pour l&apos;instant.
        </p>
      ) : view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group overflow-hidden rounded-2xl border-2 border-primary/25 bg-[#0a0e13] transition-colors hover:border-primary/70"
            >
              <button
                type="button"
                onClick={() => edit(project)}
                className="relative flex aspect-video w-full items-center justify-center overflow-hidden"
              >
                <ProjectCardMedia images={project.images} videoSrc={project.video_src} icon={project.visual_icon} />
                {project.featured && (
                  <span className="absolute top-3 right-3 z-10 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold tracking-[0.1em] text-primary-foreground uppercase">
                    Featured
                  </span>
                )}
                {!project.is_active && (
                  <span className="absolute top-3 left-3 z-10 rounded-full bg-black/60 px-3 py-1 text-[10px] font-semibold tracking-[0.1em] text-white/70 uppercase">
                    Inactif
                  </span>
                )}
              </button>
              <div className="p-4">
                <span className="text-xs text-muted-foreground">{project.client}</span>
                <h3 className="mt-1 text-base font-semibold text-foreground">{project.title}</h3>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                    {project.type}
                  </span>
                  {project.technologies.slice(0, 2).map((tech) => (
                    <span key={tech} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                      {tech}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <button type="button" onClick={() => edit(project)} className="text-xs font-medium text-primary hover:underline">
                    Modifier
                  </button>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/projects/${project.slug}`}
                      target="_blank"
                      aria-label="Voir le projet"
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="size-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(project)}
                      aria-label="Supprimer"
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Titre</th>
                <th className="px-4 py-3 font-medium">Secteur</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => edit(project)} className="text-neutral-900 hover:text-primary">
                      {project.title}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{project.sector}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        project.is_active
                          ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                          : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                      }
                    >
                      {project.is_active ? "Actif" : "Inactif"}
                    </span>
                    {project.show_on_homepage && (
                      <span className="ml-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                        Accueil
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/projects/${project.slug}`}
                        target="_blank"
                        aria-label="Voir le projet"
                        className="text-neutral-400 hover:text-primary"
                      >
                        <ExternalLink className="size-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(project)}
                        aria-label="Supprimer"
                        className="text-neutral-400 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit sheet — opened from either view via edit(project) */}
      <Sheet
        open={open && !!editing}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      >
        <SheetContent title="Modifier le projet" className="max-w-3xl">
          {editing && (
            <ShowcaseProjectForm
              project={editing}
              onSaved={() => {
                setOpen(false);
                setEditing(null);
                load();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function toInput(project: ShowcaseProject): ShowcaseProjectInput {
  return {
    category: project.category,
    sector: project.sector,
    type: project.type,
    featured: project.featured,
    show_on_homepage: project.show_on_homepage ?? false,
    order: project.order ?? 0,
    is_active: project.is_active ?? true,
    status_tag: project.status_tag,
    tag: project.tag,
    title: project.title,
    description: project.description,
    visual_icon: project.visual_icon,
    project_url: project.project_url,
    video_src: project.video_src,
    images: project.images,
    scene_variants: project.scene_variants,
    client: project.client,
    technologies: project.technologies,
    timeline: project.timeline,
    lead_name: project.lead_name,
    lead_role: project.lead_role,
    challenge: project.challenge,
    stats: project.stats,
    solution: project.solution,
    solution_points: project.solution_points,
  };
}

/** The Sheet's body — a faithful, directly-editable reproduction of the
 * public /projects/[slug] page (same dark card, same layout order: hero
 * banner -> gallery + specs -> Le Défi -> stats -> La Solution), same
 * pattern as PageSectionEditor's per-section previews. Admin-only concepts
 * with no public equivalent (featured/homepage/active/order, scene
 * variants) sit in a plain light toolbar outside the reproduction. */
function ShowcaseProjectForm({ project, onSaved }: { project?: ShowcaseProject; onSaved: () => void }) {
  const [form, setForm] = useState<ShowcaseProjectInput>(project ? toInput(project) : EMPTY);
  const [technologiesText, setTechnologiesText] = useState(project?.technologies.join(", ") ?? "");
  const [solutionPointsText, setSolutionPointsText] = useState(project?.solution_points.join("\n") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ShowcaseProjectInput>(key: K, value: ShowcaseProjectInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSceneVariant(variant: string) {
    const current = form.scene_variants ?? [];
    set("scene_variants", current.includes(variant) ? current.filter((v) => v !== variant) : [...current, variant]);
  }

  function addStat() {
    set("stats", [...(form.stats ?? []), { value: "", label: "" }]);
  }
  function updateStat(index: number, key: "value" | "label", value: string) {
    set("stats", (form.stats ?? []).map((s, i) => (i === index ? { ...s, [key]: value } : s)));
  }
  function removeStat(index: number) {
    set("stats", (form.stats ?? []).filter((_, i) => i !== index));
  }

  const technologies = technologiesText.split(",").map((t) => t.trim()).filter(Boolean);
  const solutionPoints = solutionPointsText.split("\n").map((p) => p.trim()).filter(Boolean);
  const hasCoverMedia = Boolean(form.video_src) || (form.images ?? []).length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const missing: string[] = [];
    if (!form.title.trim()) missing.push("Titre");
    if (!form.category.trim()) missing.push("Catégorie");
    if (!form.sector.trim()) missing.push("Secteur");
    if (!form.type.trim()) missing.push("Type");
    if (missing.length > 0) {
      setError(`Champs requis manquants : ${missing.join(", ")}.`);
      return;
    }

    const payload: ShowcaseProjectInput = {
      ...form,
      technologies,
      solution_points: solutionPoints,
    };

    setSaving(true);
    try {
      if (project) {
        await updateShowcaseProject(project.id!, payload);
      } else {
        await createShowcaseProject(payload);
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        const fieldErrors = Object.entries(err.body as Record<string, unknown>)
          .map(([field, msgs]) => `${field} : ${Array.isArray(msgs) ? msgs.join(" ") : String(msgs)}`)
          .join(" — ");
        setError(fieldErrors || "Impossible d'enregistrer le projet.");
      } else {
        setError("Impossible d'enregistrer le projet.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
          {error}
        </p>
      )}

      {/* Faithful reproduction of /projects/[slug], directly editable */}
      <div className="rounded-2xl bg-[#0a0e13] p-5 sm:p-8">
        {/* Admin-only meta — no public equivalent to reproduce */}
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
          <label className="flex items-center gap-1.5 text-sm text-foreground/80">
            Secteur
            <input
              value={form.sector}
              onChange={(e) => set("sector", e.target.value)}
              placeholder="Fintech"
              className="w-28 rounded-md bg-white/[0.06] px-2 py-1 text-sm text-foreground ring-1 ring-white/10 outline-none focus:ring-primary/50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-foreground/80">
            Type
            <input
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              placeholder="Web App"
              className="w-28 rounded-md bg-white/[0.06] px-2 py-1 text-sm text-foreground ring-1 ring-white/10 outline-none focus:ring-primary/50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-foreground/80">
            <input type="checkbox" checked={form.featured ?? false} onChange={(e) => set("featured", e.target.checked)} />
            Featured
          </label>
          <label className="flex items-center gap-1.5 text-sm text-foreground/80">
            <input type="checkbox" checked={form.show_on_homepage ?? false} onChange={(e) => set("show_on_homepage", e.target.checked)} />
            Sur l&apos;accueil
          </label>
          <label className="flex items-center gap-1.5 text-sm text-foreground/80">
            <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => set("is_active", e.target.checked)} />
            Actif
          </label>
          <label className="flex items-center gap-1.5 text-sm text-foreground/80">
            Ordre
            <input
              type="number"
              value={form.order ?? 0}
              onChange={(e) => set("order", Number(e.target.value))}
              className="w-14 rounded-md bg-white/[0.06] px-2 py-1 text-sm text-foreground ring-1 ring-white/10 outline-none focus:ring-primary/50"
            />
          </label>
          {project?.slug && (
            <Link
              href={`/projects/${project.slug}`}
              target="_blank"
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              Voir le projet <ExternalLink className="size-3" />
            </Link>
          )}
        </div>

        {/* Hero banner — mirrors what's uploaded below: video first, else the first image, else the plain icon */}
        <div className="relative flex aspect-[21/9] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_25%_30%,color-mix(in_oklch,var(--primary),transparent_75%),transparent_60%),linear-gradient(135deg,oklch(0.16_0.02_235),oklch(0.06_0.01_240))]">
          {!hasCoverMedia && (
            <div className="absolute inset-0 [background-image:linear-gradient(color-mix(in_oklch,var(--primary),transparent_92%)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklch,var(--primary),transparent_92%)_1px,transparent_1px)] [background-size:32px_32px]" />
          )}
          {form.video_src ? (
            <video src={form.video_src} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover" />
          ) : (form.images ?? []).length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={(form.images ?? [])[0]} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          {hasCoverMedia ? (
            <span className="absolute top-3 left-3 flex size-9 items-center justify-center rounded-lg bg-black/50 text-primary">
              <SectionIcon name={form.visual_icon || "shield-check"} className="size-4.5" />
            </span>
          ) : (
            <SectionIcon name={form.visual_icon || "shield-check"} className="relative size-16 text-primary/30 sm:size-24" />
          )}
          <div className="absolute right-3 bottom-3">
            <IconPicker value={form.visual_icon ?? ""} onChange={(v) => set("visual_icon", v)} />
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.1em] text-primary uppercase">
              <EditableInput value={form.category} onChange={(v) => set("category", v)} className="w-32 text-[11px] text-primary uppercase" placeholder="FINTECH" />
            </span>
            <span className="text-xs text-muted-foreground">
              • <EditableInput value={form.status_tag ?? ""} onChange={(v) => set("status_tag", v)} className="w-40 text-xs text-muted-foreground" placeholder="2024 · Déploiement" />
            </span>
          </div>
          <EditableInput
            value={form.title} onChange={(v) => set("title", v)}
            className="mt-3 block w-full text-3xl font-semibold tracking-tight text-foreground sm:text-4xl" placeholder="Titre du projet"
          />
          <EditableTextarea
            value={form.description ?? ""} onChange={(v) => set("description", v)}
            className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base" placeholder="Description" rows={2}
          />
          <div className="mt-5 max-w-md">
            <span className="text-[11px] font-semibold tracking-[0.1em] text-primary uppercase">
              Lien du bouton &quot;Visiter le projet&quot;
            </span>
            <EditableInput
              value={form.project_url ?? ""} onChange={(v) => set("project_url", v)}
              className="mt-1 block w-full text-sm text-foreground" placeholder="https://… (laisser vide pour masquer le bouton)"
            />
          </div>
        </div>

        {/* Gallery + specs */}
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
          <div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3">
              {(form.images ?? []).map((url, i) => (
                <div key={i} className="group relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => set("images", (form.images ?? []).filter((_, j) => j !== i))}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <ImageUploadField value="" onChange={(url) => set("images", [...(form.images ?? []), url])} />
            </div>
            <p className="mt-1.5 text-[0.65rem] text-muted-foreground/60">
              Plusieurs images s&apos;enchaînent automatiquement sur la fiche projet.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {SCENE_VARIANTS.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  onClick={() => toggleSceneVariant(variant)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wide",
                    (form.scene_variants ?? []).includes(variant) ? "bg-primary/15 text-primary" : "bg-white/[0.04] text-muted-foreground"
                  )}
                >
                  {variant}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[0.65rem] text-muted-foreground/60">
              Scènes animées utilisées tant qu&apos;aucune image/vidéo réelle n&apos;est ajoutée.
            </p>
            <div className="mt-3">
              <VideoUploadField value={form.video_src ?? ""} onChange={(url) => set("video_src", url)} />
              <p className="mt-1 text-[0.65rem] text-muted-foreground/60">
                La vidéo est prioritaire sur les images, dans la couverture ci-dessus comme sur le carrousel public.
              </p>
            </div>
          </div>

          <aside className="h-fit rounded-2xl border border-white/10 bg-card/60 p-5">
            <h3 className="text-base font-semibold text-foreground">Technical Specs</h3>

            <div className="mt-5">
              <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Client</span>
              <EditableInput value={form.client ?? ""} onChange={(v) => set("client", v)} className="mt-1 block w-full text-sm font-medium text-foreground" placeholder="Nom du client" />
            </div>

            <div className="mt-4">
              <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Technologies</span>
              <input
                value={technologiesText}
                onChange={(e) => setTechnologiesText(e.target.value)}
                className="mt-1.5 w-full rounded-md bg-white/[0.06] px-1.5 py-1 text-xs text-foreground outline-none ring-1 ring-white/10 focus:bg-white/10 focus:ring-primary/50"
                placeholder="Rust, Kubernetes, gRPC"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {technologies.map((tech) => (
                  <span key={tech} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-foreground">
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Calendrier</span>
              <EditableInput value={form.timeline ?? ""} onChange={(v) => set("timeline", v)} className="mt-1 block w-full text-sm text-foreground" placeholder="6 Mois" />
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Chef de Projet</span>
              <div className="mt-2 flex items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {initials(form.lead_name ?? "")}
                </span>
                <span className="flex-1">
                  <EditableInput value={form.lead_name ?? ""} onChange={(v) => set("lead_name", v)} className="block w-full text-sm font-medium text-foreground" placeholder="Nom" />
                  <EditableInput value={form.lead_role ?? ""} onChange={(v) => set("lead_role", v)} className="mt-0.5 block w-full text-xs text-muted-foreground" placeholder="Rôle" />
                </span>
              </div>
            </div>
          </aside>
        </div>

        {/* Le Défi */}
        <div className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Le Défi</h2>
          <EditableTextarea
            value={form.challenge ?? ""} onChange={(v) => set("challenge", v)}
            className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base" placeholder="Le contexte et le problème à résoudre…" rows={3}
          />
        </div>

        {/* Stats */}
        <div className="mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(form.stats ?? []).map((stat, i) => (
              <div key={i} className="group relative rounded-2xl border border-white/10 bg-card/60 p-6 text-center">
                <RemoveItemButton onClick={() => removeStat(i)} />
                <EditableInput value={stat.value} onChange={(v) => updateStat(i, "value", v)} className="mx-auto block w-24 text-center text-3xl font-bold text-primary" placeholder="+40%" />
                <EditableInput value={stat.label} onChange={(v) => updateStat(i, "label", v)} className="mx-auto mt-1 block w-full text-center text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase" placeholder="Label" />
              </div>
            ))}
            <AddItemButton label="Ajouter une statistique" onClick={addStat} />
          </div>
        </div>

        {/* La Solution */}
        <div className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">La Solution</h2>
          <EditableTextarea
            value={form.solution ?? ""} onChange={(v) => set("solution", v)}
            className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base" placeholder="L'approche mise en œuvre…" rows={3}
          />
          <div className="mt-5">
            <textarea
              value={solutionPointsText}
              onChange={(e) => setSolutionPointsText(e.target.value)}
              rows={4}
              className="w-full max-w-3xl resize-none rounded-md bg-white/[0.06] px-2 py-1.5 text-sm text-muted-foreground outline-none ring-1 ring-white/10 focus:bg-white/10 focus:ring-primary/50"
              placeholder={"Un point clé par ligne…"}
            />
            <ul className="mt-4 space-y-3">
              {solutionPoints.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Diamond className="size-2.5 fill-primary" />
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : project ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </form>
  );
}
