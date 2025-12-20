"""Script to generate initial dummy data for manual testing."""

import asyncio
from datetime import date, datetime

from sqlalchemy import insert, select

from app.dependencies.database import get_sessionmanager, initialize_db
from app.models import (
    Candidate,
    Exam,
    ExamRegistration,
    ExamSubject,
    ExamType,
    Programme,
    School,
    Subject,
    SubjectRegistration,
    SubjectScore,
    SubjectType,
    programme_subjects,
    school_programmes,
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
    from app.models import SchoolRegion, SchoolZone

    schools_data = [
        {
            "code": "817006",
            "name": "Accra Technical Training Centre",
            "region": SchoolRegion.GREATER_ACCRA,
            "zone": SchoolZone.A,
        },
        {
            "code": "817105",
            "name": "ST. Prospers College",
            "region": SchoolRegion.GREATER_ACCRA,
            "zone": SchoolZone.B,
        },
    ]

    schools = []
    for school_data in schools_data:
        stmt = select(School).where(School.code == school_data["code"])
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            school = School(
                code=school_data["code"],
                name=school_data["name"],
                region=school_data["region"],
                zone=school_data["zone"],
            )
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
            # All subjects in initial data are CORE subjects
            # Subject type is set at the Subject level, but programme associations
            # determine if they're compulsory or optional (via is_compulsory and choice_group_id)
            subject_type = SubjectType.CORE
            subject = Subject(
                code=subject_data["code"],
                name=subject_data["name"],
                subject_type=subject_type,
            )
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
    """Create programme-subject associations with is_compulsory and choice_group_id."""
    # Define subject requirements:
    # - Compulsory core subjects: 701 (English), 703 (Integrated Science), 704 (Mathematics)
    # - Optional core subjects (choice group 1): 702 (Social Studies), 705 (Entrepreneurship)
    #   Candidates must choose one from this group
    compulsory_core_codes = {"701", "703", "704"}
    optional_core_group_1_codes = {"702", "705"}  # Social Studies OR Entrepreneurship
    optional_core_group_1_id = 1

    for programme in programmes:
        for subject in subjects:
            stmt = select(programme_subjects).where(
                programme_subjects.c.programme_id == programme.id,
                programme_subjects.c.subject_id == subject.id,
            )
            result = await session.execute(stmt)
            existing = result.first()

            if not existing:
                # Determine is_compulsory and choice_group_id based on subject code and type
                is_compulsory = None
                choice_group_id = None

                if subject.subject_type == SubjectType.CORE:
                    if subject.code in compulsory_core_codes:
                        is_compulsory = True
                        choice_group_id = None
                    elif subject.code in optional_core_group_1_codes:
                        is_compulsory = False
                        choice_group_id = optional_core_group_1_id
                    else:
                        # Default: make it compulsory if it's core but not in our lists
                        is_compulsory = True
                        choice_group_id = None
                # For ELECTIVE subjects, is_compulsory and choice_group_id remain None

                await session.execute(
                    insert(programme_subjects).values(
                        programme_id=programme.id,
                        subject_id=subject.id,
                        is_compulsory=is_compulsory,
                        choice_group_id=choice_group_id,
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
            "name": "WISDOM ALORNYEKU",
            "index_number": "006201250420",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "EMMANUEL NORTEY",
            "index_number": "006201250485",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "FESTUS AYITEY ARYEE",
            "index_number": "006201250544",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "ESTHER DEELA TETTEH",
            "index_number": "006201250722",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "SAMUEL OBENG ANSAH",
            "index_number": "006208250273",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "NANA KWAKU AGYEMAN DUAH",
            "index_number": "006211250608",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "MICHAEL AMARQUAYE",
            "index_number": "006212250539",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "ISRAEL AGYEKU DANSO",
            "index_number": "006221250027",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "EMMANUEL KWAKU ASAMOAH",
            "index_number": "006221250120",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "AHMED MOHAMMED",
            "index_number": "006221250458",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "KELVIN OWUSU GYAMFI",
            "index_number": "006221250512",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "NANA AKUA MBRAH AMISSAH",
            "index_number": "006221250708",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "CONSTANT YAO AGBOLI",
            "index_number": "006231250222",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "FAMOUS KWASI KWAMIVIE",
            "index_number": "006231250226",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "FAMOUS SENAYA",
            "index_number": "006231250230",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "SAMUEL BONNAH",
            "index_number": "006231250234",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "EUGENE AMOAKO SARPONG",
            "index_number": "006231250238",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "BEATRICE AYERKOR ARMAH",
            "index_number": "006231250242",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "EMMANUEL KORANTENG",
            "index_number": "006231250246",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "PAULINA ODI DARKO",
            "index_number": "006231250250",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "STACY DARKWA",
            "index_number": "006231250259",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "KUKUA BREBA TETTEH",
            "index_number": "006231250263",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "KELVIN KINGSLEY QUAYSON",
            "index_number": "006231250267",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "NIMATU MUSTAPHA",
            "index_number": "006231250271",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
        },
        {
            "school_code": "817006",
            "name": "DANIEL AZIZ AYANE",
            "index_number": "006231250276",
            "date_of_birth": None,
            "gender": None,
            "programme_code": None,
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
            # Find school
            school_stmt = select(School).where(School.code == candidate_data["school_code"])
            school_result = await session.execute(school_stmt)
            school = school_result.scalar_one()

            # Find programme if provided
            programme = None
            if candidate_data["programme_code"]:
                programme_stmt = select(Programme).where(Programme.code == candidate_data["programme_code"])
                programme_result = await session.execute(programme_stmt)
                programme = programme_result.scalar_one()

            candidate = Candidate(
                school_id=school.id,
                programme_id=programme.id if programme else None,
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
    from app.models import ExamType, ExamSeries

    exams_data = [
        {
            "exam_type": ExamType.CERTIFICATE_II,
            "series": ExamSeries.MAY_JUNE,
            "year": 2024,
            "number_of_series": 4,
        },
        {
            "exam_type": ExamType.CERTIFICATE_II,
            "series": ExamSeries.NOV_DEC,
            "year": 2024,
            "number_of_series": 4,
        },
        {
            "exam_type": ExamType.CERTIFICATE_II,
            "series": ExamSeries.NOV_DEC,
            "year": 2025,
            "number_of_series": 4,
        },
    ]

    exams = []
    for exam_data in exams_data:
        stmt = select(Exam).where(
            Exam.exam_type == exam_data["exam_type"],
            Exam.series == exam_data["series"],
            Exam.year == exam_data["year"],
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            exam = Exam(
                exam_type=exam_data["exam_type"],
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
                    # Typical percentages: 40% Objective, 60% Essay
                    exam_subject = ExamSubject(
                        exam_id=exam.id,
                        subject_id=subject.id,
                        obj_pct=40.0,
                        essay_pct=60.0,
                        pract_pct=None,
                        obj_max_score=None,
                        essay_max_score=None,
                        pract_max_score=None,
                    )
                    session.add(exam_subject)

    await session.flush()


async def create_exam_registrations(
    session, candidates: list[Candidate], exams: list[Exam]
) -> list[ExamRegistration]:
    """Create exam registrations."""
    from app.models import ExamType, ExamSeries

    exam_registrations = []

    # Get school 817006
    school_817006_stmt = select(School).where(School.code == "817006")
    school_817006_result = await session.execute(school_817006_stmt)
    school_817006 = school_817006_result.scalar_one_or_none()

    # Get Certificate II, NOV/DEC, 2025 exam
    exam_2025_novdec = next(
        (e for e in exams if e.year == 2025 and e.series == ExamSeries.NOV_DEC and e.exam_type == ExamType.CERTIFICATE_II),
        None
    )

    # Register all candidates from school 817006 for Certificate II, NOV/DEC, 2025
    for candidate in candidates:
        if school_817006 and candidate.school_id == school_817006.id and exam_2025_novdec:
            stmt = select(ExamRegistration).where(
                ExamRegistration.candidate_id == candidate.id, ExamRegistration.exam_id == exam_2025_novdec.id
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if not existing:
                exam_reg = ExamRegistration(
                    candidate_id=candidate.id, exam_id=exam_2025_novdec.id, index_number=candidate.index_number
                )
                session.add(exam_reg)
                exam_registrations.append(exam_reg)

    # Register other candidates for 2024 exams (existing logic)
    for idx, candidate in enumerate(candidates):
        if school_817006 and candidate.school_id == school_817006.id:
            continue  # Skip candidates from 817006 as they're already registered above

        # Register for the most recent exam (2024 MAY/JUNE)
        exam_2024 = next((e for e in exams if e.year == 2024), None)
        if exam_2024:
            stmt = select(ExamRegistration).where(
                ExamRegistration.candidate_id == candidate.id, ExamRegistration.exam_id == exam_2024.id
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if not existing:
                exam_reg = ExamRegistration(
                    candidate_id=candidate.id, exam_id=exam_2024.id, index_number=candidate.index_number
                )
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
                # Get the ExamSubject for this subject in this exam
                exam_subject_stmt = select(ExamSubject).where(
                    ExamSubject.exam_id == exam_reg.exam_id, ExamSubject.subject_id == subject.id
                )
                exam_subject_result = await session.execute(exam_subject_stmt)
                exam_subject = exam_subject_result.scalar_one_or_none()

                if not exam_subject:
                    continue  # Skip if ExamSubject doesn't exist for this exam

                stmt = select(SubjectRegistration).where(
                    SubjectRegistration.exam_registration_id == exam_reg.id,
                    SubjectRegistration.exam_subject_id == exam_subject.id,
                )
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                if not existing:
                    subject_reg = SubjectRegistration(
                        exam_registration_id=exam_reg.id, exam_subject_id=exam_subject.id, series=None
                    )
                    session.add(subject_reg)
                    subject_registrations.append(subject_reg)

    await session.flush()
    return subject_registrations


async def create_subject_scores(
    session, subject_registrations: list[SubjectRegistration]
) -> None:
    """Create subject scores for subject registrations."""
    # Get subject 701
    subject_701_stmt = select(Subject).where(Subject.code == "701")
    subject_701_result = await session.execute(subject_701_stmt)
    subject_701 = subject_701_result.scalar_one_or_none()

    # Document ID for school 817006, subject 701 (extracted_id as string)
    document_id_817006_701 = "8170067011101"

    for subject_reg in subject_registrations:
        stmt = select(SubjectScore).where(SubjectScore.subject_registration_id == subject_reg.id)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            # Check if this is subject 701 registration
            exam_subject_stmt = select(ExamSubject).where(ExamSubject.id == subject_reg.exam_subject_id)
            exam_subject_result = await session.execute(exam_subject_stmt)
            exam_subject = exam_subject_result.scalar_one_or_none()

            # Check if this is for subject 701
            is_subject_701 = (
                subject_701
                and exam_subject
                and exam_subject.subject_id == subject_701.id
            )

            if is_subject_701:
                # Create empty scores with document_id for subject 701
                # Assuming this is for essay test (test_type="2") based on context
                subject_score = SubjectScore(
                    subject_registration_id=subject_reg.id,
                    obj_raw_score=None,  # Not entered yet
                    essay_raw_score=None,  # Not entered yet (NULL means not entered)
                    pract_raw_score=None,  # Not entered yet
                    obj_normalized=None,
                    essay_normalized=None,
                    pract_normalized=None,
                    total_score=0.0,
                    essay_document_id=document_id_817006_701,
                )
            else:
                # Generate realistic scores for other subjects
                obj_score = 35.0 + (subject_reg.id % 15)  # 35-50
                essay_score = 40.0 + (subject_reg.id % 20)  # 40-60
                total_score = obj_score + essay_score

                subject_score = SubjectScore(
                    subject_registration_id=subject_reg.id,
                    obj_raw_score=str(obj_score),  # Store as string
                    essay_raw_score=str(essay_score),  # Store as string
                    pract_raw_score=None,  # Not entered yet
                    obj_normalized=None,
                    essay_normalized=None,
                    pract_normalized=None,
                    total_score=total_score,  # Keep as float for total_score
                    obj_document_id=None,
                    essay_document_id=None,
                    pract_document_id=None,
                )
            session.add(subject_score)

    await session.flush()




if __name__ == "__main__":
    asyncio.run(create_initial_data())
