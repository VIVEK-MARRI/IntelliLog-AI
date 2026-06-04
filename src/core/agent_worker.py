"""Agent worker entry point for production deployments."""
import asyncio
from src.agent.runner import main

if __name__ == "__main__":
    asyncio.run(main())
