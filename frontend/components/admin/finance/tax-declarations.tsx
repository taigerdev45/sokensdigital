"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { useAuth } from "@/lib/auth/auth-context";
import {
  downloadFecExport,
  generateTaxDeclaration,
  listAccountingPeriods,
  listTaxDeclarations,
  validateTaxDeclaration,
} from "@/lib/api/finance";
import type { AccountingPeriod, TaxDeclaration } from "@/lib/api/types";

export function TaxDeclarations() {
  const { profile } = useAuth();
  const [declarations, setDeclarations] = useState<TaxDeclaration[] | null>(null);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const canValidate = profile?.role === "DIRECTEUR_FINANCIER" || profile?.role === "SUPER_ADMIN";

  async function load() {
    try {
      const [declRes, periodRes] = await Promise.all([listTaxDeclarations(), listAccountingPeriods()]);
      setDeclarations(declRes.results);
      setPeriods(periodRes.results);
    } catch {
      setError("Impossible de charger les déclarations de TVA.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleValidate(id: string) {
    setActingId(id);
    try {
      await validateTaxDeclaration(id);
      await load();
    } finally {
      setActingId(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!declarations) {
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
          <h1 className="text-2xl font-semibold text-neutral-900">Fiscalité — TVA</h1>
          <p className="text-sm text-neutral-500">
            Génération des déclarations de TVA (brouillon) et export du Fichier des Écritures Comptables (FEC).
          </p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button data-tour="module-finance-tva" className="gap-1.5 rounded-full px-4">
                <Plus className="size-4" /> Générer une déclaration
              </Button>
            }
          />
          <SheetContent title="Générer une déclaration de TVA">
            <GenerateForm periods={periods} onSaved={() => { setOpen(false); load(); }} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Période</th>
              <th className="px-4 py-3 font-medium">TVA collectée</th>
              <th className="px-4 py-3 font-medium">TVA déductible</th>
              <th className="px-4 py-3 font-medium">Net</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {declarations.map((decl) => (
              <tr key={decl.id}>
                <td className="px-4 py-3 text-neutral-900">{decl.period_label}</td>
                <td className="px-4 py-3 text-neutral-700">{decl.collected_vat} €</td>
                <td className="px-4 py-3 text-neutral-700">{decl.deductible_vat} €</td>
                <td className="px-4 py-3 text-neutral-900">{decl.net_vat} €</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    decl.status === "VALIDEE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {decl.status === "VALIDEE" ? "Validée (signée)" : "Brouillon"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {canValidate && decl.status === "BROUILLON" && (
                      <button
                        disabled={actingId === decl.id}
                        onClick={() => handleValidate(decl.id)}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary disabled:opacity-40"
                      >
                        Valider (signer)
                      </button>
                    )}
                    <button
                      onClick={() => downloadFecExport(decl.period, decl.period_label)}
                      className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700"
                    >
                      <Download className="size-3" /> FEC
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {declarations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Aucune déclaration pour l&apos;instant.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GenerateForm({ periods, onSaved }: { periods: AccountingPeriod[]; onSaved: () => void }) {
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await generateTaxDeclaration(periodId);
      onSaved();
    } catch {
      setError("Impossible de générer la déclaration.");
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
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className={inputClass} required>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <p className="text-xs text-neutral-400">
        Recalcule la TVA collectée (compte 4457) et déductible (compte 4456) à partir du Grand Livre de la période.
      </p>
      <div className="flex items-center justify-between pt-2">
        <SheetClose render={<Button type="button" variant="outline" className="rounded-full px-4">Annuler</Button>} />
        <Button type="submit" disabled={saving || !periodId} className="rounded-full px-5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Générer"}
        </Button>
      </div>
    </form>
  );
}
