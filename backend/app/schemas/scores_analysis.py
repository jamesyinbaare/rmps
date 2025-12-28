"""Schemas for scores analysis and boundary setting."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ScoringMethod(str, Enum):
    """Available scoring methods for boundary calculation."""

    NORM_REFERENCED = "norm_referenced"  # Percentile-based
    CRITERION_REFERENCED = "criterion_referenced"  # Standards-based
    STATISTICAL_STD = "statistical_std"  # Standard deviation based
    STATISTICAL_ZSCORE = "statistical_zscore"  # Z-score based
    FIXED_DISTRIBUTION = "fixed_distribution"  # Enforce specific percentages
    MODIFIED_CURVE = "modified_curve"  # Adjust based on exam difficulty
    MASTERY_BASED = "mastery_based"  # Competency threshold approach
    HYBRID = "hybrid"  # Combination of percentile and standards


class BoundarySet(BaseModel):
    """Boundaries for a scoring method."""

    method: ScoringMethod
    method_name: str = Field(..., description="Human-readable method name")
    boundaries: dict[str, float] = Field(
        ..., description="Minimum score for each grade (e.g., {'Distinction': 85.0, 'Pass': 45.0})"
    )
    description: str | None = Field(None, description="Description of how boundaries were calculated")
    adjustments: dict[str, Any] | None = Field(None, description="Any adjustments made (e.g., difficulty adjustment)")


class GradeDistribution(BaseModel):
    """Grade distribution for a method."""

    grade_counts: dict[str, int] = Field(..., description="Count of students per grade")
    grade_percentages: dict[str, float] = Field(..., description="Percentage of students per grade")
    pass_rate: float | None = Field(None, description="Percentage who passed (non-Fail)")
    distinction_rate: float | None = Field(None, description="Percentage who got Distinction")


class BorderlineAnalysis(BaseModel):
    """Analysis of borderline candidates."""

    grade: str = Field(..., description="Grade boundary analyzed")
    cutoff: float = Field(..., description="Boundary cutoff score")
    borderline_count: int = Field(..., description="Number of students within ±2 marks of boundary")
    borderline_percentage: float = Field(..., description="Percentage of total students")


class ImpactMetrics(BaseModel):
    """Impact analysis metrics."""

    total_students: int
    pass_rate: float | None
    distinction_rate: float | None
    average_grade_gap: float | None = Field(None, description="Average gap between consecutive grade boundaries")
    borderline_candidates: list[BorderlineAnalysis] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list, description="Warnings about the method")
    recommendations: list[str] = Field(default_factory=list, description="Recommendations for using this method")


class MethodAnalysis(BaseModel):
    """Complete analysis for a single scoring method."""

    method: ScoringMethod
    method_name: str
    boundaries: BoundarySet
    grade_distribution: GradeDistribution
    impact_metrics: ImpactMetrics
    score_statistics: dict[str, float | None] = Field(
        ..., description="Basic statistics (mean, median, std_dev, etc.)"
    )
    scores: list[float] = Field(default_factory=list, description="Raw scores array for visualization")


class MethodComparisonItem(BaseModel):
    """Comparison data for a single method."""

    method: ScoringMethod
    method_name: str
    boundaries: dict[str, float]
    grade_distribution: GradeDistribution
    impact_metrics: ImpactMetrics


class ImpactComparison(BaseModel):
    """Impact comparison across methods."""

    students_affected: dict[str, int] = Field(
        ..., description="Number of students who would get different grades under each method"
    )
    grade_changes: dict[str, dict[str, int]] = Field(
        ...,
        description="For each method, count of students who would change from each grade to another",
    )


class MethodComparison(BaseModel):
    """Comparison of multiple scoring methods."""

    methods: list[MethodComparisonItem] = Field(..., description="Analysis for each method")
    impact_comparison: ImpactComparison | None = Field(None, description="Impact comparison across methods")
    recommendations: list[str] = Field(default_factory=list, description="Overall recommendations")
    scores: list[float] = Field(default_factory=list, description="Raw scores array for visualization")


class BoundaryAnalysisRequest(BaseModel):
    """Request body for single method analysis."""

    method: ScoringMethod
    region: str | None = None
    zone: str | None = None
    school_id: int | None = None
    include_pending: bool = False
    include_absent: bool = False


class BoundaryComparisonRequest(BaseModel):
    """Request body for comparing multiple methods."""

    methods: list[ScoringMethod] = Field(..., min_length=2, description="At least 2 methods to compare")
    region: str | None = None
    zone: str | None = None
    school_id: int | None = None
    include_pending: bool = False
    include_absent: bool = False
