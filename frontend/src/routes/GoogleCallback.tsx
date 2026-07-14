import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { homeForRole, useCurrentUser } from "../auth/CurrentUser";

// Fehlercodes aus dem Backend-Redirect (#error=…) → lesbare Hinweise.
const ERRORS: Record<string, string> = {
  wrong_domain: "Nur Konten der zugelassenen Google-Workspace-Domain dürfen sich anmelden.",
  no_account: "Für diese Google-Adresse existiert noch kein Clok-Konto. Bitte an deinen Arbeitgeber wenden.",
  email_unverified: "Deine Google-E-Mail ist nicht verifiziert.",
  bad_state: "Die Anmeldung ist abgelaufen. Bitte erneut versuchen.",
  jit_misconfigured: "Automatische Kontoanlage ist nicht korrekt eingerichtet. Bitte an den Admin wenden.",
  exchange_failed: "Anmeldung bei Google fehlgeschlagen.",
  access_denied: "Anmeldung bei Google abgebrochen.",
  server: "Unerwarteter Fehler bei der Anmeldung.",
};

/** Landeseite nach dem Google-Redirect: liest JWT bzw. Fehler aus dem
 *  URL-Fragment, meldet an und leitet weiter. */
export default function GoogleCallback() {
  const navigate = useNavigate();
  const { setUser } = useCurrentUser();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("token");
    const err = params.get("error");
    // Fragment sofort aus der Adresszeile entfernen (Token nicht in History).
    window.history.replaceState(null, "", window.location.pathname);

    if (err || !token) {
      setError(ERRORS[err ?? ""] ?? "Anmeldung fehlgeschlagen.");
      return;
    }
    (async () => {
      try {
        setToken(token);
        const me = await api.me();
        setUser(me);
        navigate(homeForRole(me.role), { replace: true });
      } catch {
        setToken(null);
        setError("Anmeldung fehlgeschlagen.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 text-center sm:p-8">
        {error ? (
          <>
            <h1 className="text-lg font-black text-ink">Anmeldung nicht möglich</h1>
            <p className="mt-2 text-sm text-ink/70">{error}</p>
            <a href="/login" className="btn-primary mt-5 inline-block">Zurück zum Login</a>
          </>
        ) : (
          <p className="text-sm text-ink/70">Anmeldung läuft…</p>
        )}
      </div>
    </div>
  );
}
