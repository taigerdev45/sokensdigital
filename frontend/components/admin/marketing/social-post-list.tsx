"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, CalendarClock, Ban, Sparkles, Hash, WrapText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from "@/components/ui/tabs";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { TagInput } from "@/components/admin/tag-input";
import { MultiImageUploadField } from "@/components/admin/marketing/multi-image-upload-field";
import {
  listSocialPosts,
  createSocialPost,
  updateSocialPost,
  deleteSocialPost,
  scheduleSocialPost,
  cancelSocialPost,
  getSocialMediaCredentials,
  type SocialPostInput,
} from "@/lib/api/marketing";
import type { SocialPost, SocialPostStatus, SocialPlatform } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { PlatformBadge } from "@/components/admin/marketing/social-platform";
import { SocialCalendar } from "@/components/admin/marketing/social-calendar";
import { SocialPostPreview } from "@/components/admin/marketing/social-post-preview";

const STATUS_LABELS: Record<SocialPostStatus, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Programmé",
  PUBLISHED: "Publié",
  FAILED: "Échec",
  CANCELLED: "Annulé",
};

const STATUS_COLORS: Record<SocialPostStatus, string> = {
  DRAFT: "bg-neutral-100 text-neutral-500",
  SCHEDULED: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-neutral-100 text-neutral-400",
};

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Today at 09:00, local time, in datetime-local's expected format — only
 * ever called from an event handler (button click), never during render,
 * so touching the current time here doesn't trip the "no impure calls
 * during render" rule. */
function todayAt9() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

export function SocialPostList() {
  const { profile } = useAuth();
  const isMarketing = profile?.role === "RESPONSABLE_MARKETING" || profile?.role === "SUPER_ADMIN";
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SocialPost | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [credentialsConfigured, setCredentialsConfigured] = useState<boolean | null>(null);

  async function load() {
    try {
      const data = await listSocialPosts();
      setPosts(data.results);
    } catch {
      setError("Impossible de charger le plan éditorial.");
    }
  }

  useEffect(() => {
    load();
    // Super-Admin only endpoint — a 403 for anyone else just means "don't
    // show the banner", not an error to surface.
    getSocialMediaCredentials()
      .then((c) => setCredentialsConfigured(c.facebook_configured || c.instagram_configured))
      .catch(() => setCredentialsConfigured(null));
  }, []);

  async function handleSchedule(post: SocialPost) {
    setBusyId(post.id);
    try {
      await scheduleSocialPost(post.id);
      load();
    } catch {
      setError(`Impossible de programmer "${post.title}" — assure-toi qu'une date est renseignée.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(post: SocialPost) {
    setBusyId(post.id);
    try {
      await cancelSocialPost(post.id);
      load();
    } catch {
      setError(`Impossible d'annuler "${post.title}".`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(post: SocialPost) {
    if (!confirm(`Supprimer "${post.title}" ?`)) return;
    try {
      await deleteSocialPost(post.id);
      load();
    } catch {
      setError(`Impossible de supprimer "${post.title}".`);
    }
  }

  function openCreate(dateIso?: string) {
    setEditing(null);
    setPrefillDate(dateIso ?? todayAt9());
    setOpen(true);
  }

  function openEdit(post: SocialPost) {
    setEditing(post);
    setPrefillDate(null);
    setOpen(true);
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!posts) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Plan Éditorial</h1>
          <p className="text-sm text-neutral-500">
            {isMarketing
              ? "Création, planification et annulation des publications réseaux sociaux."
              : "Rôle de proposition — tes brouillons attendent une validation Marketing."}
          </p>
        </div>
        <Sheet
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setEditing(null);
              setPrefillDate(null);
            }
          }}
        >
          <SheetTrigger
            render={
              <Button
                data-tour="module-marketing-plan-editorial"
                className="gap-1.5 rounded-full px-4"
                onClick={() => openCreate()}
              >
                <Plus className="size-4" /> Nouvelle publication
              </Button>
            }
          />
          <SheetContent title={editing ? "Modifier la publication" : "Nouvelle publication"} className="sm:max-w-3xl">
            <SocialPostForm
              post={editing ?? undefined}
              prefillDate={prefillDate}
              readOnly={!isMarketing}
              onSaved={() => {
                setOpen(false);
                setEditing(null);
                setPrefillDate(null);
                load();
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {credentialsConfigured === false && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          Aucun identifiant Facebook/Instagram n&apos;est configuré — les publications programmées resteront en
          attente jusqu&apos;à ce qu&apos;un Super-Admin les renseigne dans Paramètres &gt; Réseaux sociaux.
        </p>
      )}

      <Tabs defaultValue="calendrier">
        <TabsList>
          <TabsTab value="calendrier">Calendrier</TabsTab>
          <TabsTab value="liste">Liste</TabsTab>
          <TabsIndicator />
        </TabsList>

        <TabsPanel value="calendrier" className="pt-4">
          <SocialCalendar posts={posts} onSelectDay={(iso) => openCreate(`${iso}T09:00`)} onSelectPost={openEdit} />
        </TabsPanel>

        <TabsPanel value="liste" className="pt-4">
          <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Titre</th>
                  <th className="px-4 py-3 font-medium">Plateforme</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Programmé pour</th>
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(post)}
                        className="text-left text-neutral-900 hover:text-primary hover:underline"
                      >
                        {post.title}
                      </button>
                      <p className="max-w-xs truncate text-xs text-neutral-400">{post.content}</p>
                    </td>
                    <td className="px-4 py-3">
                      <PlatformBadge platform={post.platform} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[post.status]}`}>
                        {STATUS_LABELS[post.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {isMarketing && (
                        <div className="flex items-center justify-end gap-2">
                          {post.status === "DRAFT" && (
                            <button
                              type="button"
                              onClick={() => handleSchedule(post)}
                              disabled={busyId === post.id}
                              aria-label="Programmer"
                              className="text-neutral-400 hover:text-primary"
                            >
                              <CalendarClock className="size-4" />
                            </button>
                          )}
                          {(post.status === "DRAFT" || post.status === "SCHEDULED") && (
                            <button
                              type="button"
                              onClick={() => handleCancel(post)}
                              disabled={busyId === post.id}
                              aria-label="Annuler"
                              className="text-neutral-400 hover:text-amber-600"
                            >
                              <Ban className="size-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(post)}
                            aria-label="Supprimer"
                            className="text-neutral-400 hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {posts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                      Aucune publication pour l&apos;instant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsPanel>
      </Tabs>
    </div>
  );
}

function ContentToolbar({ textareaRef, onInsert }: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (text: string) => void;
}) {
  function insert(snippet: string) {
    const el = textareaRef.current;
    if (!el) {
      onInsert(snippet);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + snippet + el.value.slice(end);
    onInsert(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + snippet.length;
    });
  }

  return (
    <div className="mb-1.5 flex items-center gap-1">
      <button
        type="button"
        onClick={() => insert("\n\n")}
        title="Saut de paragraphe"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <WrapText className="size-3.5" /> Paragraphe
      </button>
      <button
        type="button"
        onClick={() => insert("\n\n✨ ⸻ ✨\n\n")}
        title="Séparateur"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <Sparkles className="size-3.5" /> Séparateur
      </button>
      <button
        type="button"
        onClick={() => insert("\n\n#SokensDigital #Digital ")}
        title="Bloc hashtags"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <Hash className="size-3.5" /> Hashtags
      </button>
    </div>
  );
}

function SocialPostForm({
  post,
  prefillDate,
  readOnly,
  onSaved,
}: {
  post?: SocialPost;
  prefillDate: string | null;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SocialPostInput>({
    title: post?.title ?? "",
    content: post?.content ?? "",
    image_path: post?.image_path ?? "",
    additional_images: post?.additional_images ?? [],
    platform: post?.platform ?? "FACEBOOK",
    scheduled_at: post ? toDatetimeLocal(post.scheduled_at) : (prefillDate ?? ""),
    notes: post?.notes ?? "",
    tags: post?.tags ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function set<K extends keyof SocialPostInput>(key: K, value: SocialPostInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const images = [form.image_path, ...(form.additional_images ?? [])].filter((url): url is string => Boolean(url));

  function setImages(next: string[]) {
    const [cover, ...rest] = next;
    set("image_path", cover ?? "");
    set("additional_images", rest);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = { ...form, scheduled_at: form.scheduled_at || undefined };
      if (post) {
        await updateSocialPost(post.id, payload);
      } else {
        await createSocialPost(payload);
      }
      onSaved();
    } catch {
      setError("Impossible d'enregistrer — une image de couverture est requise pour Facebook et Instagram.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={readOnly} className="space-y-4">
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
              {error}
            </p>
          )}

          <label className="block">
            <span className={labelClass}>Images</span>
            <MultiImageUploadField images={images} onChange={setImages} />
          </label>

          <label className="block">
            <span className={labelClass}>Titre</span>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inputClass} required />
          </label>

          <label className="block">
            <span className={labelClass}>Plateforme</span>
            <select value={form.platform} onChange={(e) => set("platform", e.target.value)} className={inputClass}>
              <option value="FACEBOOK">Facebook</option>
              <option value="INSTAGRAM">Instagram</option>
            </select>
          </label>

          <div>
            <span className={labelClass}>
              Contenu <span className="text-neutral-400">({form.content.length} caractères)</span>
            </span>
            <ContentToolbar textareaRef={contentRef} onInsert={(text) => set("content", text)} />
            <textarea
              ref={contentRef}
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              className={`${inputClass} min-h-48`}
              required
            />
          </div>

          <label className="block">
            <span className={labelClass}>Date et heure de programmation</span>
            <input
              type="datetime-local"
              value={form.scheduled_at ?? ""}
              onChange={(e) => set("scheduled_at", e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Tags</span>
            <TagInput value={form.tags ?? []} onChange={(tags) => set("tags", tags)} placeholder="Taper puis Entrée…" />
          </label>

          <label className="block">
            <span className={labelClass}>Notes internes</span>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputClass} min-h-16`} />
          </label>

          {!post && (
            <p className="text-xs text-neutral-400">
              La publication est créée en brouillon — la programmation (passage à &quot;Programmé&quot;) se fait ensuite depuis la liste.
            </p>
          )}
        </fieldset>

        {!readOnly && (
          <div className="flex items-center justify-between pt-2">
            <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
            <Button type="submit" disabled={saving} className="rounded-full px-5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : post ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        )}
      </form>

      <div>
        <p className={labelClass}>Aperçu</p>
        <div className="mt-2 flex justify-center rounded-xl bg-neutral-50 p-4">
          <SocialPostPreview
            platform={form.platform as SocialPlatform}
            title={form.title}
            content={form.content}
            images={images}
          />
        </div>
      </div>
    </div>
  );
}
