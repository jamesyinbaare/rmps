"""Simple script to check examination schedules."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select, func, or_
from app.models import ExaminationSchedule, Subject
from app.dependencies.database import get_sessionmanager, initialize_db


async def check():
    try:
        sm = get_sessionmanager()
        async with initialize_db(sm):
            async with sm.session() as s:
                # Count schedules
                count_result = await s.execute(select(func.count(ExaminationSchedule.id)))
                total = count_result.scalar()
                print(f"Total schedules: {total}")

                if total == 0:
                    return

                # Get unique subject codes from schedules
                codes_result = await s.execute(select(ExaminationSchedule.subject_code).distinct().limit(50))
                schedule_codes = {row[0] for row in codes_result.all()}
                print(f"\nUnique schedule codes (sample of 50): {sorted(schedule_codes)}")

                # Check matches by original_code
                orig_result = await s.execute(
                    select(Subject.original_code).where(Subject.original_code.in_(schedule_codes), Subject.original_code.isnot(None))
                )
                matched_by_orig = {row[0] for row in orig_result.all()}
                print(f"\nMatched by original_code: {len(matched_by_orig)}")

                # Check matches by code
                code_result = await s.execute(
                    select(Subject.code).where(Subject.code.in_(schedule_codes))
                )
                matched_by_code = {row[0] for row in code_result.all()}
                print(f"Matched by code: {len(matched_by_code)}")

                # Unmatched
                all_matched = matched_by_orig | matched_by_code
                unmatched = schedule_codes - all_matched
                if unmatched:
                    print(f"\n⚠️  Unmatched codes: {unmatched}")

                # Sample schedules
                sample_result = await s.execute(select(ExaminationSchedule).limit(10))
                samples = sample_result.scalars().all()
                print(f"\nSample schedules:")
                for sched in samples:
                    print(f"  ID {sched.id}: subject_code='{sched.subject_code}', name='{sched.subject_name[:30]}'")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(check())
