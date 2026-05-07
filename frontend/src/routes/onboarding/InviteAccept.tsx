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
      <div className="center">
        <div className="card">
          <img src="/clok-logo.png" alt="Clok" className="auth-logo" />
          <h2 style={{ marginTop: 0 }}>Einladung ungültig</h2>
          <p className="error">{friendly}</p>
        </div>
      </div>
    );
  }

  if (!preview) return <div className="center">Lade…</div>;

  return (
    <div className="onboarding-shell">
      <OnboardingStepper active={1} />
      <div className="card onboarding-card">
        <img src="/clok-logo.png" alt="Clok" className="auth-logo" />
        <h2>Account einrichten</h2>
        <p className="muted">
          Du wurdest eingeladen, dein Unternehmen bei Clok aufzusetzen. Leg
          hier dein Konto an. E-Mail steht fest – sie kommt aus deiner
          Einladung.
        </p>

        <label>E-Mail
          <input value={preview.email} disabled style={{ opacity: 0.7 }} />
        </label>
        <label>Voller Name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)}
            placeholder="Vor- und Nachname" />
        </label>
        <label>Username
          <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="z. B. anna.mueller" autoComplete="username" />
        </label>
        <label>Passwort (mind. 12 Zeichen)
          <input type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" />
          <span className="muted small">{password.length}/12</span>
        </label>
        <label>Passwort wiederholen
          <input type="password" value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password" />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)} />
          <span>Ich akzeptiere die Datenschutz- und Nutzungsbedingungen.</span>
        </label>

        {submitError && <div className="error">{submitError}</div>}
        <button onClick={submit} disabled={busy} style={{ marginTop: "0.6rem" }}>
          {busy ? "Lege Konto an…" : "Konto anlegen und weiter"}
        </button>
      </div>
    </div>
  );
}
