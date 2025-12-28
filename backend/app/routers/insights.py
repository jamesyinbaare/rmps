"""API endpoints for subject performance insights."""

import json
import logging

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.dependencies.database import DBSessionDep
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
from app.schemas.insights import (
    ComponentStats,
    FilterInfo,
    FilterOptions,
    HistogramData,
    RawScoresResponse,
    SchoolOption,
    SubjectPerformanceStatistics,
    BinData,
)
from app.schemas.scores_analysis import (
    BoundaryAnalysisRequest,
    BoundaryComparisonRequest,
    MethodAnalysis,
    MethodComparison,
)
from app.services.scores_analysis_service import ScoresAnalysisService
from app.utils.score_utils import ABSENT_RESULT_SENTINEL, calculate_grade, is_grade_pending
from app.utils.statistics_utils import calculate_percentiles, calculate_statistics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/insights", tags=["insights"])


def get_filter_info(
    region: SchoolRegion | None = None,
    zone: SchoolZone | None = None,
    school_id: int | None = None,
    school_name: str | None = None,
) -> FilterInfo:
    """Create FilterInfo from query parameters."""
    return FilterInfo(
        region=region.value if region else None,
        zone=zone.value if zone else None,
        school_id=school_id,
        school_name=school_name,
    )


def apply_filters(
    stmt,
    region: SchoolRegion | None = None,
    zone: SchoolZone | None = None,
    school_id: int | None = None,
):
    """Apply region, zone, and school filters to a query."""
    if region:
        stmt = stmt.where(School.region == region)
    if zone:
        stmt = stmt.where(School.zone == zone)
    if school_id:
        stmt = stmt.where(School.id == school_id)
    return stmt


@router.get("/exam-subject/{exam_subject_id}/statistics", response_model=SubjectPerformanceStatistics)
async def get_subject_performance_statistics(
    exam_subject_id: int,
    session: DBSessionDep,
    region: SchoolRegion | None = Query(None, description="Filter by school region"),
    zone: SchoolZone | None = Query(None, description="Filter by school zone"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    grade_ranges_json: str | None = Query(None, description="Optional grade ranges JSON for preview mode"),
    include_pending: bool = Query(False, description="Include pending candidates as 0.0 in calculations"),
    include_absent: bool = Query(False, description="Include absent candidates as 0.0 in calculations"),
) -> SubjectPerformanceStatistics:
    """
    Get performance statistics for an exam subject.

    Supports filtering by region, zone, and school.
    Supports preview mode with test grade ranges via grade_ranges_json parameter.
    """
    # Get exam subject
    exam_subject_stmt = select(ExamSubject, Subject).join(Subject, ExamSubject.subject_id == Subject.id).where(
        ExamSubject.id == exam_subject_id
    )
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject_row = exam_subject_result.first()
    if not exam_subject_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam subject not found")

    exam_subject, subject = exam_subject_row

    # Get school name if school_id filter is applied
    school_name = None
    if school_id:
        school_stmt = select(School).where(School.id == school_id)
        school_result = await session.execute(school_stmt)
        school = school_result.scalar_one_or_none()
        if school:
            school_name = school.name

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
    stmt = apply_filters(stmt, region, zone, school_id)

    result = await session.execute(stmt)
    rows = result.all()

    # Parse grade ranges (use provided or current)
    grade_ranges = None
    if grade_ranges_json:
        try:
            grade_ranges = json.loads(grade_ranges_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid grade_ranges_json format")
    else:
        grade_ranges = exam_subject.grade_ranges_json

    # Process scores
    total_candidates = len(rows)
    processed_scores: list[float] = []
    absent_count = 0
    pending_count = 0

    obj_scores: list[float] = []
    essay_scores: list[float] = []
    pract_scores: list[float] = []

    grade_distribution: dict[str, int] = {}

    for subject_score, _subject_reg, _exam_reg, _candidate, _school in rows:
        total_score = subject_score.total_score

        # Process scores based on inclusion flags
        if total_score == ABSENT_RESULT_SENTINEL:
            absent_count += 1
            if include_absent:
                # Treat absent as 0.0 when included
                processed_scores.append(0.0)
        elif total_score == 0.0:
            # Check if actually pending
            if is_grade_pending(subject_score, exam_subject):
                pending_count += 1
                if include_pending:
                    # Treat pending as 0.0 when included
                    processed_scores.append(0.0)
            else:
                # Not pending, just a zero score
                processed_scores.append(total_score)
        else:
            # Valid score > 0
            processed_scores.append(total_score)

        # Collect component scores
        if subject_score.obj_normalized is not None:
            obj_scores.append(subject_score.obj_normalized)
        if subject_score.essay_normalized is not None:
            essay_scores.append(subject_score.essay_normalized)
        if subject_score.pract_normalized is not None:
            pract_scores.append(subject_score.pract_normalized)

        # Calculate grade if ranges available
        # Include grades for pending/absent when they're included in calculations
        should_calculate_grade = False
        score_for_grade = total_score

        if total_score == ABSENT_RESULT_SENTINEL:
            if include_absent and grade_ranges:
                should_calculate_grade = True
                score_for_grade = 0.0
        elif total_score == 0.0:
            if is_grade_pending(subject_score, exam_subject):
                if include_pending and grade_ranges:
                    should_calculate_grade = True
                    score_for_grade = 0.0
            elif grade_ranges:
                # Not pending, just zero score
                should_calculate_grade = True
                score_for_grade = 0.0
        elif total_score > 0 and grade_ranges:
            should_calculate_grade = True
            score_for_grade = total_score

        if should_calculate_grade:
            grade = calculate_grade(score_for_grade, grade_ranges, subject_score, exam_subject)
            if grade:
                grade_name = grade.value
                grade_distribution[grade_name] = grade_distribution.get(grade_name, 0) + 1

    # Calculate statistics
    score_stats = calculate_statistics(processed_scores)
    percentiles_dict = calculate_percentiles(processed_scores, [25, 50, 75, 90, 95])

    # Calculate grade percentages and pass rate
    grade_percentages: dict[str, float] = {}
    pass_rate = None
    if grade_distribution and processed_scores:
        total_graded = sum(grade_distribution.values())
        for grade_name, count in grade_distribution.items():
            grade_percentages[grade_name] = round((count / total_graded) * 100, 2)

        # Pass rate = percentage who didn't get Fail
        fail_count = grade_distribution.get("Fail", 0)
        passed_count = total_graded - fail_count
        pass_rate = round((passed_count / total_graded) * 100, 2) if total_graded > 0 else None

    # Component statistics
    obj_stats = ComponentStats(**calculate_statistics(obj_scores)) if obj_scores else None
    essay_stats = ComponentStats(**calculate_statistics(essay_scores)) if essay_scores else None
    pract_stats = ComponentStats(**calculate_statistics(pract_scores)) if pract_scores else None

    return SubjectPerformanceStatistics(
        exam_subject_id=exam_subject_id,
        subject_code=subject.code,
        subject_name=subject.name,
        filters=get_filter_info(region, zone, school_id, school_name),
        total_candidates=total_candidates,
        processed_candidates=len(processed_scores),
        absent_candidates=absent_count,
        pending_candidates=pending_count,
        mean_score=score_stats["mean"],
        median_score=score_stats["median"],
        min_score=score_stats["min"],
        max_score=score_stats["max"],
        std_deviation=score_stats["std_deviation"],
        skewness=score_stats["skewness"],
        kurtosis=score_stats["kurtosis"],
        percentiles=percentiles_dict,
        grade_distribution=grade_distribution,
        grade_percentages=grade_percentages,
        pass_rate=pass_rate,
        obj_stats=obj_stats,
        essay_stats=essay_stats,
        pract_stats=pract_stats,
    )


@router.get("/exam-subject/{exam_subject_id}/histogram", response_model=HistogramData)
async def get_subject_histogram(
    exam_subject_id: int,
    session: DBSessionDep,
    bin_size: float = Query(5.0, ge=0.1, le=100.0, description="Bin size for histogram"),
    region: SchoolRegion | None = Query(None, description="Filter by school region"),
    zone: SchoolZone | None = Query(None, description="Filter by school zone"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    grade_ranges_json: str | None = Query(None, description="Optional grade ranges JSON for preview mode"),
    include_pending: bool = Query(False, description="Include pending candidates as 0.0 in calculations"),
    include_absent: bool = Query(False, description="Include absent candidates as 0.0 in calculations"),
) -> HistogramData:
    """
    Get histogram data for score distribution.

    Supports filtering by region, zone, and school.
    Supports preview mode with test grade ranges via grade_ranges_json parameter.
    """
    # Get exam subject
    exam_subject_stmt = select(ExamSubject).where(ExamSubject.id == exam_subject_id)
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject = exam_subject_result.scalar_one_or_none()
    if not exam_subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam subject not found")

    # Parse grade ranges (use provided or current)
    grade_ranges = None
    if grade_ranges_json:
        try:
            grade_ranges = json.loads(grade_ranges_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid grade_ranges_json format")
    else:
        grade_ranges = exam_subject.grade_ranges_json

    # Build query
    stmt = (
        select(SubjectScore, SubjectRegistration, ExamRegistration, Candidate, School)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .where(SubjectRegistration.exam_subject_id == exam_subject_id)
    )

    # Apply filters
    stmt = apply_filters(stmt, region, zone, school_id)

    result = await session.execute(stmt)
    rows = result.all()

    # Collect processed scores
    processed_scores: list[float] = []
    excluded_count = 0

    for subject_score, _subject_reg, _exam_reg, _candidate, _school in rows:
        total_score = subject_score.total_score

        # Process scores based on inclusion flags
        if total_score == ABSENT_RESULT_SENTINEL:
            if include_absent:
                # Treat absent as 0.0 when included
                processed_scores.append(0.0)
            else:
                excluded_count += 1
        elif total_score == 0.0:
            # Check if actually pending
            if is_grade_pending(subject_score, exam_subject):
                if include_pending:
                    # Treat pending as 0.0 when included
                    processed_scores.append(0.0)
                else:
                    excluded_count += 1
            else:
                # Not pending, just a zero score
                processed_scores.append(total_score)
        else:
            # Valid score > 0
            processed_scores.append(total_score)

    if not processed_scores:
        return HistogramData(
            bins=[],
            bin_size=bin_size,
            total_count=len(rows),
            excluded_count=excluded_count,
            filters=get_filter_info(region, zone, school_id),
        )

    # Create bins with whole number boundaries
    min_score = min(processed_scores)
    max_score = max(processed_scores)

    # Round bin_size to nearest integer for creating bins
    # This ensures bin boundaries are always whole numbers
    bin_size_rounded = round(bin_size)
    if bin_size_rounded < 1:
        bin_size_rounded = 1

    # Round min down and max up to whole number bin boundaries
    min_bin = int(min_score // bin_size_rounded) * bin_size_rounded
    max_bin = (int(max_score // bin_size_rounded) + 1) * bin_size_rounded

    # Ensure bin boundaries are whole numbers
    min_bin = int(min_bin)
    max_bin = int(max_bin)

    bins: list[BinData] = []
    total_processed = len(processed_scores)

    current_min = min_bin
    while current_min < max_bin:
        current_max = current_min + bin_size_rounded
        bin_min = int(current_min)
        bin_max = int(current_max)

        # Count scores in this bin
        # Use < for upper bound (exclusive) except for the last bin
        if current_max >= max_bin:
            count = sum(1 for score in processed_scores if bin_min <= score <= bin_max)
        else:
            count = sum(1 for score in processed_scores if bin_min <= score < bin_max)
        percentage = round((count / total_processed) * 100, 2) if total_processed > 0 else 0.0

        # Grade breakdown if grade ranges provided
        grade_breakdown: dict[str, int] | None = None
        if grade_ranges:
            grade_breakdown = {}
            for score in processed_scores:
                if current_max >= max_bin:
                    in_bin = bin_min <= score <= bin_max
                else:
                    in_bin = bin_min <= score < bin_max
                if in_bin:
                    # For histogram, we don't have subject_score/exam_subject, so pass None
                    # calculate_grade will still work for basic grade calculation
                    grade = calculate_grade(score, grade_ranges, None, None)
                    if grade:
                        grade_name = grade.value
                        grade_breakdown[grade_name] = grade_breakdown.get(grade_name, 0) + 1

        bins.append(
            BinData(
                range_label=f"{bin_min}-{bin_max}",
                min=float(bin_min),
                max=float(bin_max),
                count=count,
                percentage=percentage,
                grade_breakdown=grade_breakdown,
            )
        )

        current_min = current_max

    return HistogramData(
        bins=bins,
        bin_size=bin_size,
        total_count=len(rows),
        excluded_count=excluded_count,
        filters=get_filter_info(region, zone, school_id),
    )


@router.get("/exam-subject/{exam_subject_id}/scores", response_model=RawScoresResponse)
async def get_subject_raw_scores(
    exam_subject_id: int,
    session: DBSessionDep,
    region: SchoolRegion | None = Query(None, description="Filter by school region"),
    zone: SchoolZone | None = Query(None, description="Filter by school zone"),
    school_id: int | None = Query(None, description="Filter by school ID"),
    include_pending: bool = Query(False, description="Include pending candidates as 0.0 in calculations"),
    include_absent: bool = Query(False, description="Include absent candidates as 0.0 in calculations"),
) -> RawScoresResponse:
    """
    Get raw scores array for an exam subject.

    Returns the actual score values, not histogram bins.
    Supports filtering by region, zone, and school.
    """
    # Get exam subject
    exam_subject_stmt = select(ExamSubject).where(ExamSubject.id == exam_subject_id)
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject = exam_subject_result.scalar_one_or_none()
    if not exam_subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam subject not found")

    # Build query
    stmt = (
        select(SubjectScore, SubjectRegistration, ExamRegistration, Candidate, School)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .where(SubjectRegistration.exam_subject_id == exam_subject_id)
    )

    # Apply filters
    stmt = apply_filters(stmt, region, zone, school_id)

    result = await session.execute(stmt)
    rows = result.all()

    # Collect processed scores
    processed_scores: list[float] = []

    for subject_score, _subject_reg, _exam_reg, _candidate, _school in rows:
        total_score = subject_score.total_score

        # Process scores based on inclusion flags
        if total_score == ABSENT_RESULT_SENTINEL:
            if include_absent:
                # Treat absent as 0.0 when included
                processed_scores.append(0.0)
        elif total_score == 0.0:
            # Check if actually pending
            if is_grade_pending(subject_score, exam_subject):
                if include_pending:
                    # Treat pending as 0.0 when included
                    processed_scores.append(0.0)
            else:
                # Not pending, just a zero score
                processed_scores.append(total_score)
        else:
            # Valid score > 0
            processed_scores.append(total_score)

    return RawScoresResponse(
        scores=processed_scores,
        total_count=len(rows),
        processed_count=len(processed_scores),
        filters=get_filter_info(region, zone, school_id),
    )


@router.get("/exam-subject/{exam_subject_id}/filter-options", response_model=FilterOptions)
async def get_subject_filter_options(
    exam_subject_id: int,
    session: DBSessionDep,
) -> FilterOptions:
    """Get available filter options (regions, zones, schools) for an exam subject."""
    # Verify exam subject exists
    exam_subject_stmt = select(ExamSubject).where(ExamSubject.id == exam_subject_id)
    exam_subject_result = await session.execute(exam_subject_stmt)
    exam_subject = exam_subject_result.scalar_one_or_none()
    if not exam_subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam subject not found")

    # Get distinct regions
    regions_stmt = (
        select(School.region, func.count(func.distinct(SubjectScore.id)))
        .select_from(SubjectScore)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .where(SubjectRegistration.exam_subject_id == exam_subject_id)
        .group_by(School.region)
    )
    regions_result = await session.execute(regions_stmt)
    regions = [row[0].value for row in regions_result.all() if row[0]]

    # Get distinct zones
    zones_stmt = (
        select(School.zone, func.count(func.distinct(SubjectScore.id)))
        .select_from(SubjectScore)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .where(SubjectRegistration.exam_subject_id == exam_subject_id)
        .group_by(School.zone)
    )
    zones_result = await session.execute(zones_stmt)
    zones = [row[0].value for row in zones_result.all() if row[0]]

    # Get schools with candidate counts
    schools_stmt = (
        select(
            School.id,
            School.code,
            School.name,
            School.region,
            School.zone,
            func.count(func.distinct(SubjectScore.id)).label("candidate_count"),
        )
        .select_from(SubjectScore)
        .join(SubjectRegistration, SubjectScore.subject_registration_id == SubjectRegistration.id)
        .join(ExamRegistration, SubjectRegistration.exam_registration_id == ExamRegistration.id)
        .join(Candidate, ExamRegistration.candidate_id == Candidate.id)
        .join(School, Candidate.school_id == School.id)
        .where(SubjectRegistration.exam_subject_id == exam_subject_id)
        .group_by(School.id, School.code, School.name, School.region, School.zone)
        .order_by(School.name)
    )
    schools_result = await session.execute(schools_stmt)
    schools = [
        SchoolOption(
            id=row[0],
            code=row[1],
            name=row[2],
            region=row[3].value if row[3] else "",
            zone=row[4].value if row[4] else "",
            candidate_count=row[5] or 0,
        )
        for row in schools_result.all()
    ]

    return FilterOptions(regions=regions, zones=zones, schools=schools)


@router.post(
    "/exam-subject/{exam_subject_id}/boundary-analysis",
    response_model=MethodAnalysis,
    status_code=status.HTTP_200_OK,
)
async def analyze_boundary_method(
    exam_subject_id: int,
    request: BoundaryAnalysisRequest,
    session: DBSessionDep,
) -> MethodAnalysis:
    """
    Analyze a single scoring method for boundary setting.

    Supports filtering by region, zone, and school.
    Returns calculated boundaries, grade distribution, and impact metrics.
    """
    try:
        # Convert string region/zone to enum if provided
        region_enum = None
        if request.region:
            try:
                region_enum = SchoolRegion(request.region)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid region: {request.region}",
                )

        zone_enum = None
        if request.zone:
            try:
                zone_enum = SchoolZone(request.zone)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid zone: {request.zone}",
                )

        analysis = await ScoresAnalysisService.analyze_single_method(
            session=session,
            exam_subject_id=exam_subject_id,
            method=request.method,
            region=region_enum,
            zone=zone_enum,
            school_id=request.school_id,
            include_pending=request.include_pending,
            include_absent=request.include_absent,
        )

        return analysis
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception("Error analyzing boundary method")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error analyzing boundary method: {str(e)}",
        )


@router.post(
    "/exam-subject/{exam_subject_id}/boundary-comparison",
    response_model=MethodComparison,
    status_code=status.HTTP_200_OK,
)
async def compare_boundary_methods(
    exam_subject_id: int,
    request: BoundaryComparisonRequest,
    session: DBSessionDep,
) -> MethodComparison:
    """
    Compare multiple scoring methods for boundary setting.

    Supports filtering by region, zone, and school.
    Returns comparison of boundaries, grade distributions, and impact analysis.
    """
    try:
        # Convert string region/zone to enum if provided
        region_enum = None
        if request.region:
            try:
                region_enum = SchoolRegion(request.region)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid region: {request.region}",
                )

        zone_enum = None
        if request.zone:
            try:
                zone_enum = SchoolZone(request.zone)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid zone: {request.zone}",
                )

        comparison = await ScoresAnalysisService.compare_methods(
            session=session,
            exam_subject_id=exam_subject_id,
            methods=request.methods,
            region=region_enum,
            zone=zone_enum,
            school_id=request.school_id,
            include_pending=request.include_pending,
            include_absent=request.include_absent,
        )

        return comparison
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception("Error comparing boundary methods")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error comparing boundary methods: {str(e)}",
        )
