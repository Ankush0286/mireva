import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.automation.workers.dm_dispatcher import run_dm_dispatcher
from app.automation.workers.post_dispatcher import run_post_dispatcher
from app.automation.workers.quota_reset_worker import run_quota_reset_worker
from app.automation.workers.watcher_worker import run_watcher_worker

logger = logging.getLogger(__name__)

scheduler: AsyncIOScheduler = AsyncIOScheduler(timezone="UTC")


def get_scheduler() -> AsyncIOScheduler:
    global scheduler
    return scheduler


async def _safe_job_wrapper(job_func, name: str) -> None:
    try:
        await job_func()
    except Exception as exc:
        logger.error("Error in background worker '%s': %s", name, exc, exc_info=True)


def register_automation_jobs() -> None:
    scheduler.add_job(
        _safe_job_wrapper,
        trigger=IntervalTrigger(seconds=30),
        args=[run_post_dispatcher, "PostDispatcher"],
        id="post_dispatcher_job",
        name="Scheduled Post Dispatcher",
        replace_existing=True,
    )

    scheduler.add_job(
        _safe_job_wrapper,
        trigger=IntervalTrigger(seconds=60),
        args=[run_dm_dispatcher, "DmDispatcher"],
        id="dm_dispatcher_job",
        name="Cold DM Dispatcher",
        replace_existing=True,
    )

    scheduler.add_job(
        _safe_job_wrapper,
        trigger=IntervalTrigger(minutes=5),
        args=[run_watcher_worker, "WatcherWorker"],
        id="watcher_worker_job",
        name="Competitor Feed Watcher",
        replace_existing=True,
    )

    scheduler.add_job(
        _safe_job_wrapper,
        trigger=IntervalTrigger(minutes=30),
        args=[run_quota_reset_worker, "QuotaResetWorker"],
        id="quota_reset_job",
        name="Quota Reset & Consistency Check",
        replace_existing=True,
    )

    logger.info("Registered 4 background automation worker jobs.")


def start_scheduler() -> None:
    global scheduler
    try:
        if getattr(scheduler, "state", 0) == 0:
            scheduler = AsyncIOScheduler(timezone="UTC")

        if not scheduler.running:
            register_automation_jobs()
            scheduler.start()
            logger.info("APScheduler background engine started successfully.")
    except (RuntimeError, Exception) as exc:
        logger.debug("Scheduler startup handled: %s", exc)


def stop_scheduler() -> None:
    global scheduler
    try:
        if getattr(scheduler, "running", False):
            loop = getattr(scheduler, "_eventloop", None)
            if loop and loop.is_running() and not loop.is_closed():
                scheduler.shutdown(wait=False)
            else:
                scheduler.state = 0
    except (RuntimeError, Exception) as exc:
        logger.debug("Scheduler shutdown exception safely suppressed: %s", exc)
    finally:
        logger.info("APScheduler background engine shut down.")
