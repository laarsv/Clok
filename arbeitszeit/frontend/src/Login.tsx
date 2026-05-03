import { useState } from "react";
import { api, setToken, type User } from "./api";

interface Props {
  onLogin: (user: User) => void;
}

export default function Login({ onLogin }: Props) {
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
      onLogin(me);
    } catch (e: any) {
      setError(e.message ?? "Login fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <div className="card">
        <h1>Arbeitszeiterfassung</h1>
        <label>
          Benutzername
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Passwort
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button onClick={submit} disabled={busy}>
          {busy ? "Anmelden…" : "Anmelden"}
        </button>
      </div>
    </div>
  );
}
