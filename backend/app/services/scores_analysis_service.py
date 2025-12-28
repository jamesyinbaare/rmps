"""Service for scores analysis and boundary setting using different methods."""

import logging
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Candidate,
    ExamRegistration,
    ExamSubject,
    School,
    SchoolRegion,
    SchoolZone,
    Subject,
    SubjectRegistration,
    SubjectScore,
)
from app.schemas.scores_analysis import (
    BorderlineAnalysis,
    BoundarySet,
    GradeDistribution,
    ImpactComparison,
    ImpactMetrics,
    MethodAnalysis,
    MethodComparison,
    MethodComparisonItem,
    ScoringMethod,
)
from app.utils.score_utils import ABSENT_RESULT_SENTINEL, is_grade_pending
from app.utils.statistics_utils import calculate_statistics

logger = logging.getLogger(__name__)


class ScoresAnalysisService:
    """Service for analyzing scores and calculating grade boundaries using different methods."""

    # Grade order from highest to lowest
    GRADE_ORDER = ["Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass", "Fail"]

    @staticmethod
    async def get_scores_data(
        session: AsyncSession,
        exam_subject_id: int,
        region: SchoolRegion | None = None,
        zone: SchoolZone | None = None,
        school_id: int | None = None,
        include_pending: bool = False,
        include_absent: bool = False,
    ) -> tuple[list[float], ExamSubject, dict[str, Any]]:
        """
        Extract scores with filtering support.

        Returns:
            Tuple of (processed_scores, exam_subject, metadata)
        """
        # Get exam subject
        exam_subject_stmt = select(ExamSubject, Subject).join(
            Subject, ExamSubject.subject_id == Subject.id
        ).where(ExamSubject.id == exam_subject_id)
        exam_subject_result = await session.execute(exam_subject_stmt)
        exam_subject_row = exam_subject_result.first()
        if not exam_subject_row:
            raise ValueError(f"Exam subject {exam_subject_id} not found")

        exam_subject, subject = exam_subject_row

        # Build query: SubjectScore -> SubjectRegistration -> ExamRegistration -> Candidate -> School
        stmt = (
            select(SubjectScore, SubjectRegistration, ExamRegistration, Candidate, School)
            .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
            .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
            .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
            .join(School, Candidate.school_id == School.id)
            .where(SubjectRegistration.exam_subject_id == exam_subject_id)
        )

        # Apply filters
        if region:
            stmt = stmt.where(School.region == region)
        if zone:
            stmt = stmt.where(School.zone == zone)
        if school_id:
            stmt = stmt.where(School.id == school_id)

        result = await session.execute(stmt)
        rows = result.all()

        # Process scores
        processed_scores: list[float] = []
        absent_count = 0
        pending_count = 0

        for subject_score, _subject_reg, _exam_reg, _candidate, _school in rows:
            total_score = subject_score.total_score

            # Process scores based on inclusion flags
            if total_score == ABSENT_RESULT_SENTINEL:
                absent_count += 1
                if include_absent:
                    processed_scores.append(0.0)
            elif total_score == 0.0:
                # Check if actually pending
                if is_grade_pending(subject_score, exam_subject):
                    pending_count += 1
                    if include_pending:
                        processed_scores.append(0.0)
                else:
                    # Not pending, just a zero score
                    processed_scores.append(total_score)
            else:
                # Valid score > 0
                processed_scores.append(total_score)

        metadata = {
            "total_candidates": len(rows),
            "processed_candidates": len(processed_scores),
            "absent_candidates": absent_count,
            "pending_candidates": pending_count,
        }

        return processed_scores, exam_subject, metadata

    @staticmethod
    def calculate_boundaries_by_method(
        scores: list[float], method: ScoringMethod, **kwargs: Any
    ) -> BoundarySet:
        """
        Calculate boundaries using different scoring methods.

        Args:
            scores: List of processed scores
            method: Scoring method to use
            **kwargs: Additional parameters for specific methods

        Returns:
            BoundarySet with calculated boundaries
        """
        if not scores:
            raise ValueError("No scores provided")

        scores_array = np.array(scores)

        if method == ScoringMethod.NORM_REFERENCED:
            return ScoresAnalysisService._calculate_norm_referenced(scores_array)
        elif method == ScoringMethod.CRITERION_REFERENCED:
            return ScoresAnalysisService._calculate_criterion_referenced(scores_array)
        elif method == ScoringMethod.STATISTICAL_STD:
            return ScoresAnalysisService._calculate_statistical_std(scores_array)
        elif method == ScoringMethod.STATISTICAL_ZSCORE:
            return ScoresAnalysisService._calculate_statistical_zscore(scores_array)
        elif method == ScoringMethod.FIXED_DISTRIBUTION:
            target_percentages = kwargs.get("target_percentages")
            return ScoresAnalysisService._calculate_fixed_distribution(scores_array, target_percentages)
        elif method == ScoringMethod.MODIFIED_CURVE:
            return ScoresAnalysisService._calculate_modified_curve(scores_array)
        elif method == ScoringMethod.MASTERY_BASED:
            return ScoresAnalysisService._calculate_mastery_based(scores_array)
        elif method == ScoringMethod.HYBRID:
            return ScoresAnalysisService._calculate_hybrid(scores_array)
        else:
            raise ValueError(f"Unknown scoring method: {method}")

    @staticmethod
    def _calculate_norm_referenced(scores: np.ndarray) -> BoundarySet:
        """Calculate boundaries using percentile-based (norm-referenced) method."""
        percentiles = {
            "Distinction": 95,
            "Upper Credit": 80,
            "Credit": 50,
            "Lower Credit": 20,
            "Pass": 5,
        }

        boundaries = {}
        for grade, percentile in percentiles.items():
            boundaries[grade] = float(np.percentile(scores, percentile))

        boundaries["Fail"] = 0.0

        return BoundarySet(
            method=ScoringMethod.NORM_REFERENCED,
            method_name="Norm-Referenced (Percentile-Based)",
            boundaries=boundaries,
            description="Boundaries based on fixed percentile distribution",
        )

    @staticmethod
    def _calculate_criterion_referenced(scores: np.ndarray) -> BoundarySet:
        """Calculate boundaries using standards-based (criterion-referenced) method."""
        base_standards = {
            "Distinction": 85.0,
            "Upper Credit": 75.0,
            "Credit": 65.0,
            "Lower Credit": 55.0,
            "Pass": 45.0,
        }

        current_mean = float(np.mean(scores))
        adjustments = {}

        # Adjust if exam was particularly hard/easy
        if current_mean < 55:  # Hard exam
            adjustment = (60 - current_mean) * 0.4  # 40% adjustment
            adjustments["difficulty"] = "hard"
            adjustments["adjustment"] = float(adjustment)
        elif current_mean > 65:  # Easy exam
            adjustment = (60 - current_mean) * 0.4
            adjustments["difficulty"] = "easy"
            adjustments["adjustment"] = float(adjustment)
        else:
            adjustment = 0
            adjustments["difficulty"] = "average"
            adjustments["adjustment"] = 0.0

        # Apply adjustment with caps
        adjustment = max(-8, min(8, adjustment))

        boundaries = {}
        for grade, cutoff in base_standards.items():
            boundaries[grade] = max(0.0, cutoff + adjustment)

        boundaries["Fail"] = 0.0

        return BoundarySet(
            method=ScoringMethod.CRITERION_REFERENCED,
            method_name="Criterion-Referenced (Standards-Based)",
            boundaries=boundaries,
            description=f"Fixed standards adjusted for exam difficulty (mean: {current_mean:.1f})",
            adjustments=adjustments,
        )

    @staticmethod
    def _calculate_statistical_std(scores: np.ndarray) -> BoundarySet:
        """Calculate boundaries using standard deviation method."""
        mean = float(np.mean(scores))
        std_dev = float(np.std(scores))

        boundaries = {
            "Distinction": mean + 1.5 * std_dev,
            "Upper Credit": mean + 0.8 * std_dev,
            "Credit": mean + 0.2 * std_dev,
            "Lower Credit": mean - 0.3 * std_dev,
            "Pass": mean - 0.8 * std_dev,
        }

        # Ensure boundaries are within 0-100
        for grade in boundaries:
            boundaries[grade] = max(0.0, min(100.0, boundaries[grade]))

        boundaries["Fail"] = 0.0

        return BoundarySet(
            method=ScoringMethod.STATISTICAL_STD,
            method_name="Statistical (Standard Deviation)",
            boundaries=boundaries,
            description=f"Boundaries based on mean ({mean:.1f}) ± n*std ({std_dev:.1f})",
            adjustments={"mean": mean, "std": std_dev},
        )

    @staticmethod
    def _calculate_statistical_zscore(scores: np.ndarray) -> BoundarySet:
        """Calculate boundaries using z-score method."""
        mean = float(np.mean(scores))
        std = float(np.std(scores))

        if std == 0:
            # All scores are the same
            boundaries = {
                "Distinction": mean,
                "Upper Credit": mean,
                "Credit": mean,
                "Lower Credit": mean,
                "Pass": mean,
            }
        else:
            # Z-score boundaries
            z_boundaries = {
                "Distinction": 1.5,
                "Upper Credit": 0.8,
                "Credit": 0.2,
                "Lower Credit": -0.3,
                "Pass": -0.8,
            }

            boundaries = {}
            for grade, z_score in z_boundaries.items():
                score = mean + z_score * std
                boundaries[grade] = max(0.0, min(100.0, score))

        boundaries["Fail"] = 0.0

        return BoundarySet(
            method=ScoringMethod.STATISTICAL_ZSCORE,
            method_name="Statistical (Z-Score)",
            boundaries=boundaries,
            description=f"Boundaries based on z-scores (mean: {mean:.1f}, std: {std:.1f})",
            adjustments={"mean": mean, "std": std},
        )

    @staticmethod
    def _calculate_fixed_distribution(
        scores: np.ndarray, target_percentages: dict[str, float] | None = None
    ) -> BoundarySet:
        """Calculate boundaries to enforce specific grade percentages."""
        if target_percentages is None:
            # Default distribution
            target_percentages = {
                "Distinction": 5.0,
                "Upper Credit": 15.0,
                "Credit": 30.0,
                "Lower Credit": 30.0,
                "Pass": 15.0,
                "Fail": 5.0,
            }

        # Calculate cumulative percentiles
        cumulative = 100.0
        boundaries = {}

        for grade in ["Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass"]:
            if grade in target_percentages:
                percentile = cumulative - target_percentages[grade]
                boundaries[grade] = float(np.percentile(scores, percentile))
                cumulative = percentile

        boundaries["Fail"] = 0.0

        return BoundarySet(
            method=ScoringMethod.FIXED_DISTRIBUTION,
            method_name="Fixed Distribution",
            boundaries=boundaries,
            description="Boundaries calculated to achieve target grade distribution",
            adjustments={"target_percentages": target_percentages},
        )

    @staticmethod
    def _calculate_modified_curve(scores: np.ndarray) -> BoundarySet:
        """Calculate boundaries with modified curve based on exam difficulty."""
        mean = float(np.mean(scores))

        # Start with percentile-based
        percentiles = {
            "Distinction": 95,
            "Upper Credit": 80,
            "Credit": 50,
            "Lower Credit": 20,
            "Pass": 5,
        }

        boundaries = {}
        for grade, percentile in percentiles.items():
            boundaries[grade] = float(np.percentile(scores, percentile))

        # Apply difficulty adjustment
        if mean < 55:  # Hard exam
            adjustment = (60 - mean) * 0.25  # 25% adjustment
            adjustment = max(-5, min(5, adjustment))  # Cap at ±5
            for grade in boundaries:
                if grade != "Fail":
                    boundaries[grade] += adjustment
        elif mean > 65:  # Easy exam
            adjustment = (60 - mean) * 0.25
            adjustment = max(-5, min(5, adjustment))
            for grade in boundaries:
                if grade != "Fail":
                    boundaries[grade] += adjustment

        # Ensure boundaries are within 0-100
        for grade in boundaries:
            boundaries[grade] = max(0.0, min(100.0, boundaries[grade]))

        boundaries["Fail"] = 0.0

        return BoundarySet(
            method=ScoringMethod.MODIFIED_CURVE,
            method_name="Modified Curve",
            boundaries=boundaries,
            description=f"Percentile-based with difficulty adjustment (mean: {mean:.1f})",
            adjustments={"mean": mean, "adjustment_applied": mean < 55 or mean > 65},
        )

    @staticmethod
    def _calculate_mastery_based(scores: np.ndarray) -> BoundarySet:
        """Calculate boundaries using mastery-based competency thresholds."""
        mastery_levels = {
            "Distinction": 90.0,  # Mastery
            "Upper Credit": 80.0,  # Proficient
            "Credit": 70.0,  # Competent
            "Lower Credit": 60.0,  # Developing
            "Pass": 50.0,  # Basic
        }

        boundaries = mastery_levels.copy()
        boundaries["Fail"] = 0.0

        return BoundarySet(
            method=ScoringMethod.MASTERY_BASED,
            method_name="Mastery-Based",
            boundaries=boundaries,
            description="Fixed competency thresholds regardless of distribution",
        )

    @staticmethod
    def _calculate_hybrid(scores: np.ndarray) -> BoundarySet:
        """Calculate boundaries using hybrid method (percentile + standards)."""

        # Start with percentile-based
        percentiles = {
            "Distinction": 95,
            "Upper Credit": 80,
            "Credit": 50,
            "Lower Credit": 20,
            "Pass": 5,
        }

        boundaries = {}
        for grade, percentile in percentiles.items():
            boundaries[grade] = float(np.percentile(scores, percentile))

        # Ensure minimum gaps between grades
        grade_order = ["Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass"]
        adjustments_made = []

        for i in range(len(grade_order) - 1):
            higher = grade_order[i]
            lower = grade_order[i + 1]
            gap = boundaries[higher] - boundaries[lower]

            # Ensure minimum gap of 5 marks between grades
            if gap < 5:
                boundaries[higher] = boundaries[lower] + 5
                adjustments_made.append(f"{higher} adjusted to maintain gap")

        boundaries["Fail"] = 0.0

        return BoundarySet(
            method=ScoringMethod.HYBRID,
            method_name="Hybrid (Percentile + Standards)",
            boundaries=boundaries,
            description="Percentile-based with minimum gap enforcement",
            adjustments={"adjustments_made": adjustments_made} if adjustments_made else None,
        )

    @staticmethod
    def calculate_grade_distribution(
        scores: list[float], boundaries: dict[str, float]
    ) -> GradeDistribution:
        """Calculate grade distribution based on boundaries."""
        if not scores:
            return GradeDistribution(
                grade_counts={}, grade_percentages={}, pass_rate=None, distinction_rate=None
            )

        scores_array = np.array(scores)
        grade_counts: dict[str, int] = {}

        # Sort boundaries from highest to lowest
        sorted_grades = sorted(
            [(g, b) for g, b in boundaries.items() if g != "Fail"],
            key=lambda x: x[1],
            reverse=True,
        )

        for grade, cutoff in sorted_grades:
            if grade == "Distinction":
                count = int(np.sum(scores_array >= cutoff))
            else:
                # Find next higher grade
                higher_cutoffs = [c for g, c in sorted_grades if c > cutoff]
                if higher_cutoffs:
                    next_higher = min(higher_cutoffs)
                    count = int(np.sum((scores_array >= cutoff) & (scores_array < next_higher)))
                else:
                    count = int(np.sum(scores_array >= cutoff))
            grade_counts[grade] = count

        # FAIL is everyone else
        passed = sum(grade_counts.values())
        grade_counts["Fail"] = len(scores) - passed

        # Calculate percentages
        total = len(scores)
        grade_percentages: dict[str, float] = {}
        for grade, count in grade_counts.items():
            grade_percentages[grade] = round((count / total) * 100, 2) if total > 0 else 0.0

        # Calculate pass rate and distinction rate
        pass_rate = None
        distinction_rate = None
        if total > 0:
            fail_count = grade_counts.get("Fail", 0)
            passed_count = total - fail_count
            pass_rate = round((passed_count / total) * 100, 2)

            distinction_count = grade_counts.get("Distinction", 0)
            distinction_rate = round((distinction_count / total) * 100, 2)

        return GradeDistribution(
            grade_counts=grade_counts,
            grade_percentages=grade_percentages,
            pass_rate=pass_rate,
            distinction_rate=distinction_rate,
        )

    @staticmethod
    def calculate_impact_metrics(
        scores: list[float], boundaries: dict[str, float]
    ) -> ImpactMetrics:
        """Calculate impact metrics for a boundary set."""
        if not scores:
            return ImpactMetrics(
                total_students=0,
                pass_rate=None,
                distinction_rate=None,
                borderline_candidates=[],
                warnings=[],
                recommendations=[],
            )

        scores_array = np.array(scores)
        total_students = len(scores)

        # Calculate grade distribution
        grade_dist = ScoresAnalysisService.calculate_grade_distribution(scores, boundaries)
        pass_rate = grade_dist.pass_rate
        distinction_rate = grade_dist.distinction_rate

        # Calculate average gap between grades
        grade_order = ["Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass"]
        gaps = []
        for i in range(len(grade_order) - 1):
            higher = grade_order[i]
            lower = grade_order[i + 1]
            if higher in boundaries and lower in boundaries:
                gap = boundaries[higher] - boundaries[lower]
                gaps.append(gap)
        avg_gap = float(np.mean(gaps)) if gaps else None

        # Analyze borderline candidates
        borderline_candidates: list[BorderlineAnalysis] = []
        for grade in ["Distinction", "Upper Credit", "Credit", "Lower Credit", "Pass"]:
            if grade in boundaries:
                cutoff = boundaries[grade]
                # Count candidates within ±2 marks of boundary
                borderline = int(
                    np.sum((scores_array >= cutoff - 2) & (scores_array < cutoff + 2))
                )
                borderline_percentage = round((borderline / total_students) * 100, 2) if total_students > 0 else 0.0
                borderline_candidates.append(
                    BorderlineAnalysis(
                        grade=grade,
                        cutoff=cutoff,
                        borderline_count=borderline,
                        borderline_percentage=borderline_percentage,
                    )
                )

        # Generate warnings and recommendations
        warnings: list[str] = []
        recommendations: list[str] = []

        # Check pass cutoff
        pass_cutoff = boundaries.get("Pass", 0)
        if pass_cutoff < 40:
            warnings.append(f"PASS cutoff ({pass_cutoff}) may be too low for professional certification")
        elif pass_cutoff > 55:
            warnings.append(f"PASS cutoff ({pass_cutoff}) may be too high")

        # Check distinction rate
        if distinction_rate and distinction_rate > 10:
            warnings.append(f"Distinction rate ({distinction_rate:.1f}%) too high - consider raising cutoff")
        elif distinction_rate and distinction_rate < 2:
            warnings.append(f"Distinction rate ({distinction_rate:.1f}%) too low - consider lowering cutoff")

        # Check gaps
        if avg_gap:
            if avg_gap < 3:
                warnings.append(f"Average gap between grades ({avg_gap:.1f}) is very small")
            elif avg_gap > 12:
                warnings.append(f"Average gap between grades ({avg_gap:.1f}) is large")

        # Recommendations
        if pass_rate and pass_rate < 50:
            recommendations.append("Low pass rate - consider reviewing exam difficulty or boundaries")
        elif pass_rate and pass_rate > 90:
            recommendations.append("Very high pass rate - consider raising standards")

        return ImpactMetrics(
            total_students=total_students,
            pass_rate=pass_rate,
            distinction_rate=distinction_rate,
            average_grade_gap=avg_gap,
            borderline_candidates=borderline_candidates,
            warnings=warnings,
            recommendations=recommendations,
        )

    @staticmethod
    async def analyze_single_method(
        session: AsyncSession,
        exam_subject_id: int,
        method: ScoringMethod,
        region: SchoolRegion | None = None,
        zone: SchoolZone | None = None,
        school_id: int | None = None,
        include_pending: bool = False,
        include_absent: bool = False,
        **kwargs: Any,
    ) -> MethodAnalysis:
        """Analyze a single scoring method."""
        # Get scores data
        scores, exam_subject, metadata = await ScoresAnalysisService.get_scores_data(
            session,
            exam_subject_id,
            region,
            zone,
            school_id,
            include_pending,
            include_absent,
        )

        if not scores:
            raise ValueError("No scores available for analysis")

        # Calculate boundaries
        boundary_set = ScoresAnalysisService.calculate_boundaries_by_method(scores, method, **kwargs)

        # Calculate grade distribution
        grade_distribution = ScoresAnalysisService.calculate_grade_distribution(
            scores, boundary_set.boundaries
        )

        # Calculate impact metrics
        impact_metrics = ScoresAnalysisService.calculate_impact_metrics(
            scores, boundary_set.boundaries
        )

        # Calculate score statistics
        score_stats = calculate_statistics(scores)

        return MethodAnalysis(
            method=method,
            method_name=boundary_set.method_name,
            boundaries=boundary_set,
            grade_distribution=grade_distribution,
            impact_metrics=impact_metrics,
            score_statistics=score_stats,
            scores=scores,  # Include raw scores for visualization
        )

    @staticmethod
    async def compare_methods(
        session: AsyncSession,
        exam_subject_id: int,
        methods: list[ScoringMethod],
        region: SchoolRegion | None = None,
        zone: SchoolZone | None = None,
        school_id: int | None = None,
        include_pending: bool = False,
        include_absent: bool = False,
        **kwargs: Any,
    ) -> MethodComparison:
        """Compare multiple scoring methods."""
        if len(methods) < 2:
            raise ValueError("At least 2 methods required for comparison")

        # Get scores data once
        scores, exam_subject, metadata = await ScoresAnalysisService.get_scores_data(
            session,
            exam_subject_id,
            region,
            zone,
            school_id,
            include_pending,
            include_absent,
        )

        if not scores:
            raise ValueError("No scores available for analysis")

        scores_array = np.array(scores)

        # Analyze each method
        method_items: list[MethodComparisonItem] = []
        for method in methods:
            boundary_set = ScoresAnalysisService.calculate_boundaries_by_method(
                scores, method, **kwargs
            )
            grade_distribution = ScoresAnalysisService.calculate_grade_distribution(
                scores, boundary_set.boundaries
            )
            impact_metrics = ScoresAnalysisService.calculate_impact_metrics(
                scores, boundary_set.boundaries
            )

            method_items.append(
                MethodComparisonItem(
                    method=method,
                    method_name=boundary_set.method_name,
                    boundaries=boundary_set.boundaries,
                    grade_distribution=grade_distribution,
                    impact_metrics=impact_metrics,
                )
            )

        # Calculate impact comparison (how many students affected)
        students_affected: dict[str, int] = {}
        grade_changes: dict[str, dict[str, int]] = {}

        # For each method, calculate how many students would get different grades
        # compared to the first method (baseline)
        if len(method_items) > 1:
            baseline_boundaries = method_items[0].boundaries
            baseline_grades = ScoresAnalysisService._assign_grades(scores_array, baseline_boundaries)

            for method_item in method_items[1:]:
                method_grades = ScoresAnalysisService._assign_grades(
                    scores_array, method_item.boundaries
                )
                # Count differences
                differences = baseline_grades != method_grades
                affected_count = int(np.sum(differences))
                students_affected[method_item.method_name] = affected_count

                # Count grade changes
                changes: dict[str, int] = {}
                for baseline_grade, method_grade in zip(
                    baseline_grades, method_grades, strict=True
                ):
                    if baseline_grade != method_grade:
                        change_key = f"{baseline_grade}→{method_grade}"
                        changes[change_key] = changes.get(change_key, 0) + 1
                grade_changes[method_item.method_name] = changes

        # Generate recommendations
        recommendations: list[str] = []
        if len(method_items) > 0:
            # Find method with most balanced distribution
            pass_rates = [
                (item.method_name, item.impact_metrics.pass_rate)
                for item in method_items
                if item.impact_metrics.pass_rate is not None
            ]
            if pass_rates:
                # Recommend method with pass rate closest to 70%
                best_method = min(pass_rates, key=lambda x: abs(x[1] - 70) if x[1] else 100)
                recommendations.append(
                    f"Consider {best_method[0]} for balanced pass rate ({best_method[1]:.1f}%)"
                )

        impact_comparison = ImpactComparison(
            students_affected=students_affected, grade_changes=grade_changes
        ) if students_affected else None

        return MethodComparison(
            methods=method_items,
            impact_comparison=impact_comparison,
            recommendations=recommendations,
            scores=scores,  # Include raw scores for visualization
        )

    @staticmethod
    def _assign_grades(scores: np.ndarray, boundaries: dict[str, float]) -> np.ndarray:
        """Assign grades to scores based on boundaries."""
        grades = np.full(len(scores), "Fail", dtype=object)

        # Sort boundaries from highest to lowest
        sorted_grades = sorted(
            [(g, b) for g, b in boundaries.items() if g != "Fail"],
            key=lambda x: x[1],
            reverse=True,
        )

        for grade, cutoff in sorted_grades:
            if grade == "Distinction":
                mask = scores >= cutoff
            else:
                # Find next higher grade
                higher_cutoffs = [c for g, c in sorted_grades if c > cutoff]
                if higher_cutoffs:
                    next_higher = min(higher_cutoffs)
                    mask = (scores >= cutoff) & (scores < next_higher)
                else:
                    mask = scores >= cutoff
            grades[mask] = grade

        return grades
