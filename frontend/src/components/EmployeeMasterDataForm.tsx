import { useEffect, useState } from "react";
import Button from "./ui/Button";
import Select from "./ui/Select";
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
      <h3 className="text-lg font-black">Stammdaten bearbeiten</h3>
      {isEmployee && selfEdit && (
        <p className="mt-2 text-sm text-ink/60">
          Identität, Anschrift, Lohn-Stammdaten und Notfallkontakt darfst
          du selbst pflegen. Eintrittsdatum, Bundesland und Vertragsdaten
          (Stunden, Urlaub, Gehalt) ändert dein Arbeitgeber.
        </p>
      )}
      {isEmployee && !selfEdit && (
        <p className="mt-2 text-sm text-ink/60">
          Vertragliche Daten (Gehalt, Stunden, Urlaub) liegen im
          Vertragsverlauf, damit historische Berechnungen stabil bleiben.
        </p>
      )}

      <h4 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-ink/50">Identität &amp; Kontakt</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block"><span className="field-label">Voller Name</span><input className="input" value={data.full_name} onChange={(e) => set("full_name", e.target.value)} /></label>
        <label className="block"><span className="field-label">E-Mail</span><input className="input" type="email" value={data.email} onChange={(e) => set("email", e.target.value)} /></label>
        <label className="block"><span className="field-label">Telefon</span><input className="input" value={data.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="block"><span className="field-label">Geburtsdatum</span><input className="input" type="date" value={data.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></label>
      </div>

      {isEmployee && (
        <>
          <h4 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-ink/50">Anschrift</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="field-label">Straße</span><input className="input" value={data.address_line1} onChange={(e) => set("address_line1", e.target.value)} /></label>
            <label className="block sm:col-span-2"><span className="field-label">Adresszusatz</span><input className="input" value={data.address_line2} onChange={(e) => set("address_line2", e.target.value)} /></label>
            <label className="block"><span className="field-label">PLZ</span><input className="input" value={data.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></label>
            <label className="block"><span className="field-label">Ort</span><input className="input" value={data.city} onChange={(e) => set("city", e.target.value)} /></label>
            <label className="block"><span className="field-label">Land</span><input className="input" value={data.country} onChange={(e) => set("country", e.target.value)} /></label>
          </div>

          <h4 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-ink/50">Lohn &amp; Notfall</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block"><span className="field-label">SV-Nummer</span><input className="input" value={data.social_security_number} onChange={(e) => set("social_security_number", e.target.value)} /></label>
            <label className="block"><span className="field-label">IBAN</span><input className="input" value={data.iban} onChange={(e) => set("iban", e.target.value)} /></label>
            <label className="block"><span className="field-label">Notfallkontakt Name</span><input className="input" value={data.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></label>
            <label className="block"><span className="field-label">Notfallkontakt Telefon</span><input className="input" value={data.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></label>
          </div>

          {!selfEdit && (
            <>
              <h4 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-ink/50">Beschäftigung</h4>
              <p className="mb-2 text-sm text-ink/60">
                Diese Felder darf nur der Arbeitgeber pflegen. Sie wirken
                auf Feiertags-/Soll-Berechnung – wer sie ändert, muss die
                Auswirkung auf den Vertragsverlauf bedenken.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block"><span className="field-label">Eintrittsdatum</span><input className="input" type="date" value={data.hire_date} onChange={(e) => set("hire_date", e.target.value)} /></label>
                <div>
                  <span className="field-label">Bundesland</span>
                  <Select
                    value={data.federal_state}
                    onChange={(v) => set("federal_state", v)}
                    placeholder="– bitte wählen –"
                    options={[
                      { value: "", label: "– bitte wählen –" },
                      ...FEDERAL_STATES.map((s) => ({ value: s, label: s })),
                    ]}
                    aria-label="Bundesland"
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {isEmployer && (
        <>
          <h4 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-ink/50">Firma</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="field-label">Firmenname</span><input className="input" value={data.company_name} onChange={(e) => set("company_name", e.target.value)} /></label>
            <label className="block sm:col-span-2"><span className="field-label">Straße</span><input className="input" value={data.company_address_line1} onChange={(e) => set("company_address_line1", e.target.value)} /></label>
            <label className="block sm:col-span-2"><span className="field-label">Adresszusatz</span><input className="input" value={data.company_address_line2} onChange={(e) => set("company_address_line2", e.target.value)} /></label>
            <label className="block"><span className="field-label">PLZ</span><input className="input" value={data.company_postal_code} onChange={(e) => set("company_postal_code", e.target.value)} /></label>
            <label className="block"><span className="field-label">Ort</span><input className="input" value={data.company_city} onChange={(e) => set("company_city", e.target.value)} /></label>
            <label className="block"><span className="field-label">Land</span><input className="input" value={data.company_country} onChange={(e) => set("company_country", e.target.value)} /></label>
          </div>

          <h4 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-ink/50">Personalabteilung / Ansprechpartner</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block"><span className="field-label">Name</span><input className="input" value={data.hr_contact_name} onChange={(e) => set("hr_contact_name", e.target.value)} /></label>
            <label className="block"><span className="field-label">E-Mail</span><input className="input" type="email" value={data.hr_contact_email} onChange={(e) => set("hr_contact_email", e.target.value)} /></label>
            <label className="block"><span className="field-label">Telefon</span><input className="input" value={data.hr_contact_phone} onChange={(e) => set("hr_contact_phone", e.target.value)} /></label>
          </div>
        </>
      )}

      {isAdmin && isEmployee && (
        <>
          <h4 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-ink/50">Zuordnung</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="field-label">Arbeitgeber</span>
              <Select
                value={String(supervisorId ?? "")}
                onChange={(v) => setSupervisorId(v ? parseInt(v, 10) : null)}
                placeholder="– bitte wählen –"
                options={[
                  { value: "", label: "– bitte wählen –" },
                  ...employers.map((em) => ({ value: String(em.id), label: em.full_name || em.username })),
                ]}
                aria-label="Arbeitgeber"
              />
            </div>
          </div>
        </>
      )}

      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</Button>
      </div>
    </div>
  );
}
