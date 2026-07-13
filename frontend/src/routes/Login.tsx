import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { homeForRole, useCurrentUser } from "../auth/CurrentUser";

export default function Login() {
  const { setUser } = useCurrentUser();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { access_token } = await api.login(username, password);
      setToken(access_token);
      const me = await api.me();
      setUser(me);
      navigate(homeForRole(me.role), { replace: true });
    } catch (e: any) {
      setError(e.message ?? "Login fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (e: React.KeyboardEvent) => {
    // Enter loggt ein, sobald beide Felder gefüllt sind – kein versehentlicher
    // Submit mit leerem Passwort.
    if (e.key === "Enter" && username && password) submit();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 text-center">
          <div className="eyebrow">Arbeitszeiterfassung</div>
          <h1 className="mt-1 text-4xl font-black tracking-tight text-royal">Clok</h1>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="field-label">Benutzername</span>
            <input
              className="input"
              value={username}
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={onEnter}
            />
          </label>
          <label className="block">
            <span className="field-label">Passwort</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onEnter}
            />
          </label>

          {error && (
            <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}

          <button onClick={submit} disabled={busy} className="btn-primary w-full">
            {busy ? "Anmelden…" : "Anmelden"}
          </button>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link to="/forgot-password" className="font-bold text-royal hover:underline">
            Passwort vergessen?
          </Link>
        </p>
      </div>
    </div>
  );
}
