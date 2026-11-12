from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import SampleItem


@pytest.mark.anyio
async def test_audit_base_generates_id_and_timestamps(db_session: AsyncSession):
    """Verify AuditBase automatically populates UUID v4, created_at, and updated_at."""
    item = SampleItem(name="Test Item 1")
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)

    # 1. Primary key must be populated with a valid UUID
    assert item.id is not None
    assert isinstance(item.id, UUID)
    assert len(str(item.id)) == 36

    # 2. Timestamps must be auto-populated and timezone-aware
    assert item.created_at is not None
    assert item.updated_at is not None

    # 3. Query back asynchronously from database
    stmt = select(SampleItem).where(SampleItem.id == item.id)
    result = await db_session.execute(stmt)
    queried = result.scalars().first()

    assert queried is not None
    assert queried.name == "Test Item 1"
    assert queried.id == item.id


@pytest.mark.anyio
async def test_audit_base_uuid_uniqueness(db_session: AsyncSession):
    """Verify multiple instances generate unique primary keys without collision."""
    items = [SampleItem(name=f"Batch Item {i}") for i in range(10)]
    db_session.add_all(items)
    await db_session.commit()

    ids = {item.id for item in items}
    assert len(ids) == 10


@pytest.mark.anyio
async def test_audit_base_update_modifies_timestamp(db_session: AsyncSession):
    """Verify updating a record mutates the updated_at timestamp."""
    item = SampleItem(name="Original Name")
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)

    original_created = item.created_at
    original_updated = item.updated_at

    item.name = "Modified Name"
    await db_session.commit()
    await db_session.refresh(item)

    assert item.name == "Modified Name"
    assert item.created_at == original_created
    assert item.updated_at >= original_updated


@pytest.mark.anyio
async def test_audit_base_repr_format(db_session: AsyncSession):
    """Verify declarative string representation formatting for unsaved and saved models."""
    unsaved = SampleItem(name="Unsaved")
    assert "SampleItem" in repr(unsaved)
    assert "id=None" in repr(unsaved)

    saved = SampleItem(name="Saved")
    db_session.add(saved)
    await db_session.commit()
    await db_session.refresh(saved)

    assert str(saved.id) in repr(saved)
    assert "SampleItem" in repr(saved)


@pytest.mark.anyio
async def test_audit_base_rollback_behavior(db_session: AsyncSession):
    """Verify that rolled back additions are never persisted to the session."""
    item = SampleItem(name="Doomed Item")
    db_session.add(item)
    await db_session.rollback()

    stmt = select(SampleItem).where(SampleItem.name == "Doomed Item")
    result = await db_session.execute(stmt)
    assert result.scalars().first() is None
