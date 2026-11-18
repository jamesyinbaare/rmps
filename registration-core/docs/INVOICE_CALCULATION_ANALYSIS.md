# Invoice Calculation Analysis: Auto Pricing Model Issues

## Executive Summary

The invoice calculation logic uses an "auto" pricing model that can cause inconsistent calculations across candidates in the same invoice. Different candidates may be priced using different methods (tiered vs per-subject), making invoice totals unpredictable and causing discrepancies where "numbers don't add up."

**Root Cause:** The "auto" pricing model tries tiered pricing first, then falls back to per-subject pricing. This means candidates with different subject counts may use different pricing methods, causing inconsistent totals.

**Requirement:** No auto pricing model. Everything must be explicit.

---

## Investigation Findings

### 1. All Uses of "Auto" Pricing Model

#### A. Default Return Values

**File:** `backend/app/services/registration_pricing_service.py`

- **Line 418-419:** `get_pricing_model_preference()` defaults to `"auto"` if no explicit pricing model is configured:
  ```python
  # Default to "auto"
  return "auto"
  ```

#### B. Database Model Defaults

**File:** `backend/app/models.py`

- **Line 340:** `RegistrationExam.pricing_model_preference` has `default="auto"`
  ```python
  pricing_model_preference = Column(String(20), nullable=True, default="auto")
  ```

- **Line 711:** `ExamPricingModel.pricing_model_preference` has `default="auto"`
  ```python
  pricing_model_preference = Column(String(20), nullable=False, default="auto")
  ```

#### C. Code Logic Using "Auto"

**File:** `backend/app/services/registration_pricing_service.py`

1. **Lines 521-533:** When `pricing_model = "auto"`:
   - First tries tiered pricing
   - If tiered pricing is not found, falls back to per-subject pricing
   - This causes **inconsistent calculations** across candidates

2. **Line 502:** Fallback from `per_programme` to `"auto"`:
   ```python
   # Fallback to subject/tiered pricing if no programme pricing found
   pricing_model = "auto"
   ```

#### D. Admin Router Defaults

**File:** `backend/app/routers/admin.py`

- **Line 1467:** Creates new exams with `pricing_model_preference or "auto"`
  ```python
  pricing_model_preference=exam_data.pricing_model_preference or "auto",
  ```

#### E. Database Migration Defaults

**File:** `backend/alembic/versions/add_pricing_model_preference_to_exam.py`

- **Line 23:** Migration sets `server_default='auto'`

#### F. Frontend UI

**File:** `frontend/components/admin/PricingModelSelector.tsx`

- **Lines 98-100:** Frontend allows selecting "auto" as an option
- **Line 107:** Displays description for "auto" mode

---

### 2. Fallback Logic Issues

#### A. "Auto" Mode Fallback Chain

When `pricing_model = "auto"` (lines 521-533):
1. Try tiered pricing first
2. If tiered pricing not found, fall back to per-subject pricing
3. **Problem:** Different candidates may match different pricing methods

#### B. "Tiered" Mode Fallback

When `pricing_model = "tiered"` (lines 511-520):
- If no tier found, falls back to per-subject pricing
- **Problem:** Even explicit "tiered" mode has fallback logic

#### C. "Per Programme" Mode Fallback

When `pricing_model = "per_programme"` for FREE TVET candidates (lines 495-502):
- If programme pricing not found, falls back to `"auto"`
- **Problem:** Explicit "per_programme" mode can become "auto" mode

---

### 3. How Explicit Pricing Models Work

#### A. Per-Subject Pricing (`pricing_model = "per_subject"`)

**Location:** Lines 506-510

```python
if pricing_model == "per_subject":
    prices = await get_subject_prices(session, subject_ids, exam_id, registration_type_str)
    has_pricing = len(prices) > 0
    if has_pricing:
        subject_price = sum(prices.values())
```

**Behavior:**
- Gets price for each subject individually
- Sums all subject prices
- **Consistent:** All candidates using per-subject pricing will have predictable totals

#### B. Tiered Pricing (`pricing_model = "tiered"`)

**Location:** Lines 511-520

```python
elif pricing_model == "tiered":
    tiered_price = await get_tiered_pricing(session, subject_count, exam_id, registration_type_str)
    has_pricing = tiered_price is not None
    if not has_pricing:
        # Fallback to per-subject if no tier found
        prices = await get_subject_prices(session, subject_ids, exam_id, registration_type_str)
        ...
```

**Behavior:**
- Gets price based on total number of subjects (tiered)
- **Issue:** Falls back to per-subject if no tier found (inconsistent with requirement)
- **Consistent:** If tiers are properly configured, all candidates using tiered pricing will have predictable totals

#### C. Per-Programme Pricing (`pricing_model = "per_programme"`)

**Location:** Lines 495-499

```python
if is_free_tvet and pricing_model == "per_programme":
    programme_price = await get_programme_price(session, programme_id, exam_id, registration_type_str)
    has_pricing = programme_price is not None
    if has_pricing:
        use_programme_pricing = True
```

**Behavior:**
- Gets flat price for the programme
- Only applies to FREE TVET candidates
- **Issue:** Falls back to "auto" if programme pricing not found
- **Consistent:** If programme pricing is properly configured, all candidates in the same programme will have the same price

---

### 4. Invoice Aggregation Logic

#### A. Aggregate Candidates by Examination

**File:** `backend/app/services/school_invoice_service.py`

**Function:** `aggregate_candidates_by_examination()` (lines 41-98)

**Logic:**
1. Filters candidates by: school_id, exam_id, registration_type
2. Iterates through each candidate
3. Calls `calculate_candidate_amount()` for each candidate
4. Sums all individual amounts to get `total_amount`

**Issue:** If candidates use different pricing methods (due to "auto" mode), the total will be the sum of inconsistent calculations.

#### B. Aggregate Candidates by Examination and Programme

**Function:** `aggregate_candidates_by_examination_and_programme()` (lines 101-203)

**Logic:**
1. Filters candidates by: school_id, exam_id, registration_type
2. Groups candidates by programme_id
3. For each programme:
   - Iterates through candidates in that programme
   - Calls `calculate_candidate_amount()` for each candidate
   - Sums to get `programme_amount`
   - Adds `programme_amount` to `grand_total`
4. Returns: `{candidate_count, total_amount: grand_total, programmes: [...]}`

**Issues:**
1. If candidates in the same programme use different pricing methods (due to "auto" mode), programme totals will be inconsistent
2. Grand total is the sum of programme totals, so if programme totals are inconsistent, grand total will also be inconsistent
3. No validation that programme totals sum to grand total (though they should mathematically)

---

## Root Cause Analysis

### Primary Issue: Auto Pricing Model Causes Inconsistency

The "auto" pricing model causes different candidates to be priced differently:

**Example Scenario:**
- Exam has tiered pricing configured for 5+ subjects
- Exam has per-subject pricing configured
- Candidate A selects 6 subjects → matches tiered pricing tier → uses tiered pricing
- Candidate B selects 3 subjects → doesn't match any tier → falls back to per-subject pricing
- **Result:** Different candidates in the same invoice use different pricing methods

**Impact on Invoice Totals:**
- Programme totals may include candidates using different pricing methods
- Grand totals sum inconsistent programme totals
- Invoice numbers "don't add up" because pricing logic is inconsistent

### Secondary Issues

1. **No validation that pricing model is explicit** - The system defaults to "auto" if not specified
2. **Multiple fallback paths** - Even explicit pricing models have fallback logic
3. **Programme totals use mixed pricing** - Candidates in the same programme can use different pricing methods

---

## Requirements

**No auto pricing model. Everything must be explicit.**

This means:

1. Pricing model must be explicitly configured for each exam/registration_type combination
2. No default fallback to "auto"
3. No automatic switching between tiered and per-subject pricing
4. All candidates in the same invoice must use the same pricing method (or explicitly different if intended)
5. Explicit pricing models should not have fallback logic (or fallback should be configurable/removable)

---

## Recommendations

### Immediate Actions

1. **Remove "auto" as default** - Change all defaults from "auto" to require explicit configuration
2. **Remove fallback logic** - Make explicit pricing models fail if pricing is not configured
3. **Add validation** - Ensure pricing model is explicitly configured before calculating amounts
4. **Update database** - Migrate existing "auto" values to explicit values (with admin review)

### Long-term Improvements

1. **Add pricing validation** - Validate that pricing is configured for the selected pricing model
2. **Improve error messages** - If pricing is missing, provide clear error messages
3. **Update frontend** - Remove "auto" option from UI
4. **Add audit logging** - Log which pricing method was used for each candidate

---

## Verification Checklist

When using explicit pricing models:

- [ ] All candidates in the same invoice use the same pricing method
- [ ] Programme totals sum to grand total (mathematically verified)
- [ ] No fallback logic causes unexpected pricing method changes
- [ ] Pricing model is explicitly configured (not "auto")
- [ ] Invoice totals are predictable and consistent

---

## Files Requiring Changes

### Backend

1. `backend/app/services/registration_pricing_service.py`
   - Remove "auto" default in `get_pricing_model_preference()`
   - Remove "auto" logic in `calculate_registration_amount()`
   - Remove fallback logic from explicit pricing models
   - Add validation for explicit pricing configuration

2. `backend/app/models.py`
   - Remove `default="auto"` from model columns
   - Make pricing_model_preference required where appropriate

3. `backend/app/routers/admin.py`
   - Remove `or "auto"` default when creating exams
   - Add validation that pricing model is explicitly set

4. `backend/app/schemas/pricing.py`
   - Update schema descriptions to remove "auto" option

5. `backend/alembic/versions/` (new migration)
   - Migrate existing "auto" values to explicit values (or NULL)

### Frontend

1. `frontend/components/admin/PricingModelSelector.tsx`
   - Remove "auto" option from dropdown
   - Update descriptions

---

## Conclusion

The "auto" pricing model is the root cause of invoice calculation inconsistencies. Removing "auto" mode and enforcing explicit pricing models will ensure that all candidates in the same invoice use consistent pricing logic, making invoice totals predictable and accurate.
