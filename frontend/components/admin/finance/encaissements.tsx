"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ArrowDownToLine } from "lucide-react";
import { inputClass, labelClass } from "@/components/admin/form-styles";
import { formatFcfa } from "@/lib/format-currency";
import { getEncaissements } from "@/lib/api/finance";
import type { EncaissementOrigin, EncaissementsResponse } from "@/lib/api/types";

const ORIGIN_COLORS: Record<EncaissementOrigin, string> = {
  CAISSE: "bg-amber-100 text-amber-700",
  BANQUE: "bg-primary/10 text-primary",
  VERSEMENT: "bg-emerald-100 text-emerald-700",
};

/** Premier jour du mois courant / aujourd'hui — la période par défaut la
 * plus utile pour un rapprochement, plutôt que "tout depuis le début" qui
 * ne veut rien dire une fois quelques centaines d'écritures accumulées. */
function defaultRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(now) };
}

export function Encaissements() {
  const initial = defaultRange();
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [data, setData] = useState<EncaissementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getEncaissements({ date_from: dateFrom, date_to: dateTo }));
    } catch {
      setError("Impossible de charger les encaissements.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Encaissements</h1>
        <p className="text-sm text-neutral-500">
          Toutes les entrées d&apos;argent de l&apos;entreprise, quelle que soit leur porte
          d&apos;entrée : espèces en caisse, crédits bancaires et versements clients.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className={labelClass}>Du</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Au</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
        </label>
        {loading && <Loader2 className="mb-2.5 size-4 animate-spin text-neutral-400" />}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <>
          {data.scope === "caisse" && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              Vous voyez uniquement les encaissements de caisse. La banque et les versements
              clients relèvent de la Direction Financière.
            </p>
          )}

          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Total encaissé" value={data.total} highlight />
            {(Object.keys(ORIGIN_COLORS) as EncaissementOrigin[]).map((origin) =>
              data.totals_by_origin[origin] ? (
                <SummaryCard key={origin} label={ORIGIN_LABELS[origin]} value={data.totals_by_origin[origin]!} />
              ) : null
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Origine</th>
                  <th className="px-4 py-3 font-medium">Référence</th>
                  <th className="px-4 py-3 font-medium">Motif</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Rapproché</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.results.map((row) => (
                  <tr key={`${row.origin}-${row.id}`}>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${ORIGIN_COLORS[row.origin]}`}>
                        {row.origin_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500">{row.reference || "—"}</td>
                    <td className="px-4 py-3">
                      <p className="text-neutral-700">{row.label}</p>
                      {row.description && (
                        <p className="max-w-xs truncate text-xs text-neutral-400">{row.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-emerald-700">+{formatFcfa(row.amount)}</td>
                    <td className="px-4 py-3 text-neutral-500">{row.date}</td>
                    <td className="px-4 py-3">
                      {row.reconciled ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Oui</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">En attente</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.results.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                      Aucun encaissement sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const ORIGIN_LABELS: Record<EncaissementOrigin, string> = {
  CAISSE: "Caisse",
  BANQUE: "Banque",
  VERSEMENT: "Versements clients",
};

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-primary/30 bg-primary/5" : "border-neutral-200 bg-white"}`}>
      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        <ArrowDownToLine className="size-3.5" />
        {label}
      </div>
      <p className={`mt-1 font-mono text-lg ${highlight ? "text-primary" : "text-neutral-900"}`}>
        {formatFcfa(value)}
      </p>
    </div>
  );
}
