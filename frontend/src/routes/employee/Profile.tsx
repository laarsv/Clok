import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { IconChevronRight } from "../../components/ui/Icons";
import EmployeeMasterDataForm from "../../components/EmployeeMasterDataForm";
import MonthDownloads from "../../components/MonthDownloads";
import StammdatenView from "../../components/StammdatenView";
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
      <p className="text-xs text-ink/60">
        Schickt eine Test-Mail an deine eigene Adresse über die echte
        Resend-Pipeline. Nützlich, um zu prüfen, ob DKIM/SPF und der
        API-Key richtig sitzen.
      </p>
      <Button className="mt-3" onClick={send} disabled={busy}>
        {busy ? "Sende…" : "Test-Mail senden"}
      </Button>
      {error && <div className="mt-3 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
      {result && (
        <div className={`mt-3 rounded-lg border-l-4 p-3 text-sm ${result.success ? "border-royal bg-royal/10 text-ink" : "border-amber-500 bg-amber-50 text-amber-900"}`}>
          {result.dev_mode ? (
            <>
              <strong>Dev-Modus aktiv.</strong> Mail wurde nicht versendet,
              sondern ins Backend-Log geschrieben (RESEND_API_KEY ist leer).
              Inhalt findest du mit <code className="rounded bg-ink/10 px-1 py-0.5 text-xs">docker compose logs backend | grep email-dev-mode</code>.
            </>
          ) : result.success ? (
            <>
              <strong>Mail abgeschickt.</strong> Empfänger {result.sent_to},
              Absender <code className="rounded bg-ink/10 px-1 py-0.5 text-xs">{result.from_address}</code>. Schau ins Postfach –
              wenn nichts ankommt, prüf Spam und das Resend-Dashboard.
            </>
          ) : (
            <>
              <strong>Resend-Fehler.</strong> Die API hat das Senden abgelehnt
              (z. B. Domain nicht verifiziert). Details im Backend-Log:
              <code className="rounded bg-ink/10 px-1 py-0.5 text-xs">docker compose logs backend | grep Resend</code>.
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
      <p className="text-xs text-ink/60">
        Du kennst dein aktuelles Passwort? Hier kannst du es ändern. Falls
        nicht, abmelden und auf der Login-Seite „Passwort vergessen?" nutzen.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="field-label">Aktuelles Passwort</span>
          <input className="input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Neues Passwort</span>
          <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Wiederholen</span>
          <input className="input" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
        </label>
      </div>
      {error && <div className="mt-3 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
      {done && <div className="mt-3 text-sm text-royal">Passwort geändert.</div>}
      <Button className="mt-4" onClick={submit} disabled={busy || !oldPw || !newPw}>
        {busy ? "Speichere…" : "Passwort ändern"}
      </Button>
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
  month_submitted: "Wenn ein Mitarbeiter einen Monat zur Freigabe einreicht",
  month_closure_decided: "Wenn mein Monat freigegeben oder zurückgegeben wurde",
};

const TOGGLES_FOR_ROLE: Record<Role, (keyof NotificationSettings)[]> = {
  admin: [],
  employer: ["incoming_vacation_request", "incoming_sick_note", "month_submitted", "month_complete"],
  employee: ["reminder_no_entry", "reminder_remaining_vacation", "vacation_decided", "month_closure_decided"],
};

export default function Profile() {
  const { user, refresh } = useCurrentUser();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [editingMaster, setEditingMaster] = useState(false);

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

  const onMasterSaved = async (_u: User) => {
    setEditingMaster(false);
    await refresh();
  };

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <div className="eyebrow">Konto</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Profil</h1>
        </div>

        <details className="card group p-4 sm:p-5" open>
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <IconChevronRight size={18} className="shrink-0 text-ink/40 transition-transform group-open:rotate-90" />
            <h2 className="text-base font-black sm:text-lg">Stammdaten</h2>
            <span className="ml-auto" />
            {user.role === "employee" && (
              <span className="text-xs text-ink/60">Identität, Anschrift, IBAN bearbeitbar</span>
            )}
          </summary>
          <div className="mt-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={(e) => { e.preventDefault(); setEditingMaster(true); }}>
                Bearbeiten
              </Button>
            </div>
            <StammdatenView user={user} />
            {user.role === "employee" && (
              <p className="mt-3 text-xs text-ink/60">
                Eintrittsdatum, Bundesland und Vertragsdaten (Stunden, Urlaub,
                Gehalt) ändert dein Arbeitgeber.
              </p>
            )}
          </div>
        </details>

        <details className="card group p-4 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <IconChevronRight size={18} className="shrink-0 text-ink/40 transition-transform group-open:rotate-90" />
            <h2 className="text-base font-black sm:text-lg">Benachrichtigungen</h2>
            <span className="ml-auto text-xs text-ink/60">Mail-Erinnerungen ein-/ausschalten</span>
          </summary>
          <div className="mt-4">
            {(() => {
              const allowed = TOGGLES_FOR_ROLE[user.role];
              if (allowed.length === 0) {
                return (
                  <p className="text-sm text-ink/60">
                    Als Admin bekommst du keine Status-Mails. Einladungs-Mails an
                    neue Mitarbeiter werden in jedem Fall verschickt.
                  </p>
                );
              }
              if (!settings) return <div className="text-sm text-ink/60">Lade…</div>;
              return (
                <ul className="space-y-2">
                  {allowed.map((key) => (
                    <li key={key}>
                      <label className="flex items-center gap-2 text-sm text-ink/70">
                        <input type="checkbox" className="h-4 w-4 accent-royal"
                          checked={settings[key]}
                          onChange={() => toggle(key)} />
                        <span>{NOTIF_LABEL[key]}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              );
            })()}
            {savedNote && <div className="mt-2 text-sm text-royal">{savedNote}</div>}
          </div>
        </details>

        <details className="card group p-4 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <IconChevronRight size={18} className="shrink-0 text-ink/40 transition-transform group-open:rotate-90" />
            <h2 className="text-base font-black sm:text-lg">Stundenzettel-Export</h2>
            <span className="ml-auto text-xs text-ink/60">CSV / PDF pro Monat</span>
          </summary>
          <div className="mt-4">
            <MonthDownloads />
          </div>
        </details>

        <details className="card group p-4 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <IconChevronRight size={18} className="shrink-0 text-ink/40 transition-transform group-open:rotate-90" />
            <h2 className="text-base font-black sm:text-lg">Passwort ändern</h2>
            <span className="ml-auto text-xs text-ink/60">aktuelles Passwort erforderlich</span>
          </summary>
          <div className="mt-4">
            <ChangePasswordPanel />
          </div>
        </details>

        {(user.role === "admin" || user.role === "employer") && (
          <details className="card group p-4 sm:p-5">
            <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
              <IconChevronRight size={18} className="shrink-0 text-ink/40 transition-transform group-open:rotate-90" />
              <h2 className="text-base font-black sm:text-lg">E-Mail-Test</h2>
              <span className="ml-auto text-xs text-ink/60">Resend-Pipeline prüfen</span>
            </summary>
            <div className="mt-4">
              <TestEmailPanel />
            </div>
          </details>
        )}

        <Modal open={editingMaster} onClose={() => setEditingMaster(false)} className="sm:max-w-2xl">
          <EmployeeMasterDataForm
            user={user}
            selfEdit={true}
            onSaved={onMasterSaved}
            onCancel={() => setEditingMaster(false)}
          />
        </Modal>
      </div>
    </Shell>
  );
}
