import { AuthProvider } from "@/lib/auth/auth-context";
import { RequireAuth } from "@/components/auth/require-auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { OnboardingProvider } from "@/lib/admin/onboarding-tour";
import { OnboardingOverlay } from "@/components/admin/onboarding-overlay";
import { ModuleTourOverlay } from "@/components/admin/module-tour-overlay";
import { MobileBottomNav } from "@/components/admin/mobile-bottom-nav";
import { ProfileModalProvider } from "@/lib/admin/profile-modal-context";
import { ProfileSheet } from "@/components/profile/profile-sheet";
import { PermissionsProvider } from "@/lib/admin/permissions-context";
import type { Viewport } from "next";

import { AdminAccessGuard } from "@/components/admin/admin-access-guard";

/* Surface claire de l'espace d'administration.
 *
 * Le fond sombre du site vitrine est posé sur `body`, et sur iOS répété sur
 * `html` pour que le rebond élastique ne laisse pas apparaître de blanc.
 * L'administration est claire : ce fond ressortait donc en bande sombre
 * partout où le contenu ne couvrait pas exactement la fenêtre — sous la
 * barre de navigation, dans la zone d'affichage sûre des téléphones, et
 * pendant le rebond de défilement.
 *
 * `min-h-dvh` sur le shell ne suffisait pas : il fixe la hauteur de l'app,
 * pas la couleur peinte derrière elle. Le navigateur étire le fond du
 * canvas — celui de `html` — sous la barre d'accueil, donc c'est la racine
 * du document qu'il faut repeindre.
 *
 * Servi comme feuille de style plutôt que posé par un effet : ce layout ne
 * rend que les routes /admin, la règle n'existe donc nulle part ailleurs,
 * et elle est présente dès le HTML initial — un effet client aurait laissé
 * un éclair sombre à chaque chargement.
 */
const ADMIN_SURFACE_CSS = `html:root, html:root body { background-color: #ffffff; }`;

/* La couleur de thème est ce dont le système peint ses propres barres :
 * barre d'état et barre de navigation Android, et les mêmes en PWA
 * installée, où l'application occupe tout l'écran. Le layout racine la
 * fixe à #0e121a pour le site vitrine, ce qui donnait une bande noire en
 * bas de l'administration sur téléphone et tablette, sous la barre de
 * l'application.
 *
 * Un viewport exporté depuis un layout imbriqué remplace celui du parent
 * pour ce segment : l'administration est claire, ses barres système aussi,
 * et la vitrine garde la sienne. */
export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <style>{ADMIN_SURFACE_CSS}</style>
      <RequireAuth>
        <PermissionsProvider>
          <OnboardingProvider>
            <ProfileModalProvider>
              <AdminShell>
                <AdminAccessGuard>{children}</AdminAccessGuard>
              </AdminShell>
              <div className="print:hidden">
                <MobileBottomNav />
                <OnboardingOverlay />
                <ModuleTourOverlay />
              </div>
              <ProfileSheet />
            </ProfileModalProvider>
          </OnboardingProvider>
        </PermissionsProvider>
      </RequireAuth>
    </AuthProvider>
  );
}
