"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2, Send, Copy, CopyPlus, Printer, Settings, Receipt, Stamp, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { formatFcfa } from "@/lib/format-currency";
import { ApiError } from "@/lib/api/client";
import { uploadImage } from "@/lib/api/upload";
import {
  listQuotes,
  deleteQuote,
  sendQuote,
  cloneQuote,
  convertQuoteToInvoice,
  getQuoteSettings,
  updateQuoteSettings,
} from "@/lib/api/marketing";
import type { Quote, QuoteStatus, QuotePaymentTerm, QuoteSettings } from "@/lib/api/types";
import { QuoteViewerModal } from "@/components/admin/marketing/quote-viewer-modal";
import { ConfirmModal } from "@/components/admin/confirm-modal";

const STATUS_LABELS: Record<QuoteStatus, string> = {
  BROUILLON: "Brouillon",
  ENVOYE: "Envoyé",
  ACCEPTE: "Accepté",
  REFUSE: "Refusé",
};

const STATUS_COLORS: Record<QuoteStatus, string> = {
  BROUILLON: "bg-neutral-100 text-neutral-500",
  ENVOYE: "bg-amber-100 text-amber-700",
  ACCEPTE: "bg-emerald-100 text-emerald-700",
  REFUSE: "bg-destructive/10 text-destructive",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function QuoteList({ basePath = "/admin/marketing/devis" }: { basePath?: string }) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewing, setViewing] = useState<Quote | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const data = await listQuotes();
      setQuotes(data.results);
    } catch {
      setError("Impossible de charger les devis.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSend(quote: Quote) {
    setBusyId(quote.id);
    try {
      await sendQuote(quote.id);
      load();
    } catch {
      setError(`Impossible d'envoyer "${quote.quote_number}" — vérifie qu'il a au moins une ligne.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleClone(quote: Quote) {
    setBusyId(quote.id);
    try {
      await cloneQuote(quote.id);
      load();
    } catch {
      setError(`Impossible de dupliquer "${quote.quote_number}".`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(quote: Quote) {
    await deleteQuote(quote.id);
    load();
  }

  function copyTrackingLink(quote: Quote) {
    const url = `${window.location.origin}/devis/${quote.tracking_token}/`;
    navigator.clipboard.writeText(url);
  }

  async function handleConvertToInvoice(quote: Quote) {
    setBusyId(quote.id);
    setError(null);
    try {
      await convertQuoteToInvoice(quote.id);
      load();
    } catch (err) {
      const detail = err instanceof ApiError && err.body && typeof err.body === "object" && "detail" in err.body
        ? String((err.body as { detail: unknown }).detail)
        : null;
      setError(detail ?? `Impossible de convertir "${quote.quote_number}" en facture.`);
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!quotes) {
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
          <h1 className="text-2xl font-semibold text-neutral-900">Devis</h1>
          <p className="text-sm text-neutral-500">
            Le département en charge peut toujours modifier et mettre à jour un devis, quel que soit son statut.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setSettingsOpen(true)}
            aria-label="Paramètres des devis"
            className="size-9 rounded-full p-0"
          >
            <Settings className="size-4" />
          </Button>
          <Link href={`${basePath}/nouveau`}>
            <Button data-tour="module-marketing-devis" className="gap-1.5 rounded-full px-4">
              <Plus className="size-4" /> Nouveau devis
            </Button>
          </Link>
        </div>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent title="Paramètres des devis">
          <QuoteSettingsForm onSaved={() => setSettingsOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="overflow-hidden rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">N°</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Total TTC</th>
              <th className="px-4 py-3 font-medium">Dernière mise à jour</th>
              <th className="w-11 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {quotes.map((quote) => (
              <tr key={quote.id}>
                <td className="px-4 py-3 text-neutral-900">
                  <Link href={`${basePath}/${quote.id}`} className="hover:text-primary hover:underline">
                    {quote.quote_number}
                  </Link>
                  {quote.version > 1 && <span className="ml-1 text-xs text-neutral-400">v{quote.version}</span>}
                </td>
                <td className="px-4 py-3 text-neutral-600">{quote.client_name || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[quote.status]}`}>
                    {STATUS_LABELS[quote.status]}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-neutral-900">{formatFcfa(quote.total_ttc)}</td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(quote.updated_at)}</td>
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
                    <PopoverContent className="w-56 p-1" align="end">
                      <button
                        type="button"
                        onClick={() => setViewing(quote)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                      >
                        <Printer className="size-3.5" /> Aperçu / PDF
                      </button>
                      <Link
                        href={`${basePath}/${quote.id}`}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                      >
                        <Pencil className="size-3.5" /> Modifier
                      </Link>
                      {quote.status === "BROUILLON" && (
                        <button
                          type="button"
                          onClick={() => handleSend(quote)}
                          disabled={busyId === quote.id}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                        >
                          <Send className="size-3.5" /> Envoyer
                        </button>
                      )}
                      {quote.status !== "BROUILLON" && (
                        <>
                          <button
                            type="button"
                            onClick={() => copyTrackingLink(quote)}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                          >
                            <Copy className="size-3.5" /> Copier le lien de suivi
                          </button>
                          <button
                            type="button"
                            onClick={() => handleClone(quote)}
                            disabled={busyId === quote.id}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                          >
                            <CopyPlus className="size-3.5" /> Dupliquer
                          </button>
                        </>
                      )}
                      {quote.status === "ACCEPTE" && (
                        <button
                          type="button"
                          onClick={() => handleConvertToInvoice(quote)}
                          disabled={busyId === quote.id}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-emerald-700 hover:bg-emerald-50"
                        >
                          <Receipt className="size-3.5" /> Convertir en facture
                        </button>
                      )}
                      <ConfirmModal
                        title="Supprimer le devis"
                        description={`Supprimer définitivement "${quote.quote_number}" ? Cette action est irréversible.`}
                        onConfirm={() => handleDelete(quote)}
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
            {quotes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Aucun devis pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {viewing && (
        <QuoteViewerModal quoteId={viewing.id} quoteNumber={viewing.quote_number} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function StampUploadField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
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
    <div>
      <span className={labelClass}>Cachet numérique (signature électronique)</span>
      <p className="mb-2 text-xs text-neutral-400">
        Apposé sur le PDF du devis et sur la page publique une fois le devis accepté.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 hover:border-primary/40"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-full object-contain" />
          ) : (
            <Stamp className="size-5" />
          )}
        </button>
        <div className="flex-1">
          <button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-medium text-primary hover:underline">
            {value ? "Changer le cachet" : "Téléverser un cachet"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="ml-3 text-xs text-neutral-400 hover:text-destructive">
              Retirer
            </button>
          )}
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.gif" onChange={handleFile} className="hidden" />
    </div>
  );
}

function QuoteSettingsForm({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<QuoteSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getQuoteSettings()
      .then(setSettings)
      .catch(() => setError("Impossible de charger les paramètres."));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!settings) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  function updateMethod(index: number, label: string) {
    setSettings((prev) => (prev ? { ...prev, payment_methods: prev.payment_methods.map((m, i) => (i === index ? { label } : m)) } : prev));
  }

  function addMethod() {
    setSettings((prev) => (prev ? { ...prev, payment_methods: [...prev.payment_methods, { label: "" }] } : prev));
  }

  function removeMethod(index: number) {
    setSettings((prev) => (prev ? { ...prev, payment_methods: prev.payment_methods.filter((_, i) => i !== index) } : prev));
  }

  function updateDefaultTerm(index: number, patch: Partial<QuotePaymentTerm>) {
    setSettings((prev) =>
      prev ? { ...prev, default_payment_terms: prev.default_payment_terms.map((t, i) => (i === index ? { ...t, ...patch } : t)) } : prev
    );
  }

  function addDefaultTerm() {
    setSettings((prev) => (prev ? { ...prev, default_payment_terms: [...prev.default_payment_terms, { label: "", percentage: 0 }] } : prev));
  }

  function removeDefaultTerm(index: number) {
    setSettings((prev) => (prev ? { ...prev, default_payment_terms: prev.default_payment_terms.filter((_, i) => i !== index) } : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setError(null);
    setSaving(true);
    try {
      await updateQuoteSettings(settings);
      onSaved();
    } catch {
      setError("Impossible d'enregistrer les paramètres.");
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

      <p className="text-xs text-neutral-500">
        Ces textes apparaissent sur le PDF de chaque devis (adresse, moyens de paiement, échéances par défaut, mention légale).
      </p>

      <label className="block">
        <span className={labelClass}>Adresse</span>
        <textarea
          value={settings.company_address}
          onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
          rows={2}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Téléphone</span>
          <input
            value={settings.company_phone}
            onChange={(e) => setSettings({ ...settings, company_phone: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Email</span>
          <input
            value={settings.company_email}
            onChange={(e) => setSettings({ ...settings, company_email: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      <StampUploadField
        value={settings.company_stamp_url}
        onChange={(url) => setSettings({ ...settings, company_stamp_url: url })}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={labelClass}>Moyens de paiement</span>
          <button type="button" onClick={addMethod} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="size-3.5" /> Ajouter
          </button>
        </div>
        <div className="space-y-2">
          {settings.payment_methods.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={m.label} onChange={(e) => updateMethod(i, e.target.value)} className={inputClass} />
              <button type="button" onClick={() => removeMethod(i)} className="text-neutral-400 hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={labelClass}>Échéances de paiement par défaut</span>
          <button type="button" onClick={addDefaultTerm} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="size-3.5" /> Ajouter
          </button>
        </div>
        <div className="space-y-2">
          {settings.default_payment_terms.map((term, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <input
                value={term.label}
                onChange={(e) => updateDefaultTerm(i, { label: e.target.value })}
                className={`${inputClass} col-span-8`}
              />
              <input
                type="number"
                value={term.percentage}
                onChange={(e) => updateDefaultTerm(i, { percentage: Number(e.target.value) })}
                className={`${inputClass} col-span-3`}
              />
              <button
                type="button"
                onClick={() => removeDefaultTerm(i)}
                className="col-span-1 flex justify-center text-neutral-400 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <label className="block">
        <span className={labelClass}>Mention légale (bas de page)</span>
        <textarea
          value={settings.footer_note}
          onChange={(e) => setSettings({ ...settings, footer_note: e.target.value })}
          rows={3}
          className={inputClass}
        />
      </label>

      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
