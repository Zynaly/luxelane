from .base import *  # noqa: F401, F403

DEBUG = True

# Allow all hosts in dev
ALLOWED_HOSTS = ["*"]

# Verbose logging in dev
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "{levelname} {asctime} {module} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": "DEBUG"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "django.db.backends": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
    },
}

# Relax CORS & CSRF in dev
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://10.0.2.2:8000",
    "http://10.0.2.2:5173",
]
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://localhost:\d+$",
    r"^http://127\.0\.0\.1:\d+$",
    r"^http://10\.0\.2\.2:\d+$",
    r"^http://192\.168\.\d+\.\d+(:\d+)?$",
]
SECURE_CROSS_ORIGIN_OPENER_POLICY = None

# If EMAIL_HOST_USER is not configured in dev, fallback to console
if not EMAIL_HOST_USER:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"


# Check if Redis is running; if not, fall back cleanly to LocMemCache and eager Celery
try:
    import redis
    _r = redis.Redis.from_url(REDIS_URL, socket_connect_timeout=0.2)
    _r.ping()
except Exception:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "luxelane-dev-cache",
        }
    }
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True

# Disable throttling in dev so rapid mobile/web reloads and testing are never throttled
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "anon": "100000/hour",
    "user": "100000/hour",
    "auth": "1000/min",
    "checkout": "1000/min",
    "search": "1000/min",
}
