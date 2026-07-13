import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, setToken, type InvitePreview } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";
import OnboardingStepper from "../../components/OnboardingStepper";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refresh } = useCurrentUser();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<number | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pw2, setPw2] = useState("");
  const [fullName, setFullName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.inviteOnboardingPreview(token)
      .then((p) => {
        setPreview(p);
        if (p.full_name) setFullName(p.full_name);
      })
      .catch((e: Error & { status?: number }) => {
        setPreviewStatus(e.status ?? null);
        setPreviewError(e.message);
      });
  }, [token]);

  const submit = async () => {
    setSubmitError(null);
    if (!USERNAME_RE.test(username)) {
      setSubmitError("Username: 3–32 Zeichen, nur a-z, 0-9, Punkt, Unter-/Bindestrich.");
      return;
    }
    if (password.length < 12) {
      setSubmitError("Passwort braucht mindestens 12 Zeichen.");
      return;
    }
    if (password !== pw2) {
      setSubmitError("Passwörter stimmen nicht überein.");
      return;
    }
    if (fullName.trim().length === 0) {
      setSubmitError("Bitte deinen vollen Namen eingeben.");
      return;
    }
    if (!acceptTerms) {
      setSubmitError("Bitte den Datenschutz-/AGB-Hinweis akzeptieren.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.inviteOnboardingAccept(token!, {
        username, password, full_name: fullName.trim(), accept_terms: true,
      });
      setToken(res.token.access_token);
      await refresh();
      navigate("/onboarding/company", { replace: true });
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (previewError) {
    const friendly =
      previewStatus === 410 ? "Diese Einladung ist nicht mehr gültig (abgelaufen oder zurückgezogen). Bitte beim Admin eine neue anfordern."
      : previewStatus === 409 ? "Diese Einladung wurde bereits eingelöst. Wenn das nicht du warst, melde dich beim Admin."
      : previewStatus === 404 ? "Diese Einladung kennen wir nicht. Bitte den Link prüfen."
      : previewError;
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-black tracking-tight">Einladung ungültig</h1>
          <p className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{friendly}</p>
        </div>
      </div>
    );
  }

  if (!preview) return <div className="p-12 text-center text-ink/50">Lade…</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <OnboardingStepper active={1} />
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight">Account einrichten</h1>
        <p className="mt-2 text-sm text-ink/60">
          Du wurdest eingeladen, dein Unternehmen bei Clok aufzusetzen. Leg
          hier dein Konto an. E-Mail steht fest – sie kommt aus deiner
          Einladung.
        </p>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="field-label">E-Mail</span>
            <input className="input disabled:opacity-70" value={preview.email} disabled />
          </label>
          <label className="block">
            <span className="field-label">Voller Name</span>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="Vor- und Nachname" />
          </label>
          <label className="block">
            <span className="field-label">Username</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="z. B. anna.mueller" autoComplete="username" />
          </label>
          <label className="block">
            <span className="field-label">Passwort (mind. 12 Zeichen)</span>
            <input className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" />
            <span className="mt-1 block text-xs text-ink/60">{password.length}/12</span>
          </label>
          <label className="block">
            <span className="field-label">Passwort wiederholen</span>
            <input className="input" type="password" value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-royal" />
            <span>Ich akzeptiere die Datenschutz- und Nutzungsbedingungen.</span>
          </label>
        </div>

        {submitError && (
          <div className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{submitError}</div>
        )}
        <button onClick={submit} disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? "Lege Konto an…" : "Konto anlegen und weiter"}
        </button>
      </div>
    </div>
  );
}
