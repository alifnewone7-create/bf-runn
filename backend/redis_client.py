"""Async Redis client (singleton)."""
import os
import redis.asyncio as aioredis

REDIS_URL = os.environ["REDIS_URL"]

redis_client: aioredis.Redis = aioredis.from_url(
    REDIS_URL, decode_responses=True, max_connections=50
)


async def get_redis() -> aioredis.Redis:
    return redis_client
