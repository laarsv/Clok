import { useEffect, useState } from "react";
import { api, setToken, type User } from "./api";
import Login from "./Login";
import Dashboard from "./Dashboard";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="center">Lade…</div>;

  if (!user) return <Login onLogin={(u) => setUser(u)} />;

  return (
    <Dashboard
      user={user}
      onLogout={() => {
        setToken(null);
        setUser(null);
      }}
      onUserUpdate={setUser}
    />
  );
}
