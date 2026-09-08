"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Diamond,
  ImagePlus,
  Loader2,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listPageSections, listShowcaseProjects, updatePageSection, type PageSectionInput } from "@/lib/api/marketing";
import { uploadImage } from "@/lib/api/upload";
import type { PageSection, SectionKey, ShowcaseProject, SitePage } from "@/lib/api/types";
import { IconPicker, SectionIcon } from "@/components/admin/marketing/icon-picker";
import { TabletMockup } from "@/components/projects/tablet-mockup";
import { LaptopMockup } from "@/components/projects/laptop-mockup";
import { ProjectCardMedia } from "@/components/projects/card-media";
import { PROJECTS } from "@/lib/projects/projects";

function initials(name: string) {
  return name.replace("Dr. ", "").split(" ").map((p) => p[0]).join("").slice(0, 2);
}

const SECTION_LABELS: Record<SectionKey, string> = {
  hero: "Hero",
  services: "Services",
  recent_projects: "Projets récents",
  testimonials: "Témoignages",
  team: "Équipe",
  partner_logos: "Partenaires",
  blog_insights: "Aperçu blog",
  cta: "CTA final",
  expertise_hero: "Hero",
  strategic_advantages: "Avantages stratégiques",
  process_timeline: "Processus",
  tech_stack: "Stack technique",
  featured_case_study: "Étude de cas vedette",
  tracking_hero: "Hero",
  tracking_features: "Fonctionnalités mises en avant",
  start_project_objectifs: "Objectif du projet",
  start_project_solutions: "Type de solution",
  start_project_delais: "Délai souhaité",
  start_project_canaux: "Canal de communication",
};

const SECTION_NOTES: Partial<Record<SectionKey, string>> = {
  recent_projects: "Le carrousel lui-même reste géré par le module Projets vitrine (à venir).",
  blog_insights: "Les articles affichés viennent automatiquement du Blog.",
  tracking_hero: "Le formulaire de recherche de référence n'est pas éditable ici.",
};

const PAGE_SECTION_ORDER: Record<SitePage, SectionKey[]> = {
  ACCUEIL: ["hero", "services", "recent_projects", "testimonials", "team", "partner_logos", "blog_insights", "cta"],
  EXPERTISE: ["expertise_hero", "strategic_advantages", "process_timeline", "tech_stack", "featured_case_study"],
  SUIVI_PROJET: ["tracking_hero", "tracking_features"],
  DEMARRER_PROJET: ["start_project_objectifs", "start_project_solutions", "start_project_delais", "start_project_canaux"],
};

const PAGE_DESCRIPTIONS: Record<SitePage, string> = {
  ACCUEIL: "page d'accueil",
  EXPERTISE: "page Expertise",
  SUIVI_PROJET: "page Suivi de projet",
  DEMARRER_PROJET: "page Démarrer un projet",
};

export function PageSectionEditor({ page }: { page: SitePage }) {
  const [sections, setSections] = useState<PageSection[] | null>(null);
  const [projects, setProjects] = useState<ShowcaseProject[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await listPageSections(page);
      setSections(data);
    } catch {
      setError("Impossible de charger les sections de la page.");
    }
  }

  useEffect(() => {
    setSections(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    // Only featured_case_study (Expertise) needs this, but it's cheap and
    // avoids threading a page-specific fetch through the section map.
    listShowcaseProjects().then((data) => setProjects(data.results)).catch(() => {});
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!sections) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-500">
        Reproduction fidèle de la {PAGE_DESCRIPTIONS[page]} publique, section par section, dans l&apos;ordre réel d&apos;affichage —
        mêmes couleurs, mêmes icônes. Clique sur « Modifier » : la carte devient directement éditable.
      </p>

      {PAGE_SECTION_ORDER[page].map((key) => {
        const section = sections.find((s) => s.section_key === key);
        if (!section) return null;
        return <SectionCard key={key} section={section} onSaved={load} projects={projects} />;
      })}
    </div>
  );
}

/* ---------- inline-editable primitives ---------- */

export function EditableInput({
  value, onChange, className, placeholder,
}: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "rounded-md bg-white/[0.06] px-1.5 py-0.5 outline-none ring-1 ring-white/10 transition-colors",
        "placeholder:text-muted-foreground/40 focus:bg-white/10 focus:ring-primary/50",
        className
      )}
    />
  );
}

export function EditableTextarea({
  value, onChange, className, placeholder, rows = 2,
}: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        "w-full resize-none rounded-md bg-white/[0.06] px-1.5 py-1 outline-none ring-1 ring-white/10 transition-colors",
        "placeholder:text-muted-foreground/40 focus:bg-white/10 focus:ring-primary/50",
        className
      )}
    />
  );
}

export function ImageUploadField({
  value, onChange, shape = "square",
}: { value: string; onChange: (url: string) => void; shape?: "square" | "circle" }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'upload.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Changer l'image"
        className={cn(
          "group relative flex size-12 shrink-0 items-center justify-center overflow-hidden border border-dashed border-white/20 bg-white/5 text-muted-foreground transition-colors hover:border-primary/40",
          shape === "circle" ? "rounded-full" : "rounded-lg"
        )}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-4" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <ImagePlus className="size-3.5 text-white" />
        </span>
      </button>
      <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.gif" onChange={handleFile} className="hidden" />
      {error && <p className="max-w-20 text-center text-[0.6rem] leading-tight text-destructive">{error}</p>}
    </div>
  );
}

/* ---------- card shell ---------- */

function SectionCard({ section, onSaved, projects }: { section: PageSection; onSaved: () => void; projects: ShowcaseProject[] }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PageSectionInput>(() => toForm(section));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setForm(toForm(section));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updatePageSection(section.id, form);
      setEditing(false);
      onSaved();
    } catch {
      setError("Impossible d'enregistrer les modifications.");
    } finally {
      setSaving(false);
    }
  }

  const items = form.items ?? [];
  function updateItem(index: number, key: string, value: string) {
    setForm((prev) => {
      const current = prev.items ?? [];
      // Pad with blank entries if writing past the end — needed for
      // fixed single-item "panels" (e.g. expertise_hero) that may not
      // have a seeded row yet.
      const padded = current.length > index ? current : [...current, ...Array(index + 1 - current.length).fill({})];
      return { ...prev, items: padded.map((it, i) => (i === index ? { ...it, [key]: value } : it)) };
    });
  }
  function addItem(blank: Record<string, string>) {
    setForm((prev) => ({ ...prev, items: [...(prev.items ?? []), blank] }));
  }
  function removeItem(index: number) {
    setForm((prev) => ({ ...prev, items: (prev.items ?? []).filter((_, i) => i !== index) }));
  }

  const data = editing ? form : toForm(section);
  const note = SECTION_NOTES[section.section_key];

  return (
    <div className={cn(
      "overflow-hidden rounded-2xl border bg-background shadow-sm transition-colors",
      editing ? "border-primary/40" : "border-white/10"
    )}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {SECTION_LABELS[section.section_key]}
          </span>
          {!editing && !section.is_active && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] text-muted-foreground">Masquée</span>
          )}
          {editing && (
            <label className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
              <input
                type="checkbox"
                checked={form.is_active ?? true}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              Visible sur le site
            </label>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={cancel}
              className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs text-foreground hover:bg-white/20"
            >
              <X className="size-3" /> Annuler
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-neutral-700 hover:bg-white/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Enregistrer
            </button>
          </div>
        ) : (
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs text-neutral-700 hover:bg-white/90"
          >
            Modifier
          </button>
        )}
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      <div className="p-6 sm:p-8">
        <SectionBody
          sectionKey={section.section_key}
          data={data}
          editing={editing}
          setForm={setForm}
          items={items}
          updateItem={updateItem}
          addItem={addItem}
          removeItem={removeItem}
          projects={projects}
        />
        {note && (
          <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground/70 italic">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" /> {note}
          </p>
        )}
      </div>
    </div>
  );
}

function toForm(section: PageSection): PageSectionInput {
  return {
    is_active: section.is_active,
    kicker: section.kicker,
    title: section.title,
    subtitle: section.subtitle,
    cta_label: section.cta_label,
    cta_link: section.cta_link,
    cta_secondary_label: section.cta_secondary_label,
    cta_secondary_link: section.cta_secondary_link,
    items: section.items,
  };
}

/* ---------- per-section body (read + inline-edit in one) ---------- */

interface BodyProps {
  sectionKey: SectionKey;
  data: PageSectionInput;
  editing: boolean;
  setForm: React.Dispatch<React.SetStateAction<PageSectionInput>>;
  items: Record<string, unknown>[];
  updateItem: (index: number, key: string, value: string) => void;
  addItem: (blank: Record<string, string>) => void;
  removeItem: (index: number) => void;
  projects: ShowcaseProject[];
}

function field(data: PageSectionInput, key: keyof PageSectionInput) {
  return (data[key] as string) ?? "";
}

export function RemoveItemButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-1.5 right-1.5 rounded-full bg-black/40 p-1 text-white/70 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
    >
      <Trash2 className="size-3" />
    </button>
  );
}

export function AddItemButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 p-5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      <Plus className="size-3.5" /> {label}
    </button>
  );
}

function SectionBody({ sectionKey, data, editing, setForm, items, updateItem, addItem, removeItem, projects }: BodyProps) {
  switch (sectionKey) {
    case "hero": {
      const stats = items as { value: string; label: string }[];
      return (
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-[11px] font-medium tracking-[0.15em] text-primary uppercase">
            <Diamond className="size-2.5 fill-primary" />
            {editing ? (
              <EditableInput value={field(data, "kicker")} onChange={(v) => setForm((p) => ({ ...p, kicker: v }))} className="w-80 text-center" placeholder="Kicker" />
            ) : data.kicker}
          </div>
          {editing ? (
            <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="w-full text-3xl font-semibold tracking-tight text-foreground sm:text-4xl" placeholder="Titre" />
          ) : (
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{data.title}</h1>
          )}
          {editing ? (
            <EditableTextarea value={field(data, "subtitle")} onChange={(v) => setForm((p) => ({ ...p, subtitle: v }))} className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground" placeholder="Sous-titre" />
          ) : (
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">{data.subtitle}</p>
          )}
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <div className="flex flex-col items-center gap-1">
              <span className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
                {editing ? (
                  <EditableInput value={field(data, "cta_label")} onChange={(v) => setForm((p) => ({ ...p, cta_label: v }))} className="w-52 bg-white/10 text-center text-primary-foreground ring-primary-foreground/30" placeholder="Bouton" />
                ) : data.cta_label}
              </span>
              {editing && (
                <EditableInput value={field(data, "cta_link")} onChange={(v) => setForm((p) => ({ ...p, cta_link: v }))} className="w-52 text-center text-[0.65rem] text-muted-foreground" placeholder="/lien" />
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-foreground">
                {editing ? (
                  <EditableInput value={field(data, "cta_secondary_label")} onChange={(v) => setForm((p) => ({ ...p, cta_secondary_label: v }))} className="w-52 text-center" placeholder="Bouton secondaire" />
                ) : `${data.cta_secondary_label} →`}
              </span>
              {editing && (
                <EditableInput value={field(data, "cta_secondary_link")} onChange={(v) => setForm((p) => ({ ...p, cta_secondary_link: v }))} className="w-52 text-center text-[0.65rem] text-muted-foreground" placeholder="#lien" />
              )}
            </div>
          </div>
          {(stats.length > 0 || editing) && (
            <div className="mt-8 grid grid-cols-1 gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
              {stats.map((stat, index) => (
                <div key={index} className="group relative flex flex-col items-center gap-1">
                  {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
                  {editing ? (
                    <EditableInput value={stat.value} onChange={(v) => updateItem(index, "value", v)} className="w-full text-center text-2xl font-bold text-primary" placeholder="150+" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{stat.value}</span>
                  )}
                  {editing ? (
                    <EditableInput value={stat.label} onChange={(v) => updateItem(index, "label", v)} className="w-full text-center text-[10px] tracking-[0.1em] text-muted-foreground uppercase" placeholder="Libellé" />
                  ) : (
                    <span className="text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{stat.label}</span>
                  )}
                </div>
              ))}
              {editing && stats.length < 3 && (
                <button onClick={() => addItem({ value: "", label: "" })} className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 py-2 text-muted-foreground hover:border-primary/40 hover:text-primary">
                  <Plus className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>
      );
    }

    case "services": {
      const services = items as { icon: string; title: string; description: string }[];
      return (
        <div>
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
            <div className="w-full">
              {editing ? (
                <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="w-full text-xl font-semibold text-foreground" placeholder="Titre" />
              ) : (
                <h2 className="text-xl font-semibold tracking-tight text-foreground">{data.title}</h2>
              )}
              {editing ? (
                <EditableTextarea value={field(data, "subtitle")} onChange={(v) => setForm((p) => ({ ...p, subtitle: v }))} rows={2} className="mt-1.5 max-w-lg text-sm text-muted-foreground" placeholder="Sous-titre" />
              ) : (
                <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">{data.subtitle}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {editing ? (
                <EditableInput value={field(data, "cta_label")} onChange={(v) => setForm((p) => ({ ...p, cta_label: v }))} className="w-64 text-right text-sm font-medium text-primary" placeholder="Lien CTA" />
              ) : (
                <span className="text-sm font-medium text-primary">{data.cta_label} →</span>
              )}
              {editing && (
                <EditableInput value={field(data, "cta_link")} onChange={(v) => setForm((p) => ({ ...p, cta_link: v }))} className="w-64 text-right text-[0.65rem] text-muted-foreground" placeholder="/lien" />
              )}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, index) => {
              return (
                <div key={index} className="group relative rounded-2xl border border-white/10 bg-card/60 p-5">
                  {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
                  <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <SectionIcon name={s.icon} className="size-4.5" />
                  </div>
                  {editing && (
                    <div className="mb-2">
                      <IconPicker value={s.icon} onChange={(v) => updateItem(index, "icon", v)} />
                    </div>
                  )}
                  {editing ? (
                    <EditableInput value={s.title} onChange={(v) => updateItem(index, "title", v)} className="w-full text-sm font-semibold text-foreground" placeholder="Titre" />
                  ) : (
                    <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                  )}
                  {editing ? (
                    <EditableTextarea value={s.description} onChange={(v) => updateItem(index, "description", v)} rows={3} className="mt-1.5 text-xs text-muted-foreground" placeholder="Description" />
                  ) : (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
                  )}
                </div>
              );
            })}
            {editing && <AddItemButton label="Ajouter un service" onClick={() => addItem({ icon: "layout-grid", title: "", description: "" })} />}
          </div>
        </div>
      );
    }

    case "recent_projects": {
      const sample = PROJECTS[0];
      return (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-card/60 p-5 sm:p-8">
          <div className="mb-6">
            {editing ? (
              <EditableInput value={field(data, "kicker")} onChange={(v) => setForm((p) => ({ ...p, kicker: v }))} className="text-xs font-semibold tracking-[0.15em] text-primary uppercase" placeholder="Kicker" />
            ) : (
              <span className="text-xs font-semibold tracking-[0.15em] text-primary uppercase">{data.kicker}</span>
            )}
            {editing ? (
              <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="mt-1 block w-full text-xl font-semibold text-foreground" placeholder="Titre" />
            ) : (
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{data.title}</h2>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-center">
            <LaptopMockup
              title={sample.title}
              videoSrc={sample.videoSrc}
              images={sample.images}
              sceneVariants={sample.sceneVariants}
            />
            <div>
              <span className="text-xs font-semibold tracking-[0.1em] text-primary uppercase">{sample.tag}</span>
              <h3 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{sample.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{sample.description}</p>
            </div>
          </div>
          <p className="mt-6 text-[0.65rem] text-muted-foreground/60">
            Le carrousel (3 projets, images, textes) provient du code (lib/projects) et n&apos;est pas modifiable ici — seuls le kicker et le titre le sont.
          </p>
        </div>
      );
    }

    case "testimonials": {
      const testimonials = items as { quote: string; name: string; role: string }[];
      return (
        <div>
          {editing ? (
            <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="mx-auto block w-full text-center text-xl font-semibold text-foreground" placeholder="Titre" />
          ) : (
            <h2 className="text-center text-xl font-semibold tracking-tight text-foreground">{data.title}</h2>
          )}
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {testimonials.map((t, index) => (
              <figure key={index} className="group relative rounded-2xl border border-white/10 bg-card/60 p-5">
                {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
                {editing ? (
                  <EditableTextarea value={t.quote} onChange={(v) => updateItem(index, "quote", v)} rows={3} className="text-xs text-foreground/90" placeholder="Citation" />
                ) : (
                  <blockquote className="text-xs leading-relaxed text-foreground/90">&ldquo;{t.quote}&rdquo;</blockquote>
                )}
                <figcaption className="mt-4 flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {initials(t.name || "?")}
                  </span>
                  <span className="flex-1">
                    {editing ? (
                      <EditableInput value={t.name} onChange={(v) => updateItem(index, "name", v)} className="block w-full text-xs font-semibold text-foreground" placeholder="Nom" />
                    ) : (
                      <span className="block text-xs font-semibold text-foreground">{t.name}</span>
                    )}
                    {editing ? (
                      <EditableInput value={t.role} onChange={(v) => updateItem(index, "role", v)} className="mt-0.5 block w-full text-[0.7rem] text-muted-foreground" placeholder="Fonction" />
                    ) : (
                      <span className="block text-[0.7rem] text-muted-foreground">{t.role}</span>
                    )}
                  </span>
                </figcaption>
              </figure>
            ))}
            {editing && <AddItemButton label="Ajouter un témoignage" onClick={() => addItem({ quote: "", name: "", role: "" })} />}
          </div>
        </div>
      );
    }

    case "team": {
      const team = items as { name: string; role: string; bio: string; photo_url?: string }[];
      return (
        <div>
          {editing ? (
            <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="w-full text-xl font-semibold text-foreground" placeholder="Titre" />
          ) : (
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{data.title}</h2>
          )}
          {editing ? (
            <EditableTextarea value={field(data, "subtitle")} onChange={(v) => setForm((p) => ({ ...p, subtitle: v }))} rows={2} className="mt-1.5 max-w-lg text-sm text-muted-foreground" placeholder="Sous-titre" />
          ) : (
            <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">{data.subtitle}</p>
          )}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((m, index) => (
              <div key={index} className="group relative rounded-2xl border border-white/10 bg-card/60 p-5">
                {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
                <div className="flex items-center justify-between">
                  {editing ? (
                    <ImageUploadField value={m.photo_url ?? ""} onChange={(url) => updateItem(index, "photo_url", url)} shape="circle" />
                  ) : m.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo_url} alt={m.name} className="size-10 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {initials(m.name || "?")}
                    </span>
                  )}
                  <Mail className="size-3.5 text-muted-foreground" />
                </div>
                {editing ? (
                  <EditableInput value={m.name} onChange={(v) => updateItem(index, "name", v)} className="mt-3 block w-full text-sm font-semibold text-foreground" placeholder="Nom" />
                ) : (
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{m.name}</h3>
                )}
                {editing ? (
                  <EditableInput value={m.role} onChange={(v) => updateItem(index, "role", v)} className="mt-1 block w-full text-[0.65rem] font-semibold tracking-[0.08em] text-primary uppercase" placeholder="Poste" />
                ) : (
                  <span className="text-[0.65rem] font-semibold tracking-[0.08em] text-primary uppercase">{m.role}</span>
                )}
                {editing ? (
                  <EditableTextarea value={m.bio} onChange={(v) => updateItem(index, "bio", v)} rows={2} className="mt-1.5 text-xs text-muted-foreground" placeholder="Bio" />
                ) : (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{m.bio}</p>
                )}
              </div>
            ))}
            {editing && <AddItemButton label="Ajouter un membre" onClick={() => addItem({ name: "", role: "", bio: "", photo_url: "" })} />}
          </div>
        </div>
      );
    }

    case "partner_logos": {
      const partners = items as { name: string; logo_url?: string }[];
      return (
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 border-y border-white/10 py-6">
          {partners.map((p, index) => (
            <span key={index} className="group relative flex flex-col items-center gap-1.5">
              {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
              {editing ? (
                <>
                  <ImageUploadField value={p.logo_url ?? ""} onChange={(url) => updateItem(index, "logo_url", url)} />
                  <EditableInput value={p.name} onChange={(v) => updateItem(index, "name", v)} className="text-center text-sm font-semibold tracking-[0.15em] text-muted-foreground/70 uppercase" placeholder="Nom" />
                </>
              ) : p.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logo_url} alt={p.name} className="h-8 w-auto object-contain opacity-70 grayscale" />
              ) : (
                <span className="text-sm font-semibold tracking-[0.15em] text-muted-foreground/50 uppercase">{p.name}</span>
              )}
            </span>
          ))}
          {editing && (
            <button onClick={() => addItem({ name: "", logo_url: "" })} className="flex items-center gap-1 rounded-full border border-dashed border-white/15 px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary">
              <Plus className="size-3" /> Ajouter
            </button>
          )}
        </div>
      );
    }

    case "blog_insights":
      return (
        <div className="flex items-end justify-between gap-4">
          {editing ? (
            <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="w-full text-xl font-semibold text-foreground" placeholder="Titre" />
          ) : (
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{data.title}</h2>
          )}
          <div className="flex shrink-0 flex-col items-end gap-1">
            {editing ? (
              <EditableInput value={field(data, "cta_label")} onChange={(v) => setForm((p) => ({ ...p, cta_label: v }))} className="w-56 text-right text-sm font-medium text-primary" placeholder="Lien CTA" />
            ) : (
              <span className="text-sm font-medium text-primary">{data.cta_label} →</span>
            )}
            {editing && (
              <EditableInput value={field(data, "cta_link")} onChange={(v) => setForm((p) => ({ ...p, cta_link: v }))} className="w-56 text-right text-[0.65rem] text-muted-foreground" placeholder="/lien" />
            )}
          </div>
        </div>
      );

    case "cta":
      return (
        <div className="rounded-3xl border border-white/10 bg-card/60 px-8 py-12 text-center">
          {editing ? (
            <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="mx-auto block w-full text-center text-2xl font-semibold text-foreground" placeholder="Titre" />
          ) : (
            <h2 className="text-2xl font-semibold tracking-tight text-balance text-foreground">{data.title}</h2>
          )}
          {editing ? (
            <EditableTextarea value={field(data, "subtitle")} onChange={(v) => setForm((p) => ({ ...p, subtitle: v }))} rows={2} className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground" placeholder="Sous-titre" />
          ) : (
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{data.subtitle}</p>
          )}
          <div className="mt-6 flex flex-col items-center gap-1">
            <span className="inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
              {editing ? (
                <EditableInput value={field(data, "cta_label")} onChange={(v) => setForm((p) => ({ ...p, cta_label: v }))} className="w-52 bg-white/10 text-center text-primary-foreground ring-primary-foreground/30" placeholder="Bouton" />
              ) : `${data.cta_label} →`}
            </span>
            {editing && (
              <EditableInput value={field(data, "cta_link")} onChange={(v) => setForm((p) => ({ ...p, cta_link: v }))} className="w-52 text-center text-[0.65rem] text-muted-foreground" placeholder="/lien" />
            )}
          </div>
        </div>
      );

    case "expertise_hero": {
      const rawPanel = items[0] as { header?: string; images?: string[]; image_url?: string; label: string; sublabel: string } | undefined;
      const panel = {
        header: rawPanel?.header ?? "",
        images: rawPanel?.images?.length ? rawPanel.images : rawPanel?.image_url ? [rawPanel.image_url] : [],
        label: rawPanel?.label ?? "",
        sublabel: rawPanel?.sublabel ?? "",
      };
      function updatePanelImages(newImages: string[]) {
        setForm((prev) => {
          const current = prev.items ?? [];
          const padded = current.length > 0 ? current : [{}];
          return { ...prev, items: padded.map((it, i) => (i === 0 ? { ...it, images: newImages } : it)) };
        });
      }
      return (
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-[11px] font-medium tracking-[0.15em] text-primary uppercase">
              <Diamond className="size-2.5 fill-primary" />
              {editing ? (
                <EditableInput value={field(data, "kicker")} onChange={(v) => setForm((p) => ({ ...p, kicker: v }))} className="w-64" placeholder="Kicker" />
              ) : data.kicker}
            </div>
            {editing ? (
              <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="w-full text-3xl font-semibold tracking-tight text-foreground sm:text-4xl" placeholder="Titre" />
            ) : (
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{data.title}</h1>
            )}
            {editing ? (
              <EditableTextarea value={field(data, "subtitle")} onChange={(v) => setForm((p) => ({ ...p, subtitle: v }))} className="mt-4 max-w-lg text-sm text-muted-foreground" placeholder="Sous-titre" />
            ) : (
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">{data.subtitle}</p>
            )}
            <div className="mt-9 flex flex-col items-start gap-1">
              <span className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground">
                {editing ? (
                  <EditableInput value={field(data, "cta_label")} onChange={(v) => setForm((p) => ({ ...p, cta_label: v }))} className="w-52 bg-white/10 text-center text-primary-foreground ring-primary-foreground/30" placeholder="Bouton" />
                ) : data.cta_label}
              </span>
              {editing && (
                <EditableInput value={field(data, "cta_link")} onChange={(v) => setForm((p) => ({ ...p, cta_link: v }))} className="w-52 text-[0.65rem] text-muted-foreground" placeholder="/lien" />
              )}
            </div>
          </div>

          <div className="text-center">
            {editing ? (
              <EditableInput
                value={panel.header} onChange={(v) => updateItem(0, "header", v)}
                className="mx-auto block w-full max-w-md text-center font-mono text-[10px] tracking-wide text-muted-foreground uppercase" placeholder="Soken's Digital — Solutions Logicielles"
              />
            ) : (
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                {panel.header || "Soken's Digital — Solutions Logicielles"}
              </span>
            )}

            <div className="mt-4">
              <TabletMockup images={panel.images} />
            </div>

            {editing && (
              <div className="mx-auto mt-3 flex max-w-md flex-col items-center gap-2">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {panel.images.map((url, i) => (
                    <div key={i} className="group relative size-12 shrink-0 overflow-hidden rounded-lg border border-white/15">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => updatePanelImages(panel.images.filter((_, j) => j !== i))}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5 text-white" />
                      </button>
                    </div>
                  ))}
                  <ImageUploadField value="" onChange={(url) => updatePanelImages([...panel.images, url])} />
                </div>
                <p className="text-[0.65rem] text-muted-foreground/60">
                  Une ou plusieurs images remplacent le schéma d&apos;architecture animé — avec plusieurs, elles s&apos;enchaînent automatiquement. Laisse vide pour garder le schéma par défaut.
                </p>
              </div>
            )}

            <div className="mt-5">
              {editing ? (
                <EditableInput value={panel.label} onChange={(v) => updateItem(0, "label", v)} className="mx-auto block w-full max-w-md text-center text-[11px] font-semibold tracking-[0.1em] text-primary uppercase" placeholder="Label" />
              ) : (
                <span className="text-[11px] font-semibold tracking-[0.1em] text-primary uppercase">{panel.label}</span>
              )}
              {editing ? (
                <EditableInput value={panel.sublabel} onChange={(v) => updateItem(0, "sublabel", v)} className="mx-auto mt-1 block w-full max-w-md text-center text-sm font-semibold text-foreground" placeholder="Sous-label" />
              ) : (
                <p className="mt-1 text-sm font-semibold text-foreground">{panel.sublabel}</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    case "strategic_advantages": {
      const advantages = items as { icon: string; title: string; description: string }[];
      return (
        <div>
          {editing ? (
            <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="w-full text-xl font-semibold text-foreground" placeholder="Titre" />
          ) : (
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{data.title}</h2>
          )}
          {editing ? (
            <EditableTextarea value={field(data, "subtitle")} onChange={(v) => setForm((p) => ({ ...p, subtitle: v }))} rows={2} className="mt-1.5 max-w-xl text-sm text-muted-foreground" placeholder="Sous-titre" />
          ) : (
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{data.subtitle}</p>
          )}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {advantages.map((a, index) => (
              <div key={index} className="group relative rounded-2xl border border-white/10 bg-card/60 p-5">
                {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <SectionIcon name={a.icon} className="size-4.5" />
                </div>
                {editing && (
                  <div className="mb-2">
                    <IconPicker value={a.icon} onChange={(v) => updateItem(index, "icon", v)} />
                  </div>
                )}
                {editing ? (
                  <EditableInput value={a.title} onChange={(v) => updateItem(index, "title", v)} className="w-full text-sm font-semibold text-foreground" placeholder="Titre" />
                ) : (
                  <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                )}
                {editing ? (
                  <EditableTextarea value={a.description} onChange={(v) => updateItem(index, "description", v)} rows={3} className="mt-1.5 text-xs text-muted-foreground" placeholder="Description" />
                ) : (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{a.description}</p>
                )}
              </div>
            ))}
            {editing && <AddItemButton label="Ajouter un avantage" onClick={() => addItem({ icon: "shield-check", title: "", description: "" })} />}
          </div>
        </div>
      );
    }

    case "process_timeline": {
      const phases = items as { phase: string; title: string; description: string }[];
      return (
        <div>
          {editing ? (
            <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="mx-auto block w-full text-center text-xl font-semibold text-foreground" placeholder="Titre" />
          ) : (
            <h2 className="text-center text-xl font-semibold tracking-tight text-foreground">{data.title}</h2>
          )}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {phases.map((phase, index) => (
              <div key={index} className="group relative rounded-xl border-l-2 border-primary bg-card/60 p-5">
                {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
                {editing ? (
                  <EditableInput value={phase.phase} onChange={(v) => updateItem(index, "phase", v)} className="w-32 text-[11px] font-semibold tracking-[0.15em] text-primary uppercase" placeholder="Phase 0X" />
                ) : (
                  <span className="text-[11px] font-semibold tracking-[0.15em] text-primary uppercase">{phase.phase}</span>
                )}
                {editing ? (
                  <EditableInput value={phase.title} onChange={(v) => updateItem(index, "title", v)} className="mt-1.5 block w-full text-lg font-semibold text-foreground" placeholder="Titre" />
                ) : (
                  <h3 className="mt-1.5 text-lg font-semibold text-foreground">{phase.title}</h3>
                )}
                {editing ? (
                  <EditableTextarea value={phase.description} onChange={(v) => updateItem(index, "description", v)} rows={2} className="mt-2 text-sm text-muted-foreground" placeholder="Description" />
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{phase.description}</p>
                )}
              </div>
            ))}
            {editing && <AddItemButton label="Ajouter une phase" onClick={() => addItem({ phase: `Phase 0${phases.length + 1}`, title: "", description: "" })} />}
          </div>
        </div>
      );
    }

    case "tech_stack": {
      const stack = items as { name: string; label: string; logo_url?: string }[];
      return (
        <div>
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
            <div className="w-full">
              {editing ? (
                <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="w-full text-xl font-semibold text-foreground" placeholder="Titre" />
              ) : (
                <h2 className="text-xl font-semibold tracking-tight text-foreground">{data.title}</h2>
              )}
              {editing ? (
                <EditableTextarea value={field(data, "subtitle")} onChange={(v) => setForm((p) => ({ ...p, subtitle: v }))} rows={2} className="mt-1.5 max-w-lg text-sm text-muted-foreground" placeholder="Sous-titre" />
              ) : (
                <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">{data.subtitle}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {editing ? (
                <EditableInput value={field(data, "cta_label")} onChange={(v) => setForm((p) => ({ ...p, cta_label: v }))} className="w-52 text-right text-sm font-medium text-primary" placeholder="Lien CTA" />
              ) : (
                <span className="text-sm font-medium text-primary">{data.cta_label} →</span>
              )}
              {editing && (
                <EditableInput value={field(data, "cta_link")} onChange={(v) => setForm((p) => ({ ...p, cta_link: v }))} className="w-52 text-right text-[0.65rem] text-muted-foreground" placeholder="/lien" />
              )}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {stack.map((tech, index) => (
              <div key={index} className="group relative flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-card/60 px-4 py-6 text-center">
                {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
                {editing ? (
                  <ImageUploadField value={tech.logo_url ?? ""} onChange={(url) => updateItem(index, "logo_url", url)} />
                ) : tech.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tech.logo_url} alt={tech.name} className="h-8 w-auto object-contain" />
                ) : null}
                {editing ? (
                  <EditableInput value={tech.name} onChange={(v) => updateItem(index, "name", v)} className="w-full text-center text-sm font-semibold text-foreground" placeholder="Nom" />
                ) : (
                  !tech.logo_url && <span className="text-sm font-semibold text-foreground">{tech.name}</span>
                )}
                {editing ? (
                  <EditableInput value={tech.label} onChange={(v) => updateItem(index, "label", v)} className="w-full text-center text-[10px] tracking-[0.1em] text-muted-foreground uppercase" placeholder="Catégorie" />
                ) : (
                  <span className="text-[10px] tracking-[0.1em] text-muted-foreground uppercase">{tech.label}</span>
                )}
              </div>
            ))}
            {editing && (
              <button onClick={() => addItem({ name: "", label: "", logo_url: "" })} className="flex items-center justify-center rounded-xl border border-dashed border-white/15 px-4 py-6 text-muted-foreground hover:border-primary/40 hover:text-primary">
                <Plus className="size-4" />
              </button>
            )}
          </div>
        </div>
      );
    }

    case "featured_case_study": {
      const featured = projects.find((p) => p.featured);
      return (
        <div className="overflow-hidden rounded-2xl border-2 border-primary/25 bg-card/60 sm:grid sm:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden sm:aspect-auto">
            {featured ? (
              <ProjectCardMedia images={featured.images} videoSrc={featured.video_src} icon={featured.visual_icon} iconClassName="relative size-14 text-primary/50" />
            ) : (
              <div className="flex h-full items-center justify-center bg-white/[0.02] text-center text-xs text-muted-foreground/60">
                Aucun projet marqué « Featured » dans l&apos;onglet Projets
              </div>
            )}
          </div>
          <div className="p-6 sm:p-8">
            {editing ? (
              <EditableInput value={field(data, "kicker")} onChange={(v) => setForm((p) => ({ ...p, kicker: v }))} className="text-xs font-semibold tracking-[0.15em] text-primary uppercase" placeholder="Kicker" />
            ) : (
              <span className="text-xs font-semibold tracking-[0.15em] text-primary uppercase">{data.kicker}</span>
            )}
            <h3 className="mt-2 text-2xl font-semibold text-foreground">{featured?.title ?? data.title}</h3>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{featured?.description ?? data.subtitle}</p>
            <div className="mt-4 flex flex-col items-start gap-1">
              {editing ? (
                <EditableInput value={field(data, "cta_label")} onChange={(v) => setForm((p) => ({ ...p, cta_label: v }))} className="w-56 text-sm font-medium text-foreground" placeholder="Lien" />
              ) : (
                <span className="text-sm font-medium text-foreground">{data.cta_label} ↗</span>
              )}
              <span className="text-[0.65rem] text-muted-foreground/60">
                {featured ? `→ /projects/${featured.slug}` : "Lien vers la fiche du projet Featured, une fois défini"}
              </span>
            </div>
            <p className="mt-4 text-[0.65rem] text-muted-foreground/60">
              Le titre, la description, l&apos;image et le lien viennent automatiquement du projet coché « Featured »
              dans l&apos;onglet Projets — seuls le kicker et le libellé du bouton se modifient ici.
            </p>
          </div>
        </div>
      );
    }

    case "tracking_hero":
      return (
        <div className="mx-auto max-w-xl text-center">
          {editing ? (
            <EditableInput value={field(data, "title")} onChange={(v) => setForm((p) => ({ ...p, title: v }))} className="w-full text-center text-3xl font-semibold text-foreground" placeholder="Titre" />
          ) : (
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{data.title}</h1>
          )}
          {editing ? (
            <EditableTextarea value={field(data, "subtitle")} onChange={(v) => setForm((p) => ({ ...p, subtitle: v }))} className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground" placeholder="Sous-titre" />
          ) : (
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">{data.subtitle}</p>
          )}
        </div>
      );

    case "tracking_features": {
      const features = items as { icon: string; title: string; description: string }[];
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {features.map((f, index) => (
            <div key={index} className="group relative rounded-2xl border border-white/10 bg-card/60 p-5">
              {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
              <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <SectionIcon name={f.icon} className="size-4.5" />
              </div>
              {editing && (
                <div className="mb-2">
                  <IconPicker value={f.icon} onChange={(v) => updateItem(index, "icon", v)} />
                </div>
              )}
              {editing ? (
                <EditableInput value={f.title} onChange={(v) => updateItem(index, "title", v)} className="w-full text-sm font-semibold text-foreground" placeholder="Titre" />
              ) : (
                <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
              )}
              {editing ? (
                <EditableTextarea value={f.description} onChange={(v) => updateItem(index, "description", v)} rows={3} className="mt-1.5 text-xs text-muted-foreground" placeholder="Description" />
              ) : (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.description}</p>
              )}
            </div>
          ))}
          {editing && <AddItemButton label="Ajouter une fonctionnalité" onClick={() => addItem({ icon: "shield", title: "", description: "" })} />}
        </div>
      );
    }

    case "start_project_objectifs": {
      const objectifs = items as { icon: string; title: string; description: string }[];
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {objectifs.map((o, index) => (
            <div key={index} className="group relative rounded-xl border border-white/10 bg-card/60 p-4">
              {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
              <SectionIcon name={o.icon} className="size-5 text-foreground/80" />
              {editing && (
                <div className="mt-2">
                  <IconPicker value={o.icon} onChange={(v) => updateItem(index, "icon", v)} />
                </div>
              )}
              {editing ? (
                <EditableInput value={o.title} onChange={(v) => updateItem(index, "title", v)} className="mt-3 block w-full text-sm font-semibold text-foreground" placeholder="Titre" />
              ) : (
                <h4 className="mt-3 text-sm font-semibold text-foreground">{o.title}</h4>
              )}
              {editing ? (
                <EditableTextarea value={o.description} onChange={(v) => updateItem(index, "description", v)} rows={2} className="mt-1.5 text-xs text-muted-foreground" placeholder="Description" />
              ) : (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{o.description}</p>
              )}
            </div>
          ))}
          {editing && <AddItemButton label="Ajouter un objectif" onClick={() => addItem({ icon: "rocket", title: "", description: "" })} />}
        </div>
      );
    }

    case "start_project_solutions": {
      const solutions = items as { label: string }[];
      return (
        <div className="flex flex-wrap gap-2">
          {solutions.map((s, index) => (
            <div key={index} className="group relative">
              {editing ? (
                <div className="flex items-center gap-1 rounded-full bg-white/[0.06] py-1 pr-1 pl-3 ring-1 ring-white/10">
                  <EditableInput value={s.label} onChange={(v) => updateItem(index, "label", v)} className="w-32 text-xs text-foreground" />
                  <RemoveItemButton onClick={() => removeItem(index)} />
                </div>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-foreground">{s.label}</span>
              )}
            </div>
          ))}
          {editing && <AddItemButton label="Ajouter" onClick={() => addItem({ label: "" })} />}
        </div>
      );
    }

    case "start_project_delais": {
      const delais = items as { title: string; subtitle: string }[];
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {delais.map((d, index) => (
            <div key={index} className="group relative rounded-xl border border-white/10 bg-card/60 p-4">
              {editing && <RemoveItemButton onClick={() => removeItem(index)} />}
              {editing ? (
                <EditableInput value={d.title} onChange={(v) => updateItem(index, "title", v)} className="block w-full text-sm font-semibold text-foreground" placeholder="Titre" />
              ) : (
                <h4 className="text-sm font-semibold text-foreground">{d.title}</h4>
              )}
              {editing ? (
                <EditableInput value={d.subtitle} onChange={(v) => updateItem(index, "subtitle", v)} className="mt-1 block w-full text-xs text-muted-foreground" placeholder="Sous-titre" />
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{d.subtitle}</p>
              )}
            </div>
          ))}
          {editing && <AddItemButton label="Ajouter un délai" onClick={() => addItem({ title: "", subtitle: "" })} />}
        </div>
      );
    }

    case "start_project_canaux": {
      const canaux = items as { icon: string; label: string }[];
      return (
        <div className="flex flex-wrap gap-2">
          {canaux.map((c, index) => (
            <div key={index} className="group relative">
              {editing ? (
                <div className="flex items-center gap-1 rounded-full bg-white/[0.06] py-1 pr-1 pl-2 ring-1 ring-white/10">
                  <IconPicker value={c.icon} onChange={(v) => updateItem(index, "icon", v)} />
                  <EditableInput value={c.label} onChange={(v) => updateItem(index, "label", v)} className="w-24 text-xs text-foreground" />
                  <RemoveItemButton onClick={() => removeItem(index)} />
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-foreground">
                  <SectionIcon name={c.icon} className="size-3.5" /> {c.label}
                </span>
              )}
            </div>
          ))}
          {editing && <AddItemButton label="Ajouter" onClick={() => addItem({ icon: "mail", label: "" })} />}
        </div>
      );
    }

    default:
      return null;
  }
}
