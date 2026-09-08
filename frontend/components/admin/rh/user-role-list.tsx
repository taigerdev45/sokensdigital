"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MoreHorizontal, ShieldCheck, Search } from "lucide-react";
import { listUsers, listDepartments } from "@/lib/api/hr";
import { listProfiles } from "@/lib/firebase/profile";
import type { Department, UserBrief } from "@/lib/api/types";
import type { Profile } from "@/lib/firebase/types";
import { ROLE_LABELS, type AppRole } from "@/lib/firebase/types";
import { AddEmployeeSheet } from "@/components/admin/rh/add-employee-sheet";
import { UserEditModal } from "@/components/admin/rh/user-edit-modal";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface MergedUser {
  djangoId: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: AppRole | null;
  departmentId: string | null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

export function UserRoleList() {
  const [rows, setRows] = useState<MergedUser[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    try {
      const [usersRes, profiles, deptRes] = await Promise.all([
        listUsers(),
        listProfiles(),
        listDepartments(),
      ]);
      setDepartments(deptRes.results);

      const profileByEmail = new Map<string, Profile>(
        profiles.map((p) => [p.email.toLowerCase(), p])
      );
      const merged = usersRes.results.map((u: UserBrief) => {
        const profile = profileByEmail.get(u.email.toLowerCase());
        return {
          djangoId: u.id,
          firstName: u.first_name,
          lastName: u.last_name,
          name: `${u.first_name} ${u.last_name}`.trim(),
          email: u.email,
          avatarUrl: profile?.avatarUrl ?? u.avatar_url ?? null,
          role: profile?.role ?? null,
          departmentId: profile?.departmentId ?? null,
        };
      });
      setRows(merged);
    } catch {
      setError("Impossible de charger les utilisateurs.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const departmentNameById = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments]
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(q));
  }, [rows, search]);

  const unprovisionedCount = rows?.filter((r) => !r.role).length ?? 0;

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-neutral-900">Utilisateurs &amp; Rôles</h1>
          <p className="mt-1.5 max-w-xl text-sm text-neutral-500">
            Le rôle et le département déterminent ce que chaque personne peut voir et faire. Toute modification est
            enregistrée dans l&apos;Audit Log.
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary">
          <ShieldCheck className="size-3.5" /> Réservé au Super-Admin
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3.5">
          <div className="flex max-w-[320px] flex-1 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
            <Search className="size-3.5 shrink-0 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un utilisateur"
              className="w-full min-w-0 border-0 bg-transparent text-sm text-neutral-700 outline-none placeholder:text-neutral-400"
            />
          </div>
          <span className="flex-1" />
          {unprovisionedCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-neutral-500">
              <span className="size-1.5 rounded-full bg-destructive" />
              {unprovisionedCount} compte{unprovisionedCount !== 1 ? "s" : ""} non provisionné{unprovisionedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
              <tr>
                <th className="px-5 py-3">Utilisateur</th>
                <th className="px-5 py-3">Rôle</th>
                <th className="px-5 py-3">Département</th>
                <th className="w-9 px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((row, index) => (
                <tr key={row.djangoId} data-tour={index === 0 ? "module-rh-utilisateurs" : undefined}>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-600">
                        {row.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL, not a local/optimizable asset
                          <img src={row.avatarUrl} alt="" className="size-full object-cover" />
                        ) : (
                          initials(row.name || row.email)
                        )}
                      </span>
                      <span>
                        <span className="block font-medium text-neutral-900">{row.name || "—"}</span>
                        <span className="block text-xs text-neutral-400">{row.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {row.role ? (
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                        {ROLE_LABELS[row.role]}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-neutral-500">
                    {row.departmentId ? departmentNameById.get(row.departmentId) ?? "—" : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    {row.role ? (
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
                        <PopoverContent className="w-40 p-1" align="end">
                          <UserEditModal
                            user={row}
                            onSaved={load}
                            trigger={
                              <button
                                type="button"
                                className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                              >
                                Modifier l&apos;utilisateur
                              </button>
                            }
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <AddEmployeeSheet
                        onCreated={load}
                        initialIdentity={{ firstName: row.firstName, lastName: row.lastName, email: row.email }}
                        trigger={
                          <button
                            type="button"
                            className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white hover:bg-neutral-700"
                          >
                            Provisionner
                          </button>
                        }
                      />
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                    {rows.length === 0 ? "Aucun utilisateur pour l'instant." : "Aucun résultat."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
