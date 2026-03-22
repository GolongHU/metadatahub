"""
Seed script: create test users + default dataset access grants.

Usage (from apps/server/):
    python scripts/seed.py
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.dataset import Dataset
from app.models.permission import DatasetAccess
from app.models.user import User
from app.services.token_service import hash_password

# ── Test users ────────────────────────────────────────────────────────────────

USERS = [
    {
        "email": "admin@metadatahub.local",
        "password": "admin123",
        "name": "系统管理员",
        "role": "admin",
        "region": None,
        "department": None,
        "partner_id": None,
    },
    {
        "email": "manager@metadatahub.local",
        "password": "manager123",
        "name": "华东经理",
        "role": "analyst",
        "region": "华东",
        "department": "销售部",
        "partner_id": None,
    },
    {
        "email": "rep@metadatahub.local",
        "password": "rep123",
        "name": "渠道专员小王",
        "role": "viewer",
        "region": "华东",
        "department": "渠道部",
        "partner_id": None,
    },
    {
        "email": "partner@metadatahub.local",
        "password": "partner123",
        "name": "阿里云(伙伴)",
        "role": "partner",
        "region": None,
        "department": None,
        "partner_id": "阿里云",
    },
]

# Default dataset access grants (role-based)
DEFAULT_ACCESS = [
    {"grantee_type": "role", "grantee_id": "admin",   "access_level": "admin"},
    {"grantee_type": "role", "grantee_id": "analyst", "access_level": "read"},
    {"grantee_type": "role", "grantee_id": "viewer",  "access_level": "read"},
    {"grantee_type": "role", "grantee_id": "partner", "access_level": "read"},
]


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        # ── Upsert users ──────────────────────────────────────────────────────
        for u in USERS:
            result = await session.execute(select(User).where(User.email == u["email"]))
            existing = result.scalar_one_or_none()
            if existing:
                print(f"  [skip] user already exists: {u['email']}")
                continue

            user = User(
                email=u["email"],
                name=u["name"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
                region=u["region"],
                department=u["department"],
                partner_id=u["partner_id"],
                permission_version=1,
                is_active=True,
            )
            session.add(user)
            print(f"  [+] user: {u['email']} / {u['password']}  role={u['role']}")

        await session.commit()

        # ── Default dataset access for all existing datasets ──────────────────
        ds_result = await session.execute(select(Dataset).where(Dataset.is_active == True))  # noqa: E712
        datasets = ds_result.scalars().all()

        for dataset in datasets:
            for grant in DEFAULT_ACCESS:
                # Check if already exists
                exists = await session.execute(
                    select(DatasetAccess).where(
                        DatasetAccess.dataset_id == dataset.id,
                        DatasetAccess.grantee_type == grant["grantee_type"],
                        DatasetAccess.grantee_id == grant["grantee_id"],
                    )
                )
                if exists.scalar_one_or_none():
                    continue

                session.add(
                    DatasetAccess(
                        dataset_id=dataset.id,
                        grantee_type=grant["grantee_type"],
                        grantee_id=grant["grantee_id"],
                        access_level=grant["access_level"],
                    )
                )
                print(
                    f"  [+] access: dataset={dataset.name}"
                    f"  {grant['grantee_type']}={grant['grantee_id']}"
                    f"  level={grant['access_level']}"
                )

        await session.commit()
        print("\nSeed completed.")


if __name__ == "__main__":
    asyncio.run(seed())
