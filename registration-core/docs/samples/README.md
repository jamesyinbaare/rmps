# Bulk upload samples

## `bulk_upload_error_demo.xlsx`

School-portal sample for testing bulk registration (`free_tvet` / `regular`). **100 rows** total: **80 valid** and **20 intentional errors**.

### How to use

1. Open a school exam where bulk registration is allowed.
2. On **Bulk upload**, set the default registration type to `regular` or `free_tvet`.
3. Upload this file.
4. Expect ~80 successful rows if your school has programmes `C301`, `C421`, and `C601`, plus ~20 failed rows with humanized errors.
5. Use **Download results (Excel)** on the results card to get every submitted row with `error_field` / `error_message` filled for failures.

### Valid rows

Rotate across programmes and options:

| Programme | Options used |
|-----------|----------------|
| C301 Building Construction | SOC / C702 / case variants |
| C421 Electrical Engineering Technology | ENT / C705 / case variants |
| C601 Catering and Hospitality Management | SOC / ENT / aliases |

If those programmes are not linked to your school, “valid” rows will fail on `programme_code` instead.

### Intentional errors (20 rows, every 5th row)

| Issue | Expected field |
|-------|----------------|
| Missing firstname | `firstname` |
| Missing lastname | `lastname` |
| Date as `YYYY-MM-DD` | `date_of_birth` |
| Missing gender | `gender` |
| Missing programme | `programme_code` |
| Unknown programme `NOPE99` | `programme_code` |
| Phone with `+233…` or too short | `contact_phone` |
| Short guardian phone | `guardian_phone` |

Phone and ID columns in the template/demo are stored as **Excel text** so leading zeros are kept. If Excel still converts a phone to a number, validation restores a missing leading `0` for 9-digit local numbers.
| Missing option | `option` |
| Invalid option `FOO` | `option` |

The last column `_test_note` is for humans only; the uploader ignores unknown columns. You may delete it before upload if you prefer.
