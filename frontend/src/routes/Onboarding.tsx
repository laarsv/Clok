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
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="card p-6 sm:p-8">
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!preview) return <div className="p-12 text-center text-ink/50">Lade…</div>;

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="card p-6 text-center sm:p-8">
          <p>Alles gespeichert. Du wirst gleich zum Login weitergeleitet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-black tracking-tight">Willkommen!</h1>
        <p className="mt-2 text-sm text-ink/60">
          Hi {(preview.full_name || preview.username).split(" ")[0]} – {preview.employer_name ?? "Dein Arbeitgeber"} hat dich
          angelegt. Setz hier dein Passwort und ergänze deine Stammdaten.
        </p>
        <p className="mt-1 text-sm text-ink/60">
          Login-Username: <code>{preview.username}</code> · E-Mail: {preview.email}
        </p>

        <h2 className="mt-6 text-lg font-black tracking-tight">Passwort</h2>
        <div className="mt-3 space-y-4">
          <label className="block">
            <span className="field-label">Neues Passwort</span>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Wiederholen</span>
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
        </div>

        <h2 className="mt-6 text-lg font-black tracking-tight">Stammdaten</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Voller Name</span>
            <input className="input" value={data.full_name ?? preview.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Geburtsdatum</span>
            <input className="input" type="date" value={data.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Telefon</span>
            <input className="input" value={data.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">SV-Nummer</span>
            <input className="input" value={data.social_security_number ?? ""} onChange={(e) => set("social_security_number", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">IBAN</span>
            <input className="input" value={data.iban ?? ""} onChange={(e) => set("iban", e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Adresse</span>
            <input className="input" value={data.address_line1 ?? ""} onChange={(e) => set("address_line1", e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Adresszusatz</span>
            <input className="input" value={data.address_line2 ?? ""} onChange={(e) => set("address_line2", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">PLZ</span>
            <input className="input" value={data.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Ort</span>
            <input className="input" value={data.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Notfallkontakt Name</span>
            <input className="input" value={data.emergency_contact_name ?? ""} onChange={(e) => set("emergency_contact_name", e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Notfallkontakt Telefon</span>
            <input className="input" value={data.emergency_contact_phone ?? ""} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        )}
        <button onClick={submit} disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? "Speichere…" : "Konto einrichten"}
        </button>
      </div>
    </div>
  );
}
