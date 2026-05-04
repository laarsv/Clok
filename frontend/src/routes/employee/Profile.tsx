import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import MonthDownloads from "../../components/MonthDownloads";
import { api, type NotificationSettings, type Role, type User } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";

function TestEmailPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    dev_mode: boolean; success: boolean; sent_to: string; from_address: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null); setResult(null); setBusy(true);
    try {
      const r = await api.sendTestEmail();
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="muted small">
        Schickt eine Test-Mail an deine eigene Adresse über die echte
        Resend-Pipeline. Nützlich, um zu prüfen, ob DKIM/SPF und der
        API-Key richtig sitzen.
      </p>
      <button onClick={send} disabled={busy}>
        {busy ? "Sende…" : "Test-Mail senden"}
      </button>
      {error && <div className="error" style={{ marginTop: "0.75rem" }}>{error}</div>}
      {result && (
        <div className={`issue ${result.success ? "" : "warning"}`} style={{ marginTop: "0.75rem" }}>
          {result.dev_mode ? (
            <>
              <strong>Dev-Modus aktiv.</strong> Mail wurde nicht versendet,
              sondern ins Backend-Log geschrieben (RESEND_API_KEY ist leer).
              Inhalt findest du mit <code>docker compose logs backend | grep email-dev-mode</code>.
            </>
          ) : result.success ? (
            <>
              <strong>Mail abgeschickt.</strong> Empfänger {result.sent_to},
              Absender <code>{result.from_address}</code>. Schau ins Postfach –
              wenn nichts ankommt, prüf Spam und das Resend-Dashboard.
            </>
          ) : (
            <>
              <strong>Resend-Fehler.</strong> Die API hat das Senden abgelehnt
              (z. B. Domain nicht verifiziert). Details im Backend-Log:
              <code>docker compose logs backend | grep Resend</code>.
            </>
          )}
        </div>
      )}
    </div>
  );
}


function ChangePasswordPanel() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null); setDone(false);
    if (newPw.length < 8) { setError("Neues Passwort muss mindestens 8 Zeichen haben."); return; }
    if (newPw !== newPw2) { setError("Passwörter stimmen nicht überein."); return; }
    setBusy(true);
    try {
      await api.changePassword(oldPw, newPw);
      setOldPw(""); setNewPw(""); setNewPw2("");
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="muted small">
        Du kennst dein aktuelles Passwort? Hier kannst du es ändern. Falls
        nicht, abmelden und auf der Login-Seite „Passwort vergessen?" nutzen.
      </p>
      <div className="manual-grid">
        <label>Aktuelles Passwort
          <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
        </label>
        <label>Neues Passwort
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </label>
        <label>Wiederholen
          <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      {done && <div className="muted">Passwort geändert.</div>}
      <button onClick={submit} disabled={busy || !oldPw || !newPw}>
        {busy ? "Speichere…" : "Passwort ändern"}
      </button>
    </div>
  );
}

const NOTIF_LABEL: Record<keyof NotificationSettings, string> = {
  reminder_no_entry: "Erinnerung, wenn ich zwei Tage keine Zeit eingetragen habe",
  reminder_remaining_vacation: "Erinnerung an Resturlaub im Jahresendspurt",
  vacation_decided: "Wenn mein Urlaubsantrag entschieden wurde",
  incoming_vacation_request: "Wenn ein Mitarbeiter Urlaub beantragt",
  incoming_sick_note: "Wenn ein Mitarbeiter sich krank meldet",
  month_complete: "Wenn ein Mitarbeiter den letzten Werktag getrackt hat",
};

const TOGGLES_FOR_ROLE: Record<Role, (keyof NotificationSettings)[]> = {
  admin: [],
  employer: ["incoming_vacation_request", "incoming_sick_note", "month_complete"],
  employee: ["reminder_no_entry", "reminder_remaining_vacation", "vacation_decided"],
};

export default function Profile() {
  const { user } = useCurrentUser();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    api.getNotificationSettings().then(setSettings);
  }, []);

  if (!user) return null;

  const toggle = async (key: keyof NotificationSettings) => {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    await api.updateNotificationSettings({ [key]: next[key] });
    setSavedNote("Gespeichert.");
    setTimeout(() => setSavedNote(null), 1500);
  };

  return (
    <Shell>
      <div className="profile">
        <h2>Profil</h2>
        <section className="card-section">
          <h3>Stammdaten</h3>
          <p className="muted">Änderungen nimmt dein Arbeitgeber/Admin vor.</p>
          <ProfileGrid user={user} />
        </section>

        <section className="card-section">
          <h3>Benachrichtigungen</h3>
          {(() => {
            const allowed = TOGGLES_FOR_ROLE[user.role];
            if (allowed.length === 0) {
              return (
                <p className="muted">
                  Als Admin bekommst du keine Status-Mails. Einladungs-Mails an
                  neue Mitarbeiter werden in jedem Fall verschickt.
                </p>
              );
            }
            if (!settings) return <div className="muted">Lade…</div>;
            return (
              <ul className="settings-list">
                {allowed.map((key) => (
                  <li key={key}>
                    <label className="toggle">
                      <input type="checkbox"
                        checked={settings[key]}
                        onChange={() => toggle(key)} />
                      <span>{NOTIF_LABEL[key]}</span>
                    </label>
                  </li>
                ))}
              </ul>
            );
          })()}
          {savedNote && <div className="muted">{savedNote}</div>}
        </section>

        <section className="card-section">
          <h3>Stundenzettel-Export</h3>
          <MonthDownloads />
        </section>

        <section className="card-section">
          <h3>Passwort ändern</h3>
          <ChangePasswordPanel />
        </section>

        {(user.role === "admin" || user.role === "employer") && (
          <section className="card-section">
            <h3>E-Mail-Test</h3>
            <TestEmailPanel />
          </section>
        )}
      </div>
    </Shell>
  );
}

function ProfileGrid({ user }: { user: User }) {
  const fields: { label: string; value: string | number | null | undefined }[] = [
    { label: "Name", value: user.full_name },
    { label: "Benutzername", value: user.username },
    { label: "E-Mail", value: user.email },
    { label: "Telefon", value: user.phone },
    { label: "Geburtsdatum", value: user.date_of_birth },
    { label: "Adresse", value: [user.address_line1, user.address_line2, user.postal_code && `${user.postal_code} ${user.city ?? ""}`, user.country].filter(Boolean).join(", ") },
    { label: "Notfallkontakt", value: [user.emergency_contact_name, user.emergency_contact_phone].filter(Boolean).join(" · ") },
    { label: "Bundesland", value: user.federal_state },
    { label: "Eintrittsdatum", value: user.hire_date },
    { label: "Wochenstunden", value: user.weekly_hours },
    { label: "Urlaubsanspruch (Tage/Jahr)", value: user.annual_vacation_days },
    { label: "Abrechnungsmodell", value: user.billing_mode === "hourly" ? "Stundenbasis" : "Festgehalt" },
    user.billing_mode === "hourly"
      ? { label: "Stundensatz (EUR)", value: user.hourly_rate_eur }
      : null,
  ].filter(Boolean) as { label: string; value: string | number | null | undefined }[];
  return (
    <div className="profile-grid">
      {fields.map((f, i) => (
        <div key={i} className="profile-field">
          <div className="muted small">{f.label}</div>
          <div>{f.value || <span className="muted">–</span>}</div>
        </div>
      ))}
    </div>
  );
}
