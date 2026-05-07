import { Fragment } from "react";
import { WEEKDAY_LABELS, type User, type WeekDay } from "../api";

interface FieldDef {
  label: string;
  value: string | number | null | undefined;
}

interface SectionDef {
  title: string;
  fields: FieldDef[];
}

function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

function workDaysLabel(days: WeekDay[] | null | undefined): string | null {
  if (!days || days.length === 0) return null;
  return days.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

function buildSections(user: User): SectionDef[] {
  const sections: SectionDef[] = [];

  sections.push({
    title: "Identität & Kontakt",
    fields: [
      { label: "Voller Name", value: user.full_name },
      { label: "Username", value: user.username },
      { label: "E-Mail", value: user.email },
      { label: "Telefon", value: user.phone },
      { label: "Geburtsdatum", value: user.date_of_birth },
    ],
  });

  if (user.role === "employee") {
    sections.push({
      title: "Anschrift",
      fields: [
        { label: "Straße", value: user.address_line1 },
        { label: "Adresszusatz", value: user.address_line2 },
        { label: "PLZ / Ort", value: joinAddress([user.postal_code, user.city]) || null },
        { label: "Land", value: user.country },
        { label: "Bundesland", value: user.federal_state },
      ],
    });

    sections.push({
      title: "Beschäftigung",
      fields: [
        { label: "Eintrittsdatum", value: user.hire_date },
        { label: "Wochenstunden", value: user.weekly_hours },
        { label: "Arbeitstage", value: workDaysLabel(user.work_days) },
        { label: "Urlaub / Jahr", value: user.annual_vacation_days },
        { label: "Abrechnung",
          value: user.billing_mode === "hourly" ? "Stundenbasis" : "Festgehalt" },
        ...(user.billing_mode === "hourly"
          ? [{ label: "Stundensatz (EUR)", value: user.hourly_rate_eur }]
          : []),
      ],
    });

    sections.push({
      title: "Lohn & Notfall",
      fields: [
        { label: "SV-Nummer", value: user.social_security_number },
        { label: "IBAN", value: user.iban },
        { label: "Notfallkontakt",
          value: joinAddress([user.emergency_contact_name, user.emergency_contact_phone]) || null },
      ],
    });
  }

  if (user.role === "employer") {
    sections.push({
      title: "Firma",
      fields: [
        { label: "Firmenname", value: user.company_name },
        { label: "Straße", value: user.company_address_line1 },
        { label: "Adresszusatz", value: user.company_address_line2 },
        { label: "PLZ / Ort",
          value: joinAddress([user.company_postal_code, user.company_city]) || null },
        { label: "Land", value: user.company_country },
      ],
    });
    sections.push({
      title: "Personalabteilung / Ansprechpartner",
      fields: [
        { label: "Name", value: user.hr_contact_name },
        { label: "E-Mail", value: user.hr_contact_email },
        { label: "Telefon", value: user.hr_contact_phone },
      ],
    });
  }

  return sections;
}

export default function StammdatenView({ user }: { user: User }) {
  const sections = buildSections(user);
  return (
    <div className="stamm-view">
      {sections.map((s) => (
        <div key={s.title} className="stamm-section">
          <h4>{s.title}</h4>
          <dl className="stamm-list">
            {s.fields.map((f, i) => (
              <Fragment key={i}>
                <dt>{f.label}</dt>
                <dd>
                  {f.value !== null && f.value !== undefined && f.value !== ""
                    ? f.value
                    : <span className="muted">—</span>}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
