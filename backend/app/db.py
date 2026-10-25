import os
import warnings
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

# SQLite has no native DECIMAL type. Amounts are stored with 2 decimal places,
# which is precise enough for this app.
warnings.filterwarnings(
    "ignore", message=r"Dialect sqlite\+pysqlite does \*not\* support Decimal"
)

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "travel_notes.db"
DATABASE_URL = os.environ.get("TRAVEL_NOTES_DB_URL", f"sqlite:///{DEFAULT_DB_PATH}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    # Import models so their tables are registered on the metadata.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
