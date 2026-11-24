# User manuals

## School Registration User Manual

- **Canonical content (for editing in docs):** [school-registration-manual.md](./school-registration-manual.md)
- **Screenshots:** [images/](./images/)
- **Runtime copy (API / PDF):** `backend/app/manuals/` (markdown + `images/`)

### Keeping copies in sync

Edit under `docs/manuals/`, then copy into the backend package:

```bash
cp docs/manuals/school-registration-manual.md backend/app/manuals/school-registration-manual.md
rm -rf backend/app/manuals/images
cp -R docs/manuals/images backend/app/manuals/images
```

Both trees must stay identical. The Help page and PDF download read the backend copy at runtime.

### In-app access

School coordinators and school staff:

1. Open **Help & Support** in the portal sidebar.
2. Read the manual on the page, or choose **Download PDF**.

### API

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/v1/school/manuals/school-registration.md` | SchoolAdmin / SchoolStaff with school |
| `GET` | `/api/v1/school/manuals/school-registration.pdf` | SchoolAdmin / SchoolStaff with school |
| `GET` | `/api/v1/school/manuals/assets/{asset_path}` | SchoolAdmin / SchoolStaff with school (e.g. `images/01-home-dashboard.png`) |

### Admin manual

Not published yet. Platform admin Help shows a short placeholder.
