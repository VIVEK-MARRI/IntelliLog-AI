import logging
import time
from fastapi import Request

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("logs/api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("intellog-api")


async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = round(time.time() - start_time, 3)
    logger.info(
        f"{request.method} {request.url.path} "
        f"→ {response.status_code} [{duration}s]"
    )
    return response
