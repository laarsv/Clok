import EntriesLog from "../../components/EntriesLog";
import { useCurrentUser } from "../../auth/CurrentUser";

export default function Log() {
  const { user } = useCurrentUser();
  if (!user) return null;
  const canEditAll = user.role === "admin" || user.role === "employer";
  return (
    <div className="card-section">
      <h2>Alle Einträge</h2>
      <EntriesLog employeeId={user.id} canEditAll={canEditAll} />
    </div>
  );
}
