from pydantic import BaseModel


class FilterInfo(BaseModel):
    """Information about applied filters."""

    region: str | None = None
    zone: str | None = None
    school_id: int | None = None
    school_name: str | None = None


class ComponentStats(BaseModel):
    """Statistics for a component (obj, essay, pract)."""

    mean: float | None = None
    median: float | None = None
    min: float | None = None
    max: float | None = None
    std_deviation: float | None = None


class SubjectPerformanceStatistics(BaseModel):
    """Statistics for subject performance."""

    exam_subject_id: int
    subject_code: str
    subject_name: str
    filters: FilterInfo

    # Candidate counts
    total_candidates: int
    processed_candidates: int  # total_score > 0 and != -1
    absent_candidates: int  # total_score == -1
    pending_candidates: int  # total_score == 0.0

    # Score statistics (excluding absent/pending)
    mean_score: float | None = None
    median_score: float | None = None
    min_score: float | None = None
    max_score: float | None = None
    std_deviation: float | None = None
    percentiles: dict[str, float]  # 25th, 50th, 75th, 90th, 95th

    # Grade distribution (using provided or current grade_ranges_json)
    grade_distribution: dict[str, int]  # {"Fail": 10, "Pass": 20, ...}
    grade_percentages: dict[str, float]  # Percentage for each grade
    pass_rate: float | None = None  # Percentage who passed (non-Fail)

    # Component statistics (if available)
    obj_stats: ComponentStats | None = None
    essay_stats: ComponentStats | None = None
    pract_stats: ComponentStats | None = None


class BinData(BaseModel):
    """Data for a single histogram bin."""

    range_label: str  # "0-5", "5-10", etc.
    min: float
    max: float
    count: int
    percentage: float
    grade_breakdown: dict[str, int] | None = None  # Count per grade in this bin (if grade_ranges provided)


class HistogramData(BaseModel):
    """Histogram data for score distribution."""

    bins: list[BinData]
    bin_size: float
    total_count: int
    excluded_count: int  # Absent/pending
    filters: FilterInfo


class SchoolOption(BaseModel):
    """School option for filter dropdowns."""

    id: int
    code: str
    name: str
    region: str
    zone: str
    candidate_count: int


class FilterOptions(BaseModel):
    """Available filter options for an exam subject."""

    regions: list[str]  # Available regions for this exam subject
    zones: list[str]  # Available zones
    schools: list[SchoolOption]  # Available schools with counts
