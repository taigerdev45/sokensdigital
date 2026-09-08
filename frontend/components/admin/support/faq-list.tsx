"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import { listFAQ, createFAQ, updateFAQ, deleteFAQ, type FAQInput } from "@/lib/api/support";
import type { FAQEntry, FAQAudience } from "@/lib/api/types";

const AUDIENCE_LABELS: Record<FAQAudience, string> = {
  PUBLIC: "Public",
  INTERNE: "Interne",
};

const AUDIENCE_COLORS: Record<FAQAudience, string> = {
  PUBLIC: "bg-emerald-100 text-emerald-700",
  INTERNE: "bg-neutral-100 text-neutral-500",
};

export function FAQList() {
  const [entries, setEntries] = useState<FAQEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<FAQEntry | "new" | null>(null);

  async function load() {
    try {
      const data = await listFAQ();
      setEntries(data.results);
    } catch {
      setError("Impossible de charger la base de connaissances.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(entry: FAQEntry) {
    await deleteFAQ(entry.id);
    load();
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!entries) {
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
          <h1 className="text-2xl font-semibold text-neutral-900">Base de connaissances</h1>
          <p className="text-sm text-neutral-500">
            Entrées &quot;Public&quot; visibles sur la page FAQ du site — entrées &quot;Interne&quot; réservées à l&apos;équipe support.
          </p>
        </div>
        <Button onClick={() => setEditEntry("new")} className="gap-1.5 rounded-full px-4">
          <Plus className="size-4" /> Nouvelle entrée
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Question</th>
              <th className="px-4 py-3 font-medium">Catégorie</th>
              <th className="px-4 py-3 font-medium">Audience</th>
              <th className="px-4 py-3 font-medium">Publié</th>
              <th className="w-11 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-3 text-neutral-900">{entry.question}</td>
                <td className="px-4 py-3 text-neutral-600">{entry.category || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${AUDIENCE_COLORS[entry.audience]}`}>
                    {AUDIENCE_LABELS[entry.audience]}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500">{entry.is_published ? "Oui" : "Non"}</td>
                <td className="px-4 py-3">
                  <Popover>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      }
                    />
                    <PopoverContent className="w-44 p-1" align="end">
                      <button
                        type="button"
                        onClick={() => setEditEntry(entry)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                      >
                        <Pencil className="size-3.5" /> Modifier
                      </button>
                      <ConfirmModal
                        title="Supprimer l'entrée"
                        description={`Supprimer définitivement "${entry.question}" ? Cette action est irréversible.`}
                        onConfirm={() => handleDelete(entry)}
                        trigger={
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-destructive hover:bg-destructive/5"
                          >
                            <Trash2 className="size-3.5" /> Supprimer
                          </button>
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Aucune entrée pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={editEntry !== null} onOpenChange={(open) => !open && setEditEntry(null)}>
        <SheetContent title={editEntry === "new" ? "Nouvelle entrée" : "Modifier l'entrée"}>
          {editEntry && (
            <FAQForm
              entry={editEntry === "new" ? undefined : editEntry}
              onSaved={() => {
                setEditEntry(null);
                load();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FAQForm({ entry, onSaved }: { entry?: FAQEntry; onSaved: () => void }) {
  const [question, setQuestion] = useState(entry?.question ?? "");
  const [answer, setAnswer] = useState(entry?.answer ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [audience, setAudience] = useState<FAQAudience>(entry?.audience ?? "PUBLIC");
  const [order, setOrder] = useState(entry?.order ?? 0);
  const [isPublished, setIsPublished] = useState(entry?.is_published ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload: FAQInput = { question, answer, category, audience, order: Number(order), is_published: isPublished };
    try {
      if (entry) await updateFAQ(entry.id, payload);
      else await createFAQ(payload);
      onSaved();
    } catch {
      setError(entry ? "Impossible de modifier cette entrée." : "Impossible de créer cette entrée.");
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

      <label className="block">
        <span className={labelClass}>Question</span>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} required className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Réponse</span>
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} required className={inputClass} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Catégorie</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Audience</span>
          <select value={audience} onChange={(e) => setAudience(e.target.value as FAQAudience)} className={inputClass}>
            <option value="PUBLIC">Public</option>
            <option value="INTERNE">Interne</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Ordre d&apos;affichage</span>
          <input type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="mt-6 flex items-center gap-2">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="size-4" />
          <span className="text-sm text-neutral-700">Publié</span>
        </label>
      </div>

      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : entry ? "Enregistrer" : "Créer"}
        </Button>
      </div>
    </form>
  );
}
