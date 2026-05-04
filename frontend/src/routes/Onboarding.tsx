import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type OnboardingCompletePayload, type OnboardingPreview } from "../api";

export default function Onboarding() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<OnboardingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [data, setData] = useState<OnboardingCompletePayload>({ password: "" });

  useEffect(() => {
    if (!token) return;
    api.onboardingPreview(token).then(setPreview).catch((e) => setError(e.message));
  }, [token]);

  const set = <K extends keyof OnboardingCompletePayload>(k: K, v: OnboardingCompletePayload[K]) =>
    setData({ ...data, [k]: v });

  const submit = async () => {
    setError(null);
    if (pw.length < 8) { setError("Passwort muss mindestens 8 Zeichen haben."); return; }
    if (pw !== pw2) { setError("Passwörter stimmen nicht überein."); return; }
    setBusy(true);
    try {
      await api.onboardingComplete(token!, { ...data, password: pw });
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !preview) {
    return (
      <div className="center">
        <div className="card">
          <img src="/clok-logo.png" alt="Clok" className="auth-logo" />
          <div className="error">{error}</div>
        </div>
      </div>
    );
  }

  if (!preview) return <div className="center">Lade…</div>;

  if (done) {
    return (
      <div className="center">
        <div className="card">
          <img src="/clok-logo.png" alt="Clok" className="auth-logo" />
          <p>Alles gespeichert. Du wirst gleich zum Login weitergeleitet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <div className="card" style={{ width: 560 }}>
        <img src="/clok-logo.png" alt="Clok" className="auth-logo" />
        <h2 style={{ marginTop: 0 }}>Willkommen!</h2>
        <p className="muted">
          Hi {(preview.full_name || preview.username).split(" ")[0]} – {preview.employer_name ?? "Dein Arbeitgeber"} hat dich
          angelegt. Setz hier dein Passwort und ergänze deine Stammdaten.
        </p>
        <p className="muted small">
          Login-Username: <code>{preview.username}</code> · E-Mail: {preview.email}
        </p>

        <h3 style={{ marginTop: "1.5rem" }}>Passwort</h3>
        <label>Neues Passwort<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label>Wiederholen<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>

        <h3 style={{ marginTop: "1.5rem" }}>Stammdaten</h3>
        <div className="manual-grid">
          <label>Voller Name<input value={data.full_name ?? preview.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></label>
          <label>Geburtsdatum<input type="date" value={data.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value)} /></label>
          <label>Telefon<input value={data.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></label>
          <label>SV-Nummer<input value={data.social_security_number ?? ""} onChange={(e) => set("social_security_number", e.target.value)} /></label>
          <label>IBAN<input value={data.iban ?? ""} onChange={(e) => set("iban", e.target.value)} /></label>
          <label className="full">Adresse<input value={data.address_line1 ?? ""} onChange={(e) => set("address_line1", e.target.value)} /></label>
          <label className="full">Adresszusatz<input value={data.address_line2 ?? ""} onChange={(e) => set("address_line2", e.target.value)} /></label>
          <label>PLZ<input value={data.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} /></label>
          <label>Ort<input value={data.city ?? ""} onChange={(e) => set("city", e.target.value)} /></label>
          <label>Notfallkontakt Name<input value={data.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value)} /></label>
          <label>Notfallkontakt Telefon<input value={data.emergency_contact_phone ?? ""} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></label>
        </div>

        {error && <div className="error">{error}</div>}
        <button onClick={submit} disabled={busy} style={{ marginTop: "1rem" }}>
          {busy ? "Speichere…" : "Konto einrichten"}
        </button>
      </div>
    </div>
  );
}
