"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, LayoutGrid, List, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import { ImageUploadField } from "@/components/admin/marketing/page-section-editor";
import dynamic from "next/dynamic";

// Tiptap (~200 Ko) n'est utile qu'une fois le tiroir d'édition ouvert —
// le charger à la demande évite de le facturer à quiconque ouvre la
// simple liste des articles. ssr:false : l'éditeur manipule le DOM et
// n'a rien à rendre côté serveur.
const RichTextEditor = dynamic(
  () => import("@/components/admin/marketing/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-48 animate-pulse rounded-lg bg-neutral-100" /> }
);
import { ProjectCardMedia } from "@/components/projects/card-media";
import {
  listBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  type BlogPostInput,
} from "@/lib/api/marketing";
import type { BlogPost } from "@/lib/api/types";

const EMPTY: BlogPostInput = {
  title: "",
  cover_image: "",
  content: "",
  status: "BROUILLON",
};

function authorName(author: BlogPost["author"]): string {
  if (!author) return "";
  if (typeof author === "string") return author;
  return `${author.first_name} ${author.last_name}`.trim();
}

export function BlogPostList() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "card">("card");

  async function load() {
    try {
      const data = await listBlogPosts();
      setPosts(data.results);
    } catch {
      setError("Impossible de charger les articles.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function edit(post: BlogPost) {
    setEditing(post);
    setOpen(true);
  }

  async function handleDelete(post: BlogPost) {
    if (!confirm(`Supprimer "${post.title}" ?`)) return;
    try {
      await deleteBlogPost(post.id!);
      load();
    } catch {
      setError(`Impossible de supprimer "${post.title}".`);
    }
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
          <h1 className="text-2xl font-semibold text-neutral-900">Blog</h1>
          <p className="text-sm text-neutral-500">Articles de la vitrine publique.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-neutral-200 p-0.5">
            <button
              type="button"
              onClick={() => setView("card")}
              aria-label="Vue carte"
              aria-pressed={view === "card"}
              className={cn("rounded-full p-1.5", view === "card" ? "bg-neutral-900 text-white" : "text-neutral-500")}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="Vue liste"
              aria-pressed={view === "list"}
              className={cn("rounded-full p-1.5", view === "list" ? "bg-neutral-900 text-white" : "text-neutral-500")}
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
                <Button data-tour="module-marketing-blog" className="gap-1.5 rounded-full px-4">
                  <Plus className="size-4" /> Nouvel article
                </Button>
              }
            />
            <SheetContent title="Nouvel article" className="max-w-2xl">
              <BlogPostForm
                onSaved={() => {
                  setOpen(false);
                  load();
                }}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Sheet
        open={open && !!editing}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      >
        <SheetContent title="Modifier l'article" className="max-w-2xl">
          {editing && (
            <BlogPostForm
              post={editing}
              onSaved={() => {
                setOpen(false);
                setEditing(null);
                load();
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {view === "list" ? (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Titre</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Publié le</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => edit(post)} className="text-neutral-900 hover:text-primary">
                      {post.title}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        post.status === "PUBLIE"
                          ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                          : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
                      }
                    >
                      {post.status === "PUBLIE" ? "Publié" : "Brouillon"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {post.published_at ? new Date(post.published_at).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(post)}
                      aria-label="Supprimer"
                      className="text-neutral-400 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {posts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                    Aucun article pour l&apos;instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <div key={post.id} className="group overflow-hidden rounded-2xl border-2 border-primary/25 bg-[#0a0e13] transition-colors hover:border-primary/70">
              <button type="button" onClick={() => edit(post)} className="relative flex aspect-video w-full items-center justify-center overflow-hidden">
                <ProjectCardMedia images={post.cover_image ? [post.cover_image] : undefined} />
                <span
                  className={cn(
                    "absolute top-3 left-3 z-10 rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.1em] uppercase",
                    post.status === "PUBLIE" ? "bg-primary text-primary-foreground" : "bg-black/60 text-white/70"
                  )}
                >
                  {post.status === "PUBLIE" ? "Publié" : "Brouillon"}
                </span>
              </button>
              <div className="p-4">
                <span className="text-xs text-muted-foreground">
                  {post.published_at ? new Date(post.published_at).toLocaleDateString("fr-FR") : "Non publié"}
                </span>
                <h3 className="mt-1 text-base font-semibold text-foreground">{post.title}</h3>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <button type="button" onClick={() => edit(post)} className="text-xs font-medium text-primary hover:underline">
                    Modifier
                  </button>
                  <button type="button" onClick={() => handleDelete(post)} aria-label="Supprimer" className="text-muted-foreground/60 hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {posts.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-neutral-400">Aucun article pour l&apos;instant.</p>
          )}
        </div>
      )}
    </div>
  );
}

function BlogPostForm({ post, onSaved }: { post?: BlogPost; onSaved: () => void }) {
  const [form, setForm] = useState<BlogPostInput>(
    post
      ? { title: post.title, cover_image: post.cover_image, content: post.content, status: post.status ?? "BROUILLON" }
      : EMPTY
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof BlogPostInput>(key: K, value: BlogPostInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError("Champ requis manquant : Titre.");
      return;
    }

    setSaving(true);
    try {
      if (post) {
        await updateBlogPost(post.id!, form);
      } else {
        await createBlogPost(form);
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        const fieldErrors = Object.entries(err.body as Record<string, unknown>)
          .map(([field, msgs]) => `${field} : ${Array.isArray(msgs) ? msgs.join(" ") : String(msgs)}`)
          .join(" — ");
        setError(fieldErrors || "Impossible d'enregistrer l'article.");
      } else {
        setError("Impossible d'enregistrer l'article.");
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

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5">
        <label className="flex items-center gap-1.5 text-sm text-neutral-700">
          Statut
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm"
          >
            <option value="BROUILLON">Brouillon</option>
            <option value="PUBLIE">Publié</option>
          </select>
        </label>
        {post && <span className="text-sm text-neutral-500">Auteur : {authorName(post.author) || "—"}</span>}
        {post?.slug && (
          <Link
            href={`/blog/${post.slug}`}
            target="_blank"
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            Voir l&apos;article <ExternalLink className="size-3" />
          </Link>
        )}
      </div>

      <div>
        <div className="relative flex aspect-[21/9] items-center justify-center overflow-hidden rounded-2xl border-2 border-primary/25">
          <ProjectCardMedia images={form.cover_image ? [form.cover_image] : undefined} iconClassName="relative size-16 text-primary/40 sm:size-20" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <ImageUploadField value={form.cover_image} onChange={(url) => set("cover_image", url)} />
          {form.cover_image && (
            <button type="button" onClick={() => set("cover_image", "")} className="text-neutral-400 transition-colors hover:text-destructive">
              <X className="size-4" />
            </button>
          )}
          <p className="text-xs text-neutral-500">Image de couverture</p>
        </div>
      </div>

      <label className="block">
        <input
          value={form.title} onChange={(e) => set("title", e.target.value)}
          className="block w-full border-b border-neutral-200 pb-2 text-3xl font-semibold tracking-tight text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-primary/50"
          placeholder="Titre de l'article"
        />
      </label>

      <div>
        <RichTextEditor value={form.content} onChange={(html) => set("content", html)} />
      </div>

      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : post ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </form>
  );
}
