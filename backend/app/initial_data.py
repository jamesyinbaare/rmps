"""Script to generate initial dummy data for manual testing."""

import asyncio
from datetime import date, datetime

from sqlalchemy import insert, select

from app.dependencies.database import get_sessionmanager, initialize_db
from app.models import (
    Batch,
    Candidate,
    Exam,
    ExamRegistration,
    ExamSubject,
    Programme,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
    programme_subjects,
    school_programmes,
    school_subjects,
)


async def create_initial_data() -> None:
    """Create initial dummy data for testing."""
    sessionmanager = get_sessionmanager()
    async with initialize_db(sessionmanager):
        async with sessionmanager.session() as session:
            print("Starting initial data generation...")

            # Create Schools
            schools = await create_schools(session)
            print(f"Created {len(schools)} schools")

            # Create Subjects
            subjects = await create_subjects(session)
            print(f"Created {len(subjects)} subjects")

            # Create Programmes
            programmes = await create_programmes(session)
            print(f"Created {len(programmes)} programmes")

            # Create Associations
            await create_school_subject_associations(session, schools, subjects)
            print("Created school-subject associations")

            await create_school_programme_associations(session, schools, programmes)
            print("Created school-programme associations")

            await create_programme_subject_associations(session, programmes, subjects)
            print("Created programme-subject associations")

            # Create Candidates
            candidates = await create_candidates(session, schools, programmes)
            print(f"Created {len(candidates)} candidates")

            # Create Exams
            exams = await create_exams(session)
            print(f"Created {len(exams)} exams")

            # Create ExamSubjects
            await create_exam_subjects(session, exams, subjects)
            print("Created exam-subject associations")

            # Create ExamRegistrations
            exam_registrations = await create_exam_registrations(session, candidates, exams)
            print(f"Created {len(exam_registrations)} exam registrations")

            # Create SubjectRegistrations
            subject_registrations = await create_subject_registrations(
                session, exam_registrations, subjects, exams
            )
            print(f"Created {len(subject_registrations)} subject registrations")

            # Create SubjectScores
            await create_subject_scores(session, subject_registrations)
            print("Created subject scores")


            await session.commit()
            print("Initial data generation completed successfully!")


async def create_schools(session) -> list[School]:
    """Create schools if they don't exist."""
    schools_data = [
        {"code": "817006", "name": "Accra Technical Training Center"},
        {"code": "817105", "name": "ST. Prospers College"},
    ]

    schools = []
    for school_data in schools_data:
        stmt = select(School).where(School.code == school_data["code"])
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            school = School(code=school_data["code"], name=school_data["name"])
            session.add(school)
            schools.append(school)
        else:
            schools.append(existing)

    await session.flush()
    return schools


async def create_subjects(session) -> list[Subject]:
    """Create subjects if they don't exist."""
    subjects_data = [
        {"code": "701", "name": "English Language"},
        {"code": "702", "name": "Social Studies"},
        {"code": "703", "name": "Integrated Science"},
        {"code": "704", "name": "Mathematics (Core)"},
        {"code": "705", "name": "Entrepreneurship"}
    ]

    subjects = []
    for subject_data in subjects_data:
        stmt = select(Subject).where(Subject.code == subject_data["code"])
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            subject = Subject(code=subject_data["code"], name=subject_data["name"])
            session.add(subject)
            subjects.append(subject)
        else:
            subjects.append(existing)

    await session.flush()
    return subjects


async def create_programmes(session) -> list[Programme]:
    """Create programmes if they don't exist."""
    programmes_data = [
        {"code": "C60", "name": "Hospitality and Catering Management"},
        {"code": "C62", "name": "Fashion Designing Technology"},
        {"code": "C42", "name": "Electrical Engineering Technology"},
    ]

    programmes = []
    for programme_data in programmes_data:
        stmt = select(Programme).where(Programme.code == programme_data["code"])
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            programme = Programme(code=programme_data["code"], name=programme_data["name"])
            session.add(programme)
            programmes.append(programme)
        else:
            programmes.append(existing)

    await session.flush()
    return programmes


async def create_school_subject_associations(session, schools: list[School], subjects: list[Subject]) -> None:
    """Create school-subject associations."""
    for school in schools:
        for subject in subjects:
            stmt = select(school_subjects).where(
                school_subjects.c.school_id == school.id, school_subjects.c.subject_id == subject.id
            )
            result = await session.execute(stmt)
            existing = result.first()

            if not existing:
                await session.execute(
                    insert(school_subjects).values(school_id=school.id, subject_id=subject.id)
                )

    await session.flush()


async def create_school_programme_associations(
    session, schools: list[School], programmes: list[Programme]
) -> None:
    """Create school-programme associations."""
    # Each school offers all programmes
    for school in schools:
        for programme in programmes:
            stmt = select(school_programmes).where(
                school_programmes.c.school_id == school.id, school_programmes.c.programme_id == programme.id
            )
            result = await session.execute(stmt)
            existing = result.first()

            if not existing:
                await session.execute(
                    insert(school_programmes).values(school_id=school.id, programme_id=programme.id)
                )

    await session.flush()


async def create_programme_subject_associations(
    session, programmes: list[Programme], subjects: list[Subject]
) -> None:
    """Create programme-subject associations with is_core flags."""
    # Every programme automatically includes subjects 701, 703, and 704
    required_subject_codes = {"701", "703", "704"}

    for programme in programmes:
        for subject in subjects:
            stmt = select(programme_subjects).where(
                programme_subjects.c.programme_id == programme.id,
                programme_subjects.c.subject_id == subject.id,
            )
            result = await session.execute(stmt)
            existing = result.first()

            if not existing:
                # Subjects 701, 703, 704 are core in all programmes
                # Subject 702 (Social Studies) is also core
                # Subject 705 (Entrepreneurship) can be elective or core depending on programme
                is_core = subject.code in required_subject_codes or subject.code == "702"
                await session.execute(
                    insert(programme_subjects).values(
                        programme_id=programme.id, subject_id=subject.id, is_core=is_core
                    )
                )

    await session.flush()


async def create_candidates(
    session, schools: list[School], programmes: list[Programme]
) -> list[Candidate]:
    """Create candidates if they don't exist."""
    candidates_data = [
        {
            "school_code": "817006",
            "name": "John Doe",
            "index_number": "817006001",
            "date_of_birth": date(2006, 5, 15),
            "gender": "M",
            "programme_code": "C60",
        },
        {
            "school_code": "817006",
            "name": "Jane Smith",
            "index_number": "817006002",
            "date_of_birth": date(2007, 8, 22),
            "gender": "F",
            "programme_code": "C62",
        },
        {
            "school_code": "817006",
            "name": "Michael Johnson",
            "index_number": "817006003",
            "date_of_birth": date(2006, 3, 10),
            "gender": "M",
            "programme_code": "C42",
        },
        {
            "school_code": "817105",
            "name": "Sarah Williams",
            "index_number": "817105001",
            "date_of_birth": date(2007, 11, 5),
            "gender": "F",
            "programme_code": "C60",
        },
        {
            "school_code": "817105",
            "name": "David Brown",
            "index_number": "817105002",
            "date_of_birth": date(2006, 7, 18),
            "gender": "M",
            "programme_code": "C62",
        },
        {
            "school_code": "817105",
            "name": "Emily Davis",
            "index_number": "817105003",
            "date_of_birth": date(2008, 2, 28),
            "gender": "F",
            "programme_code": "C42",
        },
    ]

    candidates = []
    for candidate_data in candidates_data:
        stmt = select(Candidate).where(Candidate.index_number == candidate_data["index_number"])
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            # Find school and programme
            school_stmt = select(School).where(School.code == candidate_data["school_code"])
            school_result = await session.execute(school_stmt)
            school = school_result.scalar_one()

            programme_stmt = select(Programme).where(Programme.code == candidate_data["programme_code"])
            programme_result = await session.execute(programme_stmt)
            programme = programme_result.scalar_one()

            candidate = Candidate(
                school_id=school.id,
                programme_id=programme.id,
                name=candidate_data["name"],
                index_number=candidate_data["index_number"],
                date_of_birth=candidate_data["date_of_birth"],
                gender=candidate_data["gender"],
            )
            session.add(candidate)
            candidates.append(candidate)
        else:
            candidates.append(existing)

    await session.flush()
    return candidates


async def create_exams(session) -> list[Exam]:
    """Create exams if they don't exist."""
    exams_data = [
        {
            "name": "Certificate II Examination",
            "series": "MAY/JUNE",
            "year": 2024,
            "number_of_series": 4,
        },
        {
            "name": "Certificate II Examination",
            "series": "NOV/DEC",
            "year": 2023,
            "number_of_series": 4,
        },
    ]

    exams = []
    for exam_data in exams_data:
        stmt = select(Exam).where(
            Exam.name == exam_data["name"],
            Exam.series == exam_data["series"],
            Exam.year == exam_data["year"],
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            exam = Exam(
                name=exam_data["name"],
                series=exam_data["series"],
                year=exam_data["year"],
                number_of_series=exam_data["number_of_series"],
            )
            session.add(exam)
            exams.append(exam)
        else:
            exams.append(existing)

    await session.flush()
    return exams


async def create_exam_subjects(session, exams: list[Exam], subjects: list[Subject]) -> None:
    """Create exam-subject associations."""
    # Core subjects for Certificate II Examination
    core_subject_codes = {"701", "702", "703", "704"}

    for exam in exams:
        for subject in subjects:
            if subject.code in core_subject_codes:
                stmt = select(ExamSubject).where(
                    ExamSubject.exam_id == exam.id, ExamSubject.subject_id == subject.id
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                if not existing:
                    # Typical percentages: 40% MCQ, 60% Essay
                    exam_subject = ExamSubject(
                        exam_id=exam.id,
                        subject_id=subject.id,
                        mcq_percentage=40.0,
                        essay_percentage=60.0,
                        practical_percentage=None,
                    )
                    session.add(exam_subject)

    await session.flush()


async def create_exam_registrations(
    session, candidates: list[Candidate], exams: list[Exam]
) -> list[ExamRegistration]:
    """Create exam registrations."""
    exam_registrations = []

    # Each candidate registered for at least one exam
    for idx, candidate in enumerate(candidates):
        # Register for the most recent exam (2024 MAY/JUNE)
        exam_2024 = next((e for e in exams if e.year == 2024), None)
        if exam_2024:
            stmt = select(ExamRegistration).where(
                ExamRegistration.candidate_id == candidate.id, ExamRegistration.exam_id == exam_2024.id
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if not existing:
                exam_reg = ExamRegistration(candidate_id=candidate.id, exam_id=exam_2024.id)
                session.add(exam_reg)
                exam_registrations.append(exam_reg)

        # Some candidates also registered for 2023 exam
        if idx % 2 == 0:  # Every other candidate
            exam_2023 = next((e for e in exams if e.year == 2023), None)
            if exam_2023:
                stmt = select(ExamRegistration).where(
                    ExamRegistration.candidate_id == candidate.id, ExamRegistration.exam_id == exam_2023.id
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                if not existing:
                    exam_reg = ExamRegistration(candidate_id=candidate.id, exam_id=exam_2023.id)
                    session.add(exam_reg)
                    exam_registrations.append(exam_reg)

    await session.flush()
    return exam_registrations


async def create_subject_registrations(
    session, exam_registrations: list[ExamRegistration], subjects: list[Subject], exams: list[Exam]
) -> list[SubjectRegistration]:
    """Create subject registrations."""
    subject_registrations = []
    core_subject_codes = {"701", "702", "703", "704"}

    for exam_reg in exam_registrations:
        # Get the exam to know number_of_series
        exam_stmt = select(Exam).where(Exam.id == exam_reg.exam_id)
        exam_result = await session.execute(exam_stmt)
        exam = exam_result.scalar_one()

        # Register for all core subjects
        for subject in subjects:
            if subject.code in core_subject_codes:
                stmt = select(SubjectRegistration).where(
                    SubjectRegistration.exam_registration_id == exam_reg.id,
                    SubjectRegistration.subject_id == subject.id,
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                if not existing:
                    subject_reg = SubjectRegistration(
                        exam_registration_id=exam_reg.id, subject_id=subject.id, series=None
                    )
                    session.add(subject_reg)
                    subject_registrations.append(subject_reg)

    await session.flush()
    return subject_registrations


async def create_subject_scores(
    session, subject_registrations: list[SubjectRegistration]
) -> None:
    """Create subject scores for subject registrations."""
    for subject_reg in subject_registrations:
        stmt = select(SubjectScore).where(SubjectScore.subject_registration_id == subject_reg.id)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            # Generate realistic scores
            mcq_score = 35.0 + (subject_reg.id % 15)  # 35-50
            essay_score = 40.0 + (subject_reg.id % 20)  # 40-60
            total_score = mcq_score + essay_score

            subject_score = SubjectScore(
                subject_registration_id=subject_reg.id,
                mcq_raw_score=mcq_score,
                essay_raw_score=essay_score,
                practical_raw_score=None,
                total_score=total_score,
            )
            session.add(subject_score)

    await session.flush()




if __name__ == "__main__":
    asyncio.run(create_initial_data())
