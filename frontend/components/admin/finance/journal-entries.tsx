"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { createJournalEntry, listAccountingPeriods, listAccounts, listJournalEntries } from "@/lib/api/finance";
import type { Account, AccountingPeriod, JournalCode, JournalEntry } from "@/lib/api/types";

const JOURNAL_LABELS: Record<JournalCode, string> = {
  VE: "Ventes", AC: "Achats", BQ: "Banque", OD: "Opérations diverses",
};

type LineDraft = { account: string; label: string; debit: string; credit: string };

export function JournalEntries() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      const [entriesRes, periodsRes, accountsRes] = await Promise.all([
        listJournalEntries(), listAccountingPeriods(), listAccounts(),
      ]);
      setEntries(entriesRes.results);
      setPeriods(periodsRes.results);
      setAccounts(accountsRes.results);
    } catch {
      setError("Impossible de charger le Grand Livre.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!entries) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  const openPeriods = periods.filter((p) => p.status === "OUVERTE");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Grand Livre</h1>
          <p className="text-sm text-neutral-500">Écritures comptables, équilibrées débit/crédit, par période ouverte.</p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                data-tour="module-finance-grand-livre"
                className="gap-1.5 rounded-full px-4"
                disabled={openPeriods.length === 0 || accounts.length === 0}
              >
                <Plus className="size-4" /> Nouvelle écriture
              </Button>
            }
          />
          <SheetContent title="Nouvelle écriture comptable">
            <EntryForm periods={openPeriods} accounts={accounts} onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      {periods.length > 0 && openPeriods.length === 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          Aucune période comptable ouverte — crée-en une depuis Clôture comptable avant de saisir une écriture.
        </p>
      )}

      <div className="space-y-4">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">{entry.label}</p>
                <p className="text-xs text-neutral-400">{JOURNAL_LABELS[entry.journal_code]} · {entry.date}</p>
              </div>
              {entry.is_locked && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">Période clôturée</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-neutral-400 uppercase">
                  <tr>
                    <th className="py-1 font-medium">Compte</th>
                    <th className="py-1 font-medium text-right">Débit</th>
                    <th className="py-1 font-medium text-right">Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line) => (
                    <tr key={line.id} className="border-t border-neutral-100">
                      <td className="py-1.5 text-neutral-700">{line.account_code} — {line.account_name}</td>
                      <td className="py-1.5 text-right text-neutral-900">{line.debit !== "0.00" ? line.debit : ""}</td>
                      <td className="py-1.5 text-right text-neutral-900">{line.credit !== "0.00" ? line.credit : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {entries.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">Aucune écriture pour l&apos;instant.</p>}
      </div>
    </div>
  );
}

function EntryForm({
  periods, accounts, onSaved,
}: { periods: AccountingPeriod[]; accounts: Account[]; onSaved: () => void }) {
  const [period, setPeriod] = useState(periods[0]?.id ?? "");
  const [journalCode, setJournalCode] = useState<JournalCode>("OD");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { account: accounts[0]?.id ?? "", label: "", debit: "", credit: "" },
    { account: accounts[0]?.id ?? "", label: "", debit: "", credit: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const balanced = lines.length >= 2 && totalDebit === totalCredit && totalDebit > 0;

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!balanced) {
      setError("L'écriture doit être équilibrée (total débit = total crédit, non nul).");
      return;
    }
    setSaving(true);
    try {
      await createJournalEntry({
        period, journal_code: journalCode, date, label,
        lines: lines.map((l) => ({ account: l.account, label: l.label, debit: l.debit || "0", credit: l.credit || "0" })),
      });
      onSaved();
    } catch {
      setError("Impossible d'enregistrer l'écriture.");
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
        <span className={labelClass}>Période</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputClass} required>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Journal</span>
          <select value={journalCode} onChange={(e) => setJournalCode(e.target.value as JournalCode)} className={inputClass}>
            {Object.entries(JOURNAL_LABELS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>Libellé</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} required />
      </label>

      <div className="space-y-2">
        <span className={labelClass}>Lignes</span>
        {lines.map((line, index) => (
          <div key={index} className="flex items-end gap-2">
            <select
              value={line.account}
              onChange={(e) => updateLine(index, { account: e.target.value })}
              className={`${inputClass} flex-1`}
            >
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
            <input
              type="number" step="0.01" placeholder="Débit" value={line.debit}
              onChange={(e) => updateLine(index, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
              className={`${inputClass} w-24`}
            />
            <input
              type="number" step="0.01" placeholder="Crédit" value={line.credit}
              onChange={(e) => updateLine(index, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
              className={`${inputClass} w-24`}
            />
            {lines.length > 2 && (
              <button type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))} className="p-2 text-neutral-400 hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, { account: accounts[0]?.id ?? "", label: "", debit: "", credit: "" }])}
          className="text-xs text-primary hover:underline"
        >
          + Ajouter une ligne
        </button>
        <p className={`text-xs ${balanced ? "text-emerald-600" : "text-neutral-400"}`}>
          Débit: {totalDebit.toFixed(2)} — Crédit: {totalCredit.toFixed(2)}
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving || !balanced} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
