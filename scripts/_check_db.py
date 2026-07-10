import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def check():
    e = create_async_engine("sqlite+aiosqlite:///./test.db")
    async with e.connect() as c:
        r = await c.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        tables = [row[0] for row in r]
        print("Tables:", tables)
    await e.dispose()

asyncio.run(check())
