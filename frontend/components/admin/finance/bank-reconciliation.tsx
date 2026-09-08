"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import {
  getBankTransactionSuggestions,
  importBankStatement,
  listBankImports,
  matchBankTransaction,
} from "@/lib/api/finance";
import type { BankStatementImport, TransactionLine } from "@/lib/api/types";

type RowDraft = { date: string; label: string; amount: string };

export function BankReconciliation() {
  const [imports, setImports] = useState<BankStatementImport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [suggestionsFor, setSuggestionsFor] = useState<{ importId: string; transactionId: string } | null>(null);
  const [suggestions, setSuggestions] = useState<TransactionLine[]>([]);
  const [matching, setMatching] = useState(false);

  async function load() {
    try {
      const res = await listBankImports();
      setImports(res.results);
    } catch {
      setError("Impossible de charger les relevés bancaires.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openSuggestions(importId: string, transactionId: string) {
    setSuggestionsFor({ importId, transactionId });
    setSuggestions(await getBankTransactionSuggestions(importId, transactionId));
  }

  async function handleMatch(lineId: string) {
    if (!suggestionsFor) return;
    setMatching(true);
    try {
      await matchBankTransaction(suggestionsFor.importId, suggestionsFor.transactionId, lineId);
      setSuggestionsFor(null);
      await load();
    } finally {
      setMatching(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!imports) {
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
          <h1 className="text-2xl font-semibold text-neutral-900">Rapprochement bancaire</h1>
          <p className="text-sm text-neutral-500">Import de relevé + lettrage manuel/semi-automatique avec le Grand Livre.</p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button data-tour="module-finance-rapprochement" className="gap-1.5 rounded-full px-4">
                <Plus className="size-4" /> Importer un relevé
              </Button>
            }
          />
          <SheetContent title="Importer des transactions bancaires">
            <ImportForm onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="space-y-4">
        {imports.map((imp) => (
          <div key={imp.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-medium text-neutral-900">{imp.filename}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-neutral-400 uppercase">
                  <tr>
                    <th className="py-1 font-medium">Date</th>
                    <th className="py-1 font-medium">Libellé</th>
                    <th className="py-1 font-medium text-right">Montant</th>
                    <th className="py-1 font-medium">Statut</th>
                    <th className="py-1 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {imp.transactions.map((tx) => (
                    <tr key={tx.id} className="border-t border-neutral-100">
                      <td className="py-1.5 text-neutral-700">{tx.date}</td>
                      <td className="py-1.5 text-neutral-700">{tx.label}</td>
                      <td className="py-1.5 text-right text-neutral-900">{tx.amount}</td>
                      <td className="py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          tx.status === "LETTRE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {tx.status === "LETTRE" ? "Lettré" : "Non lettré"}
                        </span>
                      </td>
                      <td className="py-1.5">
                        {tx.status === "NON_LETTRE" && (
                          <button
                            onClick={() => openSuggestions(imp.id, tx.id)}
                            className="text-xs text-primary hover:underline"
                          >
                            Lettrer…
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {imports.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">Aucun import pour l&apos;instant.</p>}
      </div>

      <Sheet open={!!suggestionsFor} onOpenChange={(v) => !v && setSuggestionsFor(null)}>
        <SheetContent title="Suggestions de lettrage">
          <div className="space-y-2">
            {suggestions.length === 0 && (
              <p className="text-sm text-neutral-400">Aucune ligne du Grand Livre (compte 512) ne correspond à ce montant.</p>
            )}
            {suggestions.map((line) => (
              <button
                key={line.id}
                disabled={matching}
                onClick={() => handleMatch(line.id)}
                className="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-3.5 py-2.5 text-left text-sm hover:border-primary/50 disabled:opacity-40"
              >
                <span className="text-neutral-700">{line.account_code} — {line.label || line.account_name}</span>
                <span className="text-neutral-900">{line.debit !== "0.00" ? line.debit : line.credit}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ImportForm({ onSaved }: { onSaved: () => void }) {
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<RowDraft[]>([{ date: "", label: "", amount: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateRow(index: number, patch: Partial<RowDraft>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await importBankStatement({ filename, rows });
      onSaved();
    } catch {
      setError("Impossible d'importer les transactions.");
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
        <span className={labelClass}>Nom du relevé</span>
        <input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="releve-juillet.csv" className={inputClass} required />
      </label>

      <div className="space-y-2">
        <span className={labelClass}>Transactions</span>
        {rows.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <input type="date" value={row.date} onChange={(e) => updateRow(index, { date: e.target.value })} className={`${inputClass} w-32`} required />
            <input placeholder="Libellé" value={row.label} onChange={(e) => updateRow(index, { label: e.target.value })} className={`${inputClass} flex-1`} required />
            <input type="number" step="0.01" placeholder="Montant" value={row.amount} onChange={(e) => updateRow(index, { amount: e.target.value })} className={`${inputClass} w-28`} required />
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} className="p-2 text-neutral-400 hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setRows((prev) => [...prev, { date: "", label: "", amount: "" }])} className="text-xs text-primary hover:underline">
          + Ajouter une ligne
        </button>
      </div>

      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Importer"}
        </Button>
      </div>
    </form>
  );
}
