"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, Search } from "lucide-react";
import { listEmployees, updateEmployee } from "@/lib/api/hr";
import type { EmployeeProfile } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { AddEmployeeSheet } from "@/components/admin/rh/add-employee-sheet";
import { EmployeeQuickEditModal } from "@/components/admin/rh/employee-quick-edit-modal";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatFcfa } from "@/lib/format-currency";

const CONTRACT_LABELS: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  STAGE: "Stage",
  FREELANCE: "Freelance",
};

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "?";
}

function currentContractLabel(employee: EmployeeProfile) {
  const active = employee.contracts.find((c) => c.status === "ACTIF");
  return active ? CONTRACT_LABELS[active.contract_type] ?? active.contract_type : null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}


export function EmployeeList() {
  const [employees, setEmployees] = useState<EmployeeProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"tous" | "actifs" | "inactifs">("tous");

  async function load() {
    try {
      const data = await listEmployees();
      setEmployees(data.results);
    } catch (err) {
      setError(err instanceof ApiError ? `Erreur ${err.status}` : "Erreur de chargement");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(employee: EmployeeProfile) {
    const nextStatus = employee.status === "ACTIF" ? "INACTIF" : "ACTIF";
    await updateEmployee(employee.id, { status: nextStatus });
    load();
  }

  const filtered = useMemo(() => {
    if (!employees) return [];
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (tab === "actifs" && e.status !== "ACTIF") return false;
      if (tab === "inactifs" && e.status !== "INACTIF") return false;
      if (!q) return true;
      const haystack = `${e.user.first_name} ${e.user.last_name} ${e.user.email} ${e.position}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [employees, search, tab]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!employees) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  const activeCount = employees.filter((e) => e.status === "ACTIF").length;
  const thisMonth = new Date();
  const newThisMonth = employees.filter((e) => {
    if (!e.hire_date) return false;
    const d = new Date(e.hire_date);
    return d.getFullYear() === thisMonth.getFullYear() && d.getMonth() === thisMonth.getMonth();
  }).length;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Employés</h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            {employees.length} personne{employees.length !== 1 ? "s" : ""} · {activeCount} active{activeCount !== 1 ? "s" : ""}
            {newThisMonth > 0 && ` · ${newThisMonth} arrivée${newThisMonth !== 1 ? "s" : ""} ce mois`}
          </p>
        </div>
        <AddEmployeeSheet onCreated={load} />
      </div>

      <div className="mb-5 flex items-center gap-3">
        <div className="flex max-w-[360px] flex-1 items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5">
          <Search className="size-4 shrink-0 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un employé"
            className="w-full min-w-0 border-0 bg-transparent text-sm text-neutral-700 outline-none placeholder:text-neutral-400"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-1">
          {(["tous", "actifs", "inactifs"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
                tab === t ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
            <tr>
              <th className="px-5 py-3">Employé</th>
              <th className="px-5 py-3">Poste</th>
              <th className="px-5 py-3">Contrat</th>
              <th className="px-5 py-3">Embauche</th>
              <th className="px-5 py-3 text-right">Coût horaire</th>
              <th className="px-5 py-3">Statut</th>
              <th className="w-11 px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.map((e) => {
              const contractLabel = currentContractLabel(e);
              const isActive = e.status === "ACTIF";
              return (
                <tr key={e.id} className={cn("transition-colors hover:bg-neutral-50", !isActive && "opacity-60")}>
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/rh/${e.id}`} className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
                        {e.user.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, not a local/optimizable asset
                          <img src={e.user.avatar_url} alt="" className="size-full object-cover" />
                        ) : (
                          initials(e.user.first_name, e.user.last_name)
                        )}
                      </span>
                      <span>
                        <span className="block font-medium text-neutral-900">
                          {e.user.first_name} {e.user.last_name}
                        </span>
                        <span className="block text-xs text-neutral-400">{e.user.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-neutral-600">{e.position || "—"}</td>
                  <td className="px-5 py-3.5">
                    {contractLabel ? (
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                        {contractLabel}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-neutral-500">{formatDate(e.hire_date)}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-neutral-600">{formatFcfa(e.base_hourly_cost)}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        isActive ? "bg-primary/10 text-primary" : "bg-neutral-100 text-neutral-500"
                      )}
                    >
                      <span className={cn("size-1.5 rounded-full", isActive ? "bg-primary" : "bg-neutral-300")} />
                      {isActive ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
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
                        <Link
                          href={`/admin/rh/${e.id}`}
                          className="block rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
                        >
                          Voir la fiche
                        </Link>
                        <EmployeeQuickEditModal
                          employee={e}
                          onSaved={load}
                          trigger={
                            <button
                              type="button"
                              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                            >
                              Modifier
                            </button>
                          }
                        />
                        <button
                          type="button"
                          onClick={() => toggleStatus(e)}
                          className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                        >
                          Marquer {isActive ? "inactif" : "actif"}
                        </button>
                      </PopoverContent>
                    </Popover>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  {employees.length === 0 ? "Aucun employé pour l'instant." : "Aucun résultat."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
