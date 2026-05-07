import { useEffect, useState } from "react";
import { api, type FederalState, type User } from "../api";
import { useCurrentUser } from "../auth/CurrentUser";

const FEDERAL_STATES: FederalState[] = [
  "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
  "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH",
];

interface Props {
  user: User;
  onSaved: (u: User) => void;
  onCancel: () => void;
  /**
   * `selfEdit=true`: der eingeloggte User editiert sich SELBST.
   * Beschäftigungs-Felder (Eintrittsdatum, Bundesland) und alles, was
   * vertraglich ist, werden ausgeblendet – die ändert nur der
   * Arbeitgeber. Submit geht an PATCH /auth/me, das Backend hat eine
   * eigene Whitelist als Sicherheitsnetz.
   */
  selfEdit?: boolean;
}

/** Stammdaten-Bearbeitung mit rollenabhängigen Sektionen.
 *
 * - Mitarbeiter (Arbeitgeber-Edit): Identität, Privatanschrift,
 *   Lohn & Notfall, Beschäftigung.
 * - Mitarbeiter (Self-Edit): wie oben, ohne Beschäftigung.
 * - Arbeitgeber: Identität, Firmenanschrift, HR-Ansprechpartner.
 * - Admin (Self): nur Identität.
 *
 * Vertragliche Daten (Stundensatz, Wochenstunden, Urlaub) laufen über
 * den Vertragsverlauf, damit Berechnungen historisch stabil bleiben.
 */
export default function EmployeeMasterDataForm({ user, onSaved, onCancel, selfEdit = false }: Props) {
  const { user: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const [employers, setEmployers] = useState<User[]>([]);
  const [supervisorId, setSupervisorId] = useState<number | null>(user.supervisor_id ?? null);

  const role = user.role;
  const isEmployee = role === "employee";
  const isEmployer = role === "employer";

  useEffect(() => {
    if (isAdmin && isEmployee) {
      api.listEmployees(false).then((all) =>
        setEmployers(all.filter((u) => u.role === "employer")),
      );
    }
  }, [isAdmin, isEmployee]);

  const [data, setData] = useState({
    // Identität
    full_name: user.full_name ?? "",
    email: user.email,
    phone: user.phone ?? "",
    date_of_birth: user.date_of_birth ?? "",
    // Privatanschrift (Mitarbeiter)
    address_line1: user.address_line1 ?? "",
    address_line2: user.address_line2 ?? "",
    postal_code: user.postal_code ?? "",
    city: user.city ?? "",
    country: user.country ?? "DE",
    federal_state: user.federal_state ?? "",
    hire_date: user.hire_date ?? "",
    // Lohn & Notfall (Mitarbeiter)
    social_security_number: user.social_security_number ?? "",
    iban: user.iban ?? "",
    emergency_contact_name: user.emergency_contact_name ?? "",
    emergency_contact_phone: user.emergency_contact_phone ?? "",
    // Firma & HR (Arbeitgeber)
    company_name: user.company_name ?? "",
    company_address_line1: user.company_address_line1 ?? "",
    company_address_line2: user.company_address_line2 ?? "",
    company_postal_code: user.company_postal_code ?? "",
    company_city: user.company_city ?? "",
    company_country: user.company_country ?? "DE",
    hr_contact_name: user.hr_contact_name ?? "",
    hr_contact_email: user.hr_contact_email ?? "",
    hr_contact_phone: user.hr_contact_phone ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (isAdmin && isEmployee && !supervisorId) {
      setError("Mitarbeiter brauchen einen Arbeitgeber.");
      return;
    }
    setBusy(true);
    try {
      const payload: any = {};
      for (const [k, v] of Object.entries(data)) {
        // Im Self-Edit-Modus die Beschäftigungs-Felder gar nicht erst
        // mitschicken – das Backend würde sie sonst (zu Recht) mit 403
        // abweisen.
        if (selfEdit && (k === "hire_date" || k === "federal_state")) continue;
        payload[k] = v === "" ? null : v;
      }
      if (isAdmin && !selfEdit && supervisorId !== (user.supervisor_id ?? null)) {
        payload.supervisor_id = supervisorId;
      }
      const updated = selfEdit
        ? await api.updateMe(payload)
        : await api.updateEmployee(user.id, payload);
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
      {isEmployee && selfEdit && (
        <p className="muted small">
          Identität, Anschrift, Lohn-Stammdaten und Notfallkontakt darfst
          du selbst pflegen. Eintrittsdatum, Bundesland und Vertragsdaten
          (Stunden, Urlaub, Gehalt) ändert dein Arbeitgeber.
        </p>
      )}
      {isEmployee && !selfEdit && (
        <p className="muted small">
          Vertragliche Daten (Gehalt, Stunden, Urlaub) liegen im
          Vertragsverlauf, damit historische Berechnungen stabil bleiben.
        </p>
      )}

      <h4 className="form-section-h">Identität &amp; Kontakt</h4>
      <div className="manual-grid">
        <label>Voller Name<input value={data.full_name} onChange={(e) => set("full_name", e.target.value)} /></label>
        <label>E-Mail<input type="email" value={data.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label>Telefon<input value={data.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label>Geburtsdatum<input type="date" value={data.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></label>
      </div>

      {isEmployee && (
        <>
          <h4 className="form-section-h">Anschrift</h4>
          <div className="manual-grid">
            <label className="full">Straße<input value={data.address_line1} onChange={(e) => set("address_line1", e.target.value)} /></label>
            <label className="full">Adresszusatz<input value={data.address_line2} onChange={(e) => set("address_line2", e.target.value)} /></label>
            <label>PLZ<input value={data.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></label>
            <label>Ort<input value={data.city} onChange={(e) => set("city", e.target.value)} /></label>
            <label>Land<input value={data.country} onChange={(e) => set("country", e.target.value)} /></label>
          </div>

          <h4 className="form-section-h">Lohn &amp; Notfall</h4>
          <div className="manual-grid">
            <label>SV-Nummer<input value={data.social_security_number} onChange={(e) => set("social_security_number", e.target.value)} /></label>
            <label>IBAN<input value={data.iban} onChange={(e) => set("iban", e.target.value)} /></label>
            <label>Notfallkontakt Name<input value={data.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></label>
            <label>Notfallkontakt Telefon<input value={data.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></label>
          </div>

          {!selfEdit && (
            <>
              <h4 className="form-section-h">Beschäftigung</h4>
              <p className="muted small" style={{ marginTop: 0 }}>
                Diese Felder darf nur der Arbeitgeber pflegen. Sie wirken
                auf Feiertags-/Soll-Berechnung – wer sie ändert, muss die
                Auswirkung auf den Vertragsverlauf bedenken.
              </p>
              <div className="manual-grid">
                <label>Eintrittsdatum<input type="date" value={data.hire_date} onChange={(e) => set("hire_date", e.target.value)} /></label>
                <label>Bundesland
                  <select value={data.federal_state} onChange={(e) => set("federal_state", e.target.value)}>
                    <option value="">– bitte wählen –</option>
                    {FEDERAL_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}
        </>
      )}

      {isEmployer && (
        <>
          <h4 className="form-section-h">Firma</h4>
          <div className="manual-grid">
            <label className="full">Firmenname<input value={data.company_name} onChange={(e) => set("company_name", e.target.value)} /></label>
            <label className="full">Straße<input value={data.company_address_line1} onChange={(e) => set("company_address_line1", e.target.value)} /></label>
            <label className="full">Adresszusatz<input value={data.company_address_line2} onChange={(e) => set("company_address_line2", e.target.value)} /></label>
            <label>PLZ<input value={data.company_postal_code} onChange={(e) => set("company_postal_code", e.target.value)} /></label>
            <label>Ort<input value={data.company_city} onChange={(e) => set("company_city", e.target.value)} /></label>
            <label>Land<input value={data.company_country} onChange={(e) => set("company_country", e.target.value)} /></label>
          </div>

          <h4 className="form-section-h">Personalabteilung / Ansprechpartner</h4>
          <div className="manual-grid">
            <label>Name<input value={data.hr_contact_name} onChange={(e) => set("hr_contact_name", e.target.value)} /></label>
            <label>E-Mail<input type="email" value={data.hr_contact_email} onChange={(e) => set("hr_contact_email", e.target.value)} /></label>
            <label>Telefon<input value={data.hr_contact_phone} onChange={(e) => set("hr_contact_phone", e.target.value)} /></label>
          </div>
        </>
      )}

      {isAdmin && isEmployee && (
        <>
          <h4 className="form-section-h">Zuordnung</h4>
          <div className="manual-grid">
            <label className="full">Arbeitgeber
              <select value={supervisorId ?? ""}
                onChange={(e) => setSupervisorId(e.target.value ? parseInt(e.target.value, 10) : null)}>
                <option value="">– bitte wählen –</option>
                {employers.map((em) => (
                  <option key={em.id} value={em.id}>{em.full_name || em.username}</option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

      {error && <div className="error">{error}</div>}
      <div className="row-actions">
        <button onClick={submit} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
        <button onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
