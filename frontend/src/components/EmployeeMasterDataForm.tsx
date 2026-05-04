import { useState } from "react";
import { api, type FederalState, type User } from "../api";

const FEDERAL_STATES: FederalState[] = [
  "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
  "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH",
];

interface Props {
  user: User;
  onSaved: (u: User) => void;
  onCancel: () => void;
}

export default function EmployeeMasterDataForm({ user, onSaved, onCancel }: Props) {
  const [data, setData] = useState({
    full_name: user.full_name ?? "",
    email: user.email,
    phone: user.phone ?? "",
    date_of_birth: user.date_of_birth ?? "",
    address_line1: user.address_line1 ?? "",
    address_line2: user.address_line2 ?? "",
    postal_code: user.postal_code ?? "",
    city: user.city ?? "",
    country: user.country ?? "DE",
    social_security_number: user.social_security_number ?? "",
    iban: user.iban ?? "",
    emergency_contact_name: user.emergency_contact_name ?? "",
    emergency_contact_phone: user.emergency_contact_phone ?? "",
    federal_state: user.federal_state ?? "",
    hire_date: user.hire_date ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload: any = {};
      for (const [k, v] of Object.entries(data)) {
        payload[k] = v === "" ? null : v;
      }
      const updated = await api.updateEmployee(user.id, payload);
      onSaved(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof data, v: string) => setData({ ...data, [k]: v });

  return (
    <div>
      <h3>Stammdaten bearbeiten</h3>
      <p className="muted small">
        Vertragliche Daten (Gehalt, Stunden, Urlaub) ändert man drüben im
        Vertragsverlauf, damit historische Berechnungen stabil bleiben.
      </p>
      <div className="manual-grid">
        <label>Voller Name<input value={data.full_name} onChange={(e) => set("full_name", e.target.value)} /></label>
        <label>E-Mail<input type="email" value={data.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label>Telefon<input value={data.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label>Geburtsdatum<input type="date" value={data.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></label>
        <label>SV-Nummer<input value={data.social_security_number} onChange={(e) => set("social_security_number", e.target.value)} /></label>
        <label>IBAN<input value={data.iban} onChange={(e) => set("iban", e.target.value)} /></label>
        <label className="full">Adresse<input value={data.address_line1} onChange={(e) => set("address_line1", e.target.value)} /></label>
        <label className="full">Adresszusatz<input value={data.address_line2} onChange={(e) => set("address_line2", e.target.value)} /></label>
        <label>PLZ<input value={data.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></label>
        <label>Ort<input value={data.city} onChange={(e) => set("city", e.target.value)} /></label>
        <label>Land<input value={data.country} onChange={(e) => set("country", e.target.value)} /></label>
        <label>Bundesland
          <select value={data.federal_state} onChange={(e) => set("federal_state", e.target.value)}>
            <option value="">– bitte wählen –</option>
            {FEDERAL_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Eintrittsdatum<input type="date" value={data.hire_date} onChange={(e) => set("hire_date", e.target.value)} /></label>
        <label>Notfallkontakt Name<input value={data.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></label>
        <label>Notfallkontakt Telefon<input value={data.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row-actions">
        <button onClick={submit} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
