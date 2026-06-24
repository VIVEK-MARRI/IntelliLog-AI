"""Test DB connection with aiosqlite."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text


async def test():
    e = create_async_engine("sqlite+aiosqlite:///:memory:")
    a = AsyncSession(e)
    r = await a.execute(text("SELECT 1"))
    print(f"DB OK: {r.scalar()}")
    await a.close()
    await e.dispose()


asyncio.run(test())
