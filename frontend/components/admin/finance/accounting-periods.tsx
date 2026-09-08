"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, Plus, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import {
  closeAccountingPeriod,
  createAccountingPeriod,
  listAccountingPeriods,
  reopenAccountingPeriod,
} from "@/lib/api/finance";
import type { AccountingPeriod } from "@/lib/api/types";

export function AccountingPeriods() {
  const [periods, setPeriods] = useState<AccountingPeriod[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await listAccountingPeriods();
      setPeriods(res.results);
    } catch {
      setError("Impossible de charger les périodes comptables.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(period: AccountingPeriod) {
    setActingId(period.id);
    try {
      if (period.status === "OUVERTE") await closeAccountingPeriod(period.id);
      else await reopenAccountingPeriod(period.id);
      await load();
    } finally {
      setActingId(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!periods) {
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
          <h1 className="text-2xl font-semibold text-neutral-900">Clôture comptable</h1>
          <p className="text-sm text-neutral-500">
            Ouverture et verrouillage définitif des exercices/périodes de saisie.
          </p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button data-tour="module-finance-cloture" className="gap-1.5 rounded-full px-4">
                <Plus className="size-4" /> Nouvelle période
              </Button>
            }
          />
          <SheetContent title="Nouvelle période comptable">
            <PeriodForm onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Période</th>
              <th className="px-4 py-3 font-medium">Dates</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {periods.map((period) => (
              <tr key={period.id}>
                <td className="px-4 py-3 text-neutral-900">{period.label}</td>
                <td className="px-4 py-3 text-neutral-500">{period.start_date} → {period.end_date}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      period.status === "OUVERTE" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {period.status === "OUVERTE" ? "Ouverte" : "Clôturée"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    disabled={actingId === period.id}
                    onClick={() => toggle(period)}
                    className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 disabled:opacity-40"
                  >
                    {period.status === "OUVERTE" ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                    {period.status === "OUVERTE" ? "Clôturer" : "Rouvrir"}
                  </button>
                </td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Aucune période créée pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeriodForm({ onSaved }: { onSaved: () => void }) {
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createAccountingPeriod({ label, start_date: startDate, end_date: endDate });
      onSaved();
    } catch {
      setError("Impossible de créer la période — vérifie les dates et l'unicité du label.");
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
        <span className={labelClass}>Label</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2026-07" className={inputClass} required />
      </label>
      <label className="block">
        <span className={labelClass}>Date de début</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} required />
      </label>
      <label className="block">
        <span className={labelClass}>Date de fin</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} required />
      </label>
      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Créer"}
        </Button>
      </div>
    </form>
  );
}
