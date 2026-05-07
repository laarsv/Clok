"""companies + employer_invites + Onboarding-Status am User.

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-07

Legt zwei neue Tabellen an (companies, employer_invites) und erweitert
users um onboarding_status, email_verified_at, company_id. Backfill:
für jeden bestehenden Arbeitgeber wird eine companies-Zeile aus den
vorhandenen company_*-Feldern und Default-MA-Werten gebaut, danach
user.company_id verlinkt. Die alten users.company_*-Spalten bleiben
unangetastet (Cleanup-Migration kommt separat).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_FEDERAL_STATE_VALUES = (
    "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
    "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH",
)
_BILLING_MODE_VALUES = ("hourly", "salary")
_ONBOARDING_STATUS_VALUES = (
    "onboarding_step_1", "onboarding_step_2", "onboarding_step_3",
    "onboarding_step_4", "onboarding_step_5", "active",
)
_COMPANY_SIZE_BUCKET_VALUES = ("1", "2_5", "6_10", "11_plus")


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Neue Enums explizit anlegen (federal_state und billing_mode existieren
    # bereits). Bewusst postgresql.ENUM statt sa.Enum, und die Spalten unten
    # bauen FRISCHE ENUM-Instanzen mit create_type=False – das Pattern ist die
    # einzige zuverlässige Variante, um doppelte CREATE-TYPE-Hooks beim
    # create_table zu vermeiden.
    postgresql.ENUM(*_ONBOARDING_STATUS_VALUES, name="onboarding_status").create(
        bind, checkfirst=True,
    )
    postgresql.ENUM(*_COMPANY_SIZE_BUCKET_VALUES, name="company_size_bucket").create(
        bind, checkfirst=True,
    )

    # 2. companies-Tabelle
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address_street", sa.String(255), nullable=True),
        sa.Column("address_zip", sa.String(10), nullable=True),
        sa.Column("address_city", sa.String(128), nullable=True),
        sa.Column("address_country", sa.String(2), nullable=True, server_default="DE"),
        sa.Column("vat_id", sa.String(32), nullable=True),
        sa.Column(
            "bundesland",
            postgresql.ENUM(*_FEDERAL_STATE_VALUES, name="federal_state", create_type=False),
            nullable=True,
        ),
        sa.Column("industry", sa.String(128), nullable=True),
        sa.Column(
            "employee_count_bucket",
            postgresql.ENUM(*_COMPANY_SIZE_BUCKET_VALUES,
                            name="company_size_bucket", create_type=False),
            nullable=True,
        ),
        sa.Column("default_weekly_hours", sa.Float, nullable=True),
        sa.Column("default_vacation_days", sa.Float, nullable=True),
        sa.Column(
            "default_bundesland",
            postgresql.ENUM(*_FEDERAL_STATE_VALUES, name="federal_state", create_type=False),
            nullable=True,
        ),
        sa.Column(
            "default_billing_mode",
            postgresql.ENUM(*_BILLING_MODE_VALUES, name="billing_mode", create_type=False),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column(
            "created_by_user_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
    )

    # 3. employer_invites-Tabelle
    op.create_table(
        "employer_invites",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(128), nullable=True),
        sa.Column("company_name", sa.String(255), nullable=True),
        # SHA-256 hex = 64 chars, UNIQUE für direkten Hash-Lookup beim Einlösen.
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column(
            "created_by_admin_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("accepted_at", sa.DateTime, nullable=True),
        sa.Column(
            "accepted_by_user_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("revoked_at", sa.DateTime, nullable=True),
        sa.Column(
            "revoked_by_admin_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("last_resent_at", sa.DateTime, nullable=True),
        sa.Column(
            "resent_by_admin_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("expired_digest_sent_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_employer_invites_email", "employer_invites", ["email"])
    # Composite-Index für Status-Filterung im Admin-Listing.
    op.create_index(
        "ix_employer_invites_status_window", "employer_invites",
        ["accepted_at", "revoked_at", "expires_at"],
    )

    # 4. users-Erweiterungen
    op.add_column(
        "users",
        sa.Column(
            "onboarding_status",
            postgresql.ENUM(*_ONBOARDING_STATUS_VALUES,
                            name="onboarding_status", create_type=False),
            nullable=False, server_default="active",
        ),
    )
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime, nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "company_id", sa.Integer,
            sa.ForeignKey("companies.id", ondelete="SET NULL"), nullable=True,
        ),
    )

    # Backfill email_verified_at: alle bestehenden User galten implizit als verifiziert.
    op.execute("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL")

    # 5. Backfill bestehender Arbeitgeber → companies-Zeile + Verknüpfung
    rows = bind.execute(sa.text("""
        SELECT id, full_name, username, federal_state, billing_mode,
               weekly_hours, annual_vacation_days,
               company_name, company_address_line1, company_address_line2,
               company_postal_code, company_city, company_country
          FROM users
         WHERE role = 'employer'
    """)).fetchall()

    insert_company = sa.text("""
        INSERT INTO companies (
            name, address_street, address_zip, address_city, address_country,
            bundesland, default_bundesland,
            default_weekly_hours, default_vacation_days, default_billing_mode,
            created_by_user_id, created_at
        ) VALUES (
            :name, :street, :zip, :city, :country,
            CAST(:bl AS federal_state), CAST(:bl AS federal_state),
            :wh, :vd, CAST(:bm AS billing_mode),
            :uid, NOW()
        )
        RETURNING id
    """)
    link_user = sa.text("UPDATE users SET company_id = :cid WHERE id = :uid")

    for r in rows:
        m = r._mapping
        name = m["company_name"] or m["full_name"] or m["username"]
        # street zusammenbauen aus line1 + line2 (Komma-getrennt, wenn beide gesetzt)
        line1 = m["company_address_line1"]
        line2 = m["company_address_line2"]
        if line1 and line2:
            street = f"{line1}, {line2}"
        else:
            street = line1 or line2  # einer von beiden oder None
        country = m["company_country"] or "DE"

        new_id = bind.execute(insert_company, {
            "name": name,
            "street": street,
            "zip": m["company_postal_code"],
            "city": m["company_city"],
            "country": country,
            "bl": m["federal_state"],
            "wh": m["weekly_hours"],
            "vd": m["annual_vacation_days"],
            "bm": m["billing_mode"],
            "uid": m["id"],
        }).scalar()
        bind.execute(link_user, {"cid": new_id, "uid": m["id"]})


def downgrade() -> None:
    op.drop_column("users", "company_id")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "onboarding_status")

    op.drop_index("ix_employer_invites_status_window", table_name="employer_invites")
    op.drop_index("ix_employer_invites_email", table_name="employer_invites")
    op.drop_table("employer_invites")
    op.drop_table("companies")

    postgresql.ENUM(name="company_size_bucket").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="onboarding_status").drop(op.get_bind(), checkfirst=True)
