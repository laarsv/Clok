import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, type NotificationSettings, type User } from "../../api";
import { useCurrentUser } from "../../auth/CurrentUser";

const NOTIF_LABEL: Record<keyof NotificationSettings, string> = {
  reminder_no_entry: "Erinnerung, wenn ich zwei Tage keine Zeit eingetragen habe",
  reminder_remaining_vacation: "Erinnerung an Resturlaub im Jahresendspurt",
  vacation_decided: "Wenn mein Urlaubsantrag entschieden wurde",
  incoming_vacation_request: "Wenn ein Mitarbeiter Urlaub beantragt",
  incoming_sick_note: "Wenn ein Mitarbeiter sich krank meldet",
  month_complete: "Wenn ein Mitarbeiter den letzten Werktag getrackt hat",
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
          {!settings ? <div className="muted">Lade…</div> : (
            <ul className="settings-list">
              {Object.keys(NOTIF_LABEL).map((k) => {
                const key = k as keyof NotificationSettings;
                // Anzeige rollenabhängig: Mitarbeiter sieht keine "incoming"-Toggles
                if (user.role === "employee" && (key === "incoming_vacation_request" || key === "incoming_sick_note" || key === "month_complete")) {
                  return null;
                }
                return (
                  <li key={k}>
                    <label className="toggle">
                      <input type="checkbox"
                        checked={settings[key]}
                        onChange={() => toggle(key)} />
                      <span>{NOTIF_LABEL[key]}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {savedNote && <div className="muted">{savedNote}</div>}
        </section>
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
      : { label: "Soll-Stunden / Monat", value: user.monthly_target_hours },
  ];
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
