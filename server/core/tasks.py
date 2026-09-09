"""
core/tasks.py — Asynchronous Celery tasks for platform reporting and exports (Sprint 15).
"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="core.process_export_job_task")
def process_export_job_task(job_id: str):
    """
    Executes background extraction, serialization, and file preparation for an ExportJob.
    """
    from core.models import ExportJob
    from core.services.reporting import reporting_service

    try:
        job = ExportJob.objects.get(id=job_id)
        reporting_service.run_export(job)
        return {"success": True, "job_id": job_id, "status": job.status}
    except Exception as exc:
        logger.error(f"Error executing export job {job_id}: {exc}")
        return {"success": False, "error": str(exc)}
