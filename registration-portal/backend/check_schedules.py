"""Script to check examination schedules in the database."""
import asyncio
import sys
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import ExaminationSchedule, Subject, RegistrationExam
from app.dependencies.database import get_sessionmanager, initialize_db


async def check_schedules():
    """Check examination schedules and their relationship with subjects."""
    try:
        sessionmanager = get_sessionmanager()
        if sessionmanager is None:
            print("ERROR: Database is not configured")
            return

        async with initialize_db(sessionmanager):
            async with sessionmanager.session() as session:
                # Get total count of schedules
                count_stmt = select(func.count(ExaminationSchedule.id))
                count_result = await session.execute(count_stmt)
                total_schedules = count_result.scalar()

                print(f"\n=== Examination Schedules Summary ===")
                print(f"Total schedules in database: {total_schedules}")

                if total_schedules == 0:
                    print("\nNo examination schedules found in the database.")
                    return

                # Get all schedules with their exam info
                schedules_stmt = select(ExaminationSchedule, RegistrationExam).join(
                    RegistrationExam, ExaminationSchedule.registration_exam_id == RegistrationExam.id
                ).limit(20)
                schedules_result = await session.execute(schedules_stmt)
                schedules_data = schedules_result.all()

                print(f"\n=== Sample Schedules (showing first 20) ===")
                for schedule, exam in schedules_data:
                    print(f"\nSchedule ID: {schedule.id}")
                    print(f"  Exam ID: {schedule.registration_exam_id} (Year: {exam.year})")
                    print(f"  Subject Code (in schedule): '{schedule.subject_code}'")
                    print(f"  Subject Name: {schedule.subject_name}")
                    print(f"  Papers: {schedule.papers}")

                # Get unique subject codes from schedules
                unique_codes_stmt = select(ExaminationSchedule.subject_code).distinct()
                unique_codes_result = await session.execute(unique_codes_stmt)
                schedule_codes = {row[0] for row in unique_codes_result.all()}

                print(f"\n=== Subject Code Analysis ===")
                print(f"Unique subject codes in schedules: {len(schedule_codes)}")
                print(f"Codes: {sorted(schedule_codes)}")

                # Check which of these codes match subjects by original_code
                subjects_by_original_stmt = select(Subject.code, Subject.original_code, Subject.name).where(
                    Subject.original_code.in_(schedule_codes)
                )
                subjects_by_original_result = await session.execute(subjects_by_original_stmt)
                subjects_by_original = list(subjects_by_original_result.all())

                print(f"\nSubjects matching by original_code: {len(subjects_by_original)}")
                for code, original_code, name in subjects_by_original:
                    print(f"  Subject code: '{code}', original_code: '{original_code}', name: {name}")

                # Check which of these codes match subjects by code (internal code)
                subjects_by_code_stmt = select(Subject.code, Subject.original_code, Subject.name).where(
                    Subject.code.in_(schedule_codes)
                )
                subjects_by_code_result = await session.execute(subjects_by_code_stmt)
                subjects_by_code = list(subjects_by_code_result.all())

                print(f"\nSubjects matching by code (internal): {len(subjects_by_code)}")
                for code, original_code, name in subjects_by_code:
                    print(f"  Subject code: '{code}', original_code: '{original_code}', name: {name}")

                # Find schedules that don't match any subject
                all_matched_codes = set()
                for code, original_code, _ in subjects_by_original:
                    if original_code:
                        all_matched_codes.add(original_code)
                for code, original_code, _ in subjects_by_code:
                    all_matched_codes.add(code)

                unmatched_codes = schedule_codes - all_matched_codes
                if unmatched_codes:
                    print(f"\n⚠️  WARNING: {len(unmatched_codes)} schedule codes don't match any subject:")
                    for code in unmatched_codes:
                        print(f"  '{code}'")

                # Check a specific exam's schedules
                exam_stmt = select(RegistrationExam).limit(1)
                exam_result = await session.execute(exam_stmt)
                exam = exam_result.scalar_one_or_none()

                if exam:
                    print(f"\n=== Checking schedules for exam ID {exam.id} ===")
                    exam_schedules_stmt = select(ExaminationSchedule).where(
                        ExaminationSchedule.registration_exam_id == exam.id
                    )
                    exam_schedules_result = await session.execute(exam_schedules_stmt)
                    exam_schedules = exam_schedules_result.scalars().all()

                    print(f"Number of schedules for this exam: {len(exam_schedules)}")
                    for schedule in exam_schedules[:5]:  # Show first 5
                        print(f"  Schedule: subject_code='{schedule.subject_code}', name={schedule.subject_name}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(check_schedules())
