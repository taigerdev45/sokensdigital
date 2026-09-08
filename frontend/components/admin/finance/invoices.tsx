"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { createInvoice, listInvoices, validateInvoice } from "@/lib/api/finance";
import { InvoicePayments } from "@/components/admin/finance/invoice-payments";
import { formatFcfa } from "@/lib/format-currency";
import type { Invoice } from "@/lib/api/types";

export function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await listInvoices();
      setInvoices(res.results);
    } catch {
      setError("Impossible de charger les factures.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleValidate(id: string) {
    setActingId(id);
    setActionError(null);
    try {
      await validateInvoice(id);
      await load();
    } catch {
      setActionError("Validation impossible — vérifie qu'une période comptable ouverte couvre la date de facture.");
    } finally {
      setActingId(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!invoices) {
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
          <h1 className="text-2xl font-semibold text-neutral-900">Facturation</h1>
          <p className="text-sm text-neutral-500">Validation finale des factures et écriture de régularisation automatique.</p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button data-tour="module-finance-facturation" className="gap-1.5 rounded-full px-4">
                <Plus className="size-4" /> Nouvelle facture
              </Button>
            }
          />
          <SheetContent title="Nouvelle facture (brouillon)">
            <InvoiceForm onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      {actionError && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
          {actionError}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">N°</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Montant TTC</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="w-32 px-4 py-3 font-medium">Versements</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {invoices.map((invoice) => (
              <Fragment key={invoice.id}>
              <tr>
                <td className="px-4 py-3 text-neutral-900">{invoice.invoice_number}</td>
                <td className="px-4 py-3 text-neutral-700">{invoice.client_name}</td>
                <td className="px-4 py-3 text-neutral-900">{formatFcfa(invoice.amount_ttc)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    invoice.status === "VALIDEE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {invoice.status === "VALIDEE" ? "Validée" : "Brouillon"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {invoice.status === "BROUILLON" && (
                    <button
                      disabled={actingId === invoice.id}
                      onClick={() => handleValidate(invoice.id)}
                      className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-40"
                    >
                      Valider
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId((id) => (id === invoice.id ? null : invoice.id))}
                    className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
                  >
                    <ChevronDown
                      className={`size-3.5 transition-transform ${expandedId === invoice.id ? "rotate-180" : ""}`}
                    />
                    {expandedId === invoice.id ? "Masquer" : "Voir"}
                  </button>
                </td>
              </tr>
              {expandedId === invoice.id && (
                <tr>
                  <td colSpan={6} className="bg-neutral-50/60 px-4 py-5">
                    <InvoicePayments invoice={invoice} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Aucune facture pour l&apos;instant.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceForm({ onSaved }: { onSaved: () => void }) {
  const [clientName, setClientName] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [amountHt, setAmountHt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createInvoice({
        client_name: clientName, issue_date: issueDate,
        due_date: dueDate || null, amount_ht: amountHt,
      });
      onSaved();
    } catch {
      setError("Impossible de créer la facture.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">{error}</p>
      )}
      <label className="block">
        <span className={labelClass}>Client</span>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputClass} required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Date d&apos;émission</span>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputClass} required />
        </label>
        <label className="block">
          <span className={labelClass}>Échéance</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Montant HT</span>
        <input type="number" step="0.01" value={amountHt} onChange={(e) => setAmountHt(e.target.value)} className={inputClass} required />
      </label>
      <p className="text-xs text-neutral-400">
        TVA appliquée à 18 % (taux provisoire — non confirmé par la direction financière).
      </p>
      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
        </Button>
      </div>
    </form>
  );
}
