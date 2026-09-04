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

# Relax CORS in dev
CORS_ALLOW_ALL_ORIGINS = True

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
