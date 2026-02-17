"""
Rate limiting middleware to prevent brute force attacks and abuse.
"""

from datetime import datetime, timedelta
from typing import Dict, Optional
from fastapi import Request, HTTPException, status
import logging

logger = logging.getLogger(__name__)

# In-memory rate limit storage (for production, use Redis)
class RateLimiter:
    """
    Simple in-memory rate limiter.
    For production, replace with Redis-based rate limiter.
    """
    
    def __init__(self, cleanup_interval: int = 3600):
        self.requests: Dict[str, list] = {}
        self.cleanup_interval = cleanup_interval
        self.last_cleanup = datetime.now()
    
    def _cleanup(self):
        """Remove old entries to prevent memory leak."""
        now = datetime.now()
        if (now - self.last_cleanup).seconds > self.cleanup_interval:
            cutoff = now - timedelta(hours=1)
            for key in list(self.requests.keys()):
                self.requests[key] = [
                    ts for ts in self.requests[key] if ts > cutoff
                ]
                if not self.requests[key]:
                    del self.requests[key]
            self.last_cleanup = now
    
    def is_allowed(
        self, 
        key: str, 
        max_requests: int = 60, 
        window_seconds: int = 60
    ) -> tuple[bool, Optional[int]]:
        """
        Check if request is allowed.
        
        Args:
            key: Identifier (email, IP, etc.)
            max_requests: Max requests allowed
            window_seconds: Time window in seconds
            
        Returns:
            (is_allowed, retry_after_seconds)
        """
        self._cleanup()
        
        now = datetime.now()
        cutoff = now - timedelta(seconds=window_seconds)
        
        if key not in self.requests:
            self.requests[key] = []
        
        # Remove old requests outside the window
        self.requests[key] = [ts for ts in self.requests[key] if ts > cutoff]
        
        if len(self.requests[key]) < max_requests:
            self.requests[key].append(now)
            return True, None
        else:
            # Calculate retry after
            oldest = self.requests[key][0]
            retry_after = int((oldest + timedelta(seconds=window_seconds) - now).total_seconds()) + 1
            return False, retry_after


# Global rate limiter instance
_rate_limiter = RateLimiter()


def rate_limit_check(
    request: Request,
    key: str,
    max_requests: int = 60,
    window_seconds: int = 60
) -> None:
    """
    Check if request exceeds rate limit.
    
    Args:
        request: FastAPI request object
        key: Identifier for rate limiting
        max_requests: Max requests allowed in window
        window_seconds: Time window in seconds
        
    Raises:
        HTTPException: If rate limit exceeded
    """
    allowed, retry_after = _rate_limiter.is_allowed(key, max_requests, window_seconds)
    
    if not allowed:
        logger.warning(f"Rate limit exceeded for {key}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again after {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )


# Rate limit policies for different endpoints
RATE_LIMIT_POLICIES = {
    "login": {"max_requests": 5, "window_seconds": 300},      # 5 per 5 minutes
    "signup": {"max_requests": 3, "window_seconds": 3600},    # 3 per hour
    "refresh": {"max_requests": 10, "window_seconds": 300},   # 10 per 5 minutes
    "orders": {"max_requests": 100, "window_seconds": 60},    # 100 per minute
    "default": {"max_requests": 60, "window_seconds": 60},    # 60 per minute
}


def get_client_ip(request: Request) -> str:
    """Extract client IP from request."""
    if request.client:
        return request.client.host
    return "unknown"
