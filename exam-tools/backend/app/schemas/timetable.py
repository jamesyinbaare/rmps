from enum import Enum


class TimetableDownloadFilter(str, Enum):
    ALL = "ALL"
    CORE_ONLY = "CORE_ONLY"
    ELECTIVE_ONLY = "ELECTIVE_ONLY"
