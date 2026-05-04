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

  return (
    <div className="center">
      <div className="card">
        <img src="/clok-logo.png" alt="Clok" className="auth-logo" />
        <label>Benutzername<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></label>
        <label>Passwort
          <input type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        {error && <div className="error">{error}</div>}
        <button onClick={submit} disabled={busy}>{busy ? "Anmelden…" : "Anmelden"}</button>
        <p className="muted small" style={{ marginTop: "1rem", textAlign: "center" }}>
          <Link to="/forgot-password">Passwort vergessen?</Link>
        </p>
      </div>
    </div>
  );
}
