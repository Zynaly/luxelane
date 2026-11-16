from .celery_app import app as celery_app  # noqa: F401

# Python 3.14 compatibility: copy(super()) in BaseContext.__copy__ returns a super object
# without __dict__ in Python 3.14. Ensure BaseContext.__copy__ shallow-copies cleanly.
try:
    from django.template import context as _ctx

    def _safe_base_context_copy(self):
        duplicate = self.__class__.__new__(self.__class__)
        duplicate.__dict__.update(self.__dict__)
        duplicate.dicts = self.dicts[:]
        return duplicate

    _ctx.BaseContext.__copy__ = _safe_base_context_copy
except Exception:
    pass

__all__ = ("celery_app",)
