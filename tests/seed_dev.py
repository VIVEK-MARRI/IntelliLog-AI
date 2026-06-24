"""Seed dev database with a tenant."""
import asyncio
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from src.api.auth import hash_password


async def seed():
    e = create_async_engine("sqlite+aiosqlite:///C:\\vivek\\IntelliLog-AI\\dev.db")
    a = AsyncSession(e)
    await a.execute(text("""
        CREATE TABLE IF NOT EXISTS tenants (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """))
    await a.commit()
    r = await a.execute(text("SELECT id FROM tenants WHERE email = :email"), {"email": "admin@intelliglog.ai"})
    if not r.scalar():
        pw_hash = hash_password("admin")
        tid = str(uuid.uuid4())
        await a.execute(
            text("INSERT INTO tenants (id, name, email, password_hash, is_active) VALUES (:id, :name, :email, :pw, 1)"),
            {"id": tid, "name": "Admin", "email": "admin@intelliglog.ai", "pw": pw_hash},
        )
        await a.commit()
        print(f"Tenant created: {tid}")
    else:
        print("Tenant already exists")
    await a.close()
    await e.dispose()
    print("Seed done")


asyncio.run(seed())
