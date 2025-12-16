"""Script to create a sample CSV/Excel file for bulk candidate upload."""

import csv

# Sample data rows
sample_data = [
    # Header row
    [
        "school_code",
        "programme_code",
        "name",
        "index_number",
        "subject_code_1",
        "subject_code_2",
        "subject_code_3",
        "subject_code_4",
        "subject_code_5",
    ],
    # Data rows
    ["817006", "C42", "John Mensah", "2024001", "701", "702", "703", "704", "705"],
    ["817105", "C60", "Ama Asante", "2024002", "701", "702", "703", "704", ""],
    ["817006", "C62", "Kwame Osei", "2024003", "701", "702", "703", "704", "705"],
    ["817105", "", "Efua Adjei", "2024004", "701", "702", "703", "704", ""],  # programme_code is optional
    ["817006", "C42", "Kofi Boateng", "2024005", "701", "702", "703", "704", "705"],
]

# Write CSV file
output_file = "sample_candidates_upload.csv"
with open(output_file, "w", newline="", encoding="utf-8") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerows(sample_data)

print(f"Sample CSV file created: {output_file}")
print("\nFile structure:")
print("Columns:", ", ".join(sample_data[0]))
print(f"\nTotal rows: {len(sample_data) - 1} sample candidates (plus header)")
print("\nNote: This file can be used as a template for bulk candidate uploads.")
print("You can open this CSV file in Excel, edit it, and save as .xlsx if needed.")
print("\nRequired columns: school_code, name, index_number")
print("Optional columns: programme_code (can be left empty)")
print("Subject columns: subject_code_1, subject_code_2, ... (can have multiple, empty cells are ignored)")
print("\nExample programme codes: C42, C60, C62")
print("Example school codes: 817006, 817105")
print("Example subject codes: 701, 702, 703, 704, 705")
print("\nThe file can be uploaded directly as CSV, or you can:")
print("1. Open in Excel")
print("2. Edit/add more rows")
print("3. Save as .xlsx format")
print("4. Upload the .xlsx file")
