"""Generate PDF user manuals from shipped Markdown files."""

from __future__ import annotations

from pathlib import Path

import markdown
from fastapi import HTTPException, status
from weasyprint import HTML

from app.services.pdf_generator import render_html

APP_DIR = Path(__file__).resolve().parent.parent
MANUALS_DIR = APP_DIR / "manuals"
SCHOOL_REGISTRATION_MANUAL = "school-registration-manual.md"


def manuals_dir() -> Path:
    return MANUALS_DIR


def school_registration_manual_path() -> Path:
    return MANUALS_DIR / SCHOOL_REGISTRATION_MANUAL


def load_manual_markdown(filename: str = SCHOOL_REGISTRATION_MANUAL) -> str:
    path = MANUALS_DIR / filename
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Manual not found: {filename}",
        )
    return path.read_text(encoding="utf-8")


def resolve_manual_asset_path(asset_path: str) -> Path:
    """Resolve a manuals asset path, allowing only files under manuals/images/."""
    raw = (asset_path or "").strip().lstrip("/")
    if not raw or ".." in raw.split("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid manual asset path",
        )
    # Accept either images/... or bare filename under images/
    relative = raw if raw.startswith("images/") else f"images/{raw}"
    candidate = (MANUALS_DIR / relative).resolve()
    images_root = (MANUALS_DIR / "images").resolve()
    if not str(candidate).startswith(str(images_root) + "/") and candidate != images_root:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Manual asset path escapes images directory",
        )
    if not candidate.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Manual asset not found",
        )
    return candidate


def markdown_to_body_html(md_text: str) -> str:
    return markdown.markdown(
        md_text,
        extensions=[
            "markdown.extensions.tables",
            "markdown.extensions.fenced_code",
            "markdown.extensions.sane_lists",
            "markdown.extensions.toc",
        ],
        output_format="html5",
    )


def rewrite_manual_image_srcs(body_html: str) -> str:
    """Point relative markdown images at manuals/ when base_url is the app dir."""
    return (
        body_html.replace('src="images/', 'src="manuals/images/')
        .replace("src='images/", "src='manuals/images/")
    )


def generate_school_registration_manual_pdf() -> bytes:
    """Render the school registration user manual to PDF via WeasyPrint."""
    md_text = load_manual_markdown(SCHOOL_REGISTRATION_MANUAL)
    body_html = rewrite_manual_image_srcs(markdown_to_body_html(md_text))

    templates_dir = APP_DIR / "templates"
    # base_url is app/ so both img/ logos and manuals/images/ screenshots resolve
    main_html = render_html(
        {
            "body_html": body_html,
            "title": "School Registration User Manual",
            "subtitle": "For School Administrators and Support Staff",
            "org_name": "CTVET Registration Portal",
            "logo_src": "img/logo-crest-only.png",
            "purpose": (
                "Register candidates, upload passport photos, settle fees, "
                "and download slips and reports for open examinations."
            ),
        },
        "manuals/manual.html",
        templates_dir,
    )

    # Render directly so template @page margins/footers are not overridden by PdfGenerator.
    return HTML(string=main_html, base_url=str(APP_DIR)).write_pdf()
