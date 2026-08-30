from __future__ import annotations

import hashlib
import html
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt"
PDF = ROOT / "attached_assets/full_intergration_plan_-_taptpay_1787816180424.pdf"
PREVIEW = ROOT / ".agents/outputs/rxa-plan-preview"

TASK_RE = re.compile(
    r"^(?P<id>R[01]-[TH]\d+A?|[AX]-[TH]\d+)"
    r"(?P<owner>Agent|You)(?P<flag>.*)$"
)
SECTION_RE = re.compile(r"^(?:P\d+(?:\.\d+)?|R\d+(?:\.[A-Z0-9]+)?|[AX]\.\d+)$")
URL_RE = re.compile(r"https?://[^\s<]+")
CONTENTS_RE = re.compile(r"^(P\d+(?:\.\d+)?)(.+)$")

CSS = r"""
@page {
  size: A4;
  margin: 48pt 42pt;
}
* { box-sizing: border-box; }
body {
  color: #17203b;
  font-family: Helvetica, Arial, sans-serif;
  font-size: 8.7pt;
  line-height: 1.34;
  margin: 0;
  orphans: 2;
  widows: 2;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
p { margin: 0 0 6pt 0; }
a { color: #255fca; text-decoration: underline; }
.eyebrow {
  color: #3f6eab;
  font-family: Courier, monospace;
  font-size: 7.5pt;
  letter-spacing: 0.8pt;
  margin: 0 0 10pt 0;
  text-transform: uppercase;
}
h1.title {
  background: #071232;
  color: #ffffff;
  font-size: 23pt;
  line-height: 1.05;
  margin: 0 0 10pt 0;
  padding: 10pt 12pt;
}
.deck {
  color: #243250;
  font-size: 12.5pt;
  line-height: 1.3;
  margin: 0 0 10pt 0;
}
.artifact {
  background: #eef6ff;
  border-left: 4pt solid #5e9eff;
  color: #15325d;
  font-size: 8.6pt;
  margin: 0 0 9pt 0;
  padding: 8pt 10pt;
}
.snapshot {
  background: #0a173b;
  color: #b8cff6;
  font-family: Courier, monospace;
  font-size: 7.4pt;
  margin: 0 0 16pt 0;
  padding: 6pt 8pt;
}
.part {
  border-bottom: 2pt solid #5e9eff;
  break-before: page;
  color: #071232;
  font-size: 15pt;
  line-height: 1.15;
  margin: 0 0 12pt 0;
  padding: 0 0 6pt 0;
  page-break-before: always;
}
.section-code {
  color: #5e9eff;
  font-family: Courier, monospace;
  font-size: 7.6pt;
  letter-spacing: 0.5pt;
  margin: 12pt 0 2pt 0;
  text-transform: uppercase;
}
h2 {
  color: #071232;
  font-size: 14pt;
  line-height: 1.15;
  margin: 0 0 9pt 0;
}
h3 {
  color: #173c72;
  font-size: 10.5pt;
  line-height: 1.2;
  margin: 10pt 0 5pt 0;
}
h1, h2, h3, .section-code, .label, .check, .task-head, .task-title, .depends {
  break-after: avoid;
  page-break-after: avoid;
}
.label {
  border-bottom: 0.6pt solid #9cb9e3;
  color: #d47d12;
  font-family: Courier, monospace;
  font-size: 7.5pt;
  margin: 10pt 0 6pt 0;
  padding: 0 0 3pt 0;
  text-transform: uppercase;
}
.task-head {
  background: #071232;
  color: #ffffff;
  margin: 14pt 0 0 0;
  padding: 6pt 8pt;
  page-break-after: avoid;
}
.task-id {
  color: #8bc1ff;
  font-family: Courier, monospace;
  font-size: 8pt;
  font-weight: bold;
}
.owner-agent, .owner-you {
  border-left: 0.6pt solid #66799f;
  font-size: 7.5pt;
  margin-left: 7pt;
  padding-left: 7pt;
  text-transform: uppercase;
}
.owner-you { color: #ffbf69; }
.task-flag {
  color: #93e2c1;
  font-size: 7.3pt;
  margin-left: 7pt;
  text-transform: uppercase;
}
.task-title {
  background: #f2f6fc;
  border-left: 3pt solid #5e9eff;
  color: #0b2049;
  font-size: 12pt;
  margin: 0 0 5pt 0;
  padding: 7pt 8pt;
  page-break-after: avoid;
}
.depends {
  color: #5b6780;
  font-family: Courier, monospace;
  font-size: 7.6pt;
  margin: 0 0 7pt 0;
}
.check {
  color: #087b55;
  font-family: Courier, monospace;
  font-size: 7.7pt;
  font-weight: bold;
  margin: 9pt 0 4pt 0;
  page-break-after: avoid;
  text-transform: uppercase;
}
ul { margin: 3pt 0 7pt 15pt; padding: 0; }
li { margin: 0 0 3pt 0; padding-left: 2pt; }
.numbered {
  border-left: 2pt solid #dbe7f7;
  margin-left: 5pt;
  padding-left: 8pt;
}
.table-line {
  background: #f5f7fb;
  border-left: 2pt solid #b5c9e8;
  color: #263653;
  margin: 0 0 2pt 8pt;
  padding: 3pt 6pt;
}
.code-line {
  background: #101a3c;
  color: #e8efff;
  font-family: Courier, monospace;
  font-size: 7.2pt;
  line-height: 1.25;
  margin: 0 0 2pt 0;
  padding: 4pt 6pt;
}
code {
  background: #e9eef7;
  color: #0d2958;
  font-family: Courier, monospace;
  font-size: 7.6pt;
  padding: 0 2pt;
}
.mini-code {
  color: #5078ad;
  font-family: Courier, monospace;
  font-size: 7.4pt;
  margin-right: 5pt;
}
.spacer { height: 4pt; }
"""


def inline_markup(value: str) -> str:
    escaped = html.escape(value, quote=True)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)

    def link(match: re.Match[str]) -> str:
        raw = match.group(0)
        trailing = ""
        while raw and raw[-1] in ".,);":
            trailing = raw[-1] + trailing
            raw = raw[:-1]
        return f'<a href="{raw}">{raw}</a>{trailing}'

    return URL_RE.sub(link, escaped)


def is_code_line(value: str) -> bool:
    stripped = value.strip()
    prefixes = (
        "# ",
        "//",
        "git ",
        "npm ",
        "npx ",
        "node ",
        "const ",
        "return ",
        "getTransaction",
        "enc:v",
        "AES-",
        "AAD ",
        "explicit active key",
        "no key material",
        "unknown enc:",
        "no prefix",
        "null ",
        "/api/",
        "client/src/",
        "server/",
        "shared/",
        "migrations/",
    )
    if stripped.startswith(prefixes):
        return True
    if re.match(r"^[A-Z][A-Z0-9_]*(?:\s*=|\s{2,})", stripped):
        return True
    if re.match(r"^(?:test|development|staging|production)\s{2,}", stripped):
        return True
    return False


def source_to_html(text: str) -> tuple[str, int]:
    lines = text.splitlines()
    out = ['<!doctype html><html><head><meta charset="utf-8"></head><body>']
    open_list = False
    expect_section_title = False
    expect_task_title = False
    rendered_lines = 0

    def close_list() -> None:
        nonlocal open_list
        if open_list:
            out.append("</ul>")
            open_list = False

    for index, line in enumerate(lines):
        raw = line.rstrip()
        stripped = raw.strip()

        if not stripped:
            close_list()
            out.append('<div class="spacer"></div>')
            continue

        rendered_lines += 1

        if index == 0:
            out.append(f'<div class="eyebrow">{inline_markup(stripped)}</div>')
            continue
        if index == 1:
            out.append(f'<h1 class="title">{inline_markup(stripped)}</h1>')
            continue
        if index == 2:
            out.append(f'<div class="deck">{inline_markup(stripped)}</div>')
            continue
        if index == 3:
            out.append(f'<div class="artifact">{inline_markup(stripped)}</div>')
            continue
        if index == 4:
            out.append(f'<div class="snapshot">{inline_markup(stripped)}</div>')
            continue

        bullet = re.match(r"^\s*\*\s+(.+)$", raw)
        if bullet:
            if not open_list:
                out.append("<ul>")
                open_list = True
            content = bullet.group(1)
            contents_match = CONTENTS_RE.match(content)
            if contents_match:
                content_html = (
                    f'<span class="mini-code">{inline_markup(contents_match.group(1))}</span>'
                    f'{inline_markup(contents_match.group(2))}'
                )
            else:
                content_html = inline_markup(content)
            out.append(f"<li>{content_html}</li>")
            continue

        close_list()

        if raw.startswith("Part "):
            out.append(f'<h1 class="part">{inline_markup(stripped)}</h1>')
            expect_section_title = False
            expect_task_title = False
            continue

        task = TASK_RE.match(stripped)
        if task:
            owner = task.group("owner")
            flag = task.group("flag").strip()
            flag_html = (
                f'<span class="task-flag">{inline_markup(flag)}</span>' if flag else ""
            )
            out.append(
                '<div class="task-head">'
                f'<span class="task-id">{task.group("id")}</span>'
                f'<span class="owner-{owner.lower()}">{owner}</span>'
                f"{flag_html}</div>"
            )
            expect_task_title = True
            expect_section_title = False
            continue

        if SECTION_RE.match(stripped):
            out.append(f'<div class="section-code">{inline_markup(stripped)}</div>')
            expect_section_title = True
            expect_task_title = False
            continue

        if expect_task_title:
            out.append(f'<h3 class="task-title">{inline_markup(stripped)}</h3>')
            expect_task_title = False
            continue

        if expect_section_title:
            out.append(f"<h2>{inline_markup(stripped)}</h2>")
            expect_section_title = False
            continue

        if stripped == "Check":
            out.append('<div class="check">Acceptance check</div>')
            continue

        if stripped.startswith("Depends on:"):
            out.append(f'<div class="depends">{inline_markup(stripped)}</div>')
            continue

        if stripped in {
            "Contents",
            "Executable now",
            "Scoped, decomposed later",
            "Reference",
            "Required core variables",
            "Payment mode",
            "Capability flags — all default false",
            "Stable response semantics",
            "Protected middleware order — memorise this",
        }:
            out.append(f'<div class="label">{inline_markup(stripped)}</div>')
            continue

        if (
            stripped.endswith("exit gate")
            or stripped
            in {
                "Rollback constraint",
                "Rollback rule",
                "The non-negotiable rule",
                "Current commercial and capacity baseline — verify again before purchase or launch",
                "Decision",
                "Integration barriers",
                "Required approvers",
                "What this supersedes",
                "Sources — Xero",
                "Sources — Apple",
                "Sources — New Zealand tax/records",
            }
        ):
            out.append(f"<h3>{inline_markup(stripped)}</h3>")
            continue

        if re.match(r"^\d+\.\s", stripped):
            out.append(f'<p class="numbered">{inline_markup(stripped)}</p>')
            continue

        if raw.startswith("\t"):
            out.append(f'<div class="table-line">{inline_markup(stripped)}</div>')
            continue

        if is_code_line(raw):
            out.append(f'<div class="code-line">{inline_markup(stripped)}</div>')
            continue

        out.append(f"<p>{inline_markup(stripped)}</p>")

    close_list()
    out.append("</body></html>")
    return "\n".join(out), rendered_lines


def add_toc(document: pymupdf.Document) -> None:
    headings = [
        (1, "TaptPay implementation plan", "TaptPay implementation plan"),
        (1, "P0 · How to use this document", "How to use this document"),
        (1, "P1 · The map and sequence", "The map and sequence"),
        (2, "P1.2 · Verified current state", "Verified current state"),
        (1, "P2 · Ground rules", "Ground rules"),
        (2, "P2.2 · Configuration and response contracts", "Configuration and response contracts"),
        (1, "R0 · Emergency containment", "Emergency containment"),
        (1, "R1 · Harness, route policy, auth and UI", "Harness, route policy, auth and UI"),
        (1, "R2 · Provider boundary and exact verification", "Provider boundary and exact verification"),
        (1, "R3 · Durable notifications and payment convergence", "Durable notifications and payment convergence"),
        (1, "R4 · Durable refunds", "Durable refunds"),
        (1, "R5 · Encryption", "Encryption"),
        (1, "R6 · Entitlement, scheduler, health, observability", "Entitlement, scheduler, health, observability"),
        (1, "R7 · Native truthfulness and full regression", "Native truthfulness and full regression"),
        (1, "R8 · CI, dependency hygiene, truthfulness, rehearsal", "CI, dependency hygiene, truthfulness, rehearsal"),
        (1, "Apple · App Store readiness", "Apple — App Store readiness"),
        (1, "Xero · Accounting integration", "Xero — accounting integration"),
        (1, "P8.1 · Evidence matrix and command gate", "Evidence matrix and command gate"),
        (1, "P8.2 · Commit and integration sequence", "Commit and integration sequence"),
        (1, "P8.3 · Stop conditions", "Stop conditions"),
        (1, "P8.4 · Explicitly deferred", "Explicitly deferred"),
        (2, "P8.4a · Preserved remediation controls", "Preserved remediation controls"),
        (1, "P8.5 · Review and handoff templates", "Review and handoff templates"),
        (1, "P8.6 · Final go-live gate", "Final go-live gate"),
        (1, "P9 · Decisions register", "Decisions register"),
        (1, "P10 · Verification record", "Verification record"),
    ]
    page_text = [page.get_text("text") for page in document]
    toc: list[list[object]] = []
    start_at = 0
    for level, title, needle in headings:
        found = None
        for page_index in range(start_at, len(page_text)):
            if needle in page_text[page_index]:
                found = page_index + 1
                start_at = page_index
                break
        if found is not None:
            toc.append([level, title, found])
    if toc:
        document.set_toc(toc, collapse=2)


def add_page_chrome(document: pymupdf.Document) -> None:
    total = document.page_count
    navy = (0.027, 0.071, 0.196)
    muted = (0.35, 0.42, 0.55)
    line = (0.70, 0.79, 0.91)
    header = "TAPTPAY  /  FULL IMPLEMENTATION PLAN  /  CORRECTED 2026-08-29"
    source = "Authoritative source: full_intergration_plan_-_taptpay_1787816180424.txt"
    for index, page in enumerate(document):
        width = page.rect.width
        height = page.rect.height
        page.draw_line((42, 36), (width - 42, 36), color=line, width=0.55)
        page.insert_text((42, 27), header, fontsize=6.8, fontname="cour", color=navy)
        page.draw_line((42, height - 36), (width - 42, height - 36), color=line, width=0.55)
        page.insert_text((42, height - 22), source, fontsize=6.2, fontname="helv", color=muted)
        page_label = f"{index + 1} / {total}"
        label_width = pymupdf.get_text_length(page_label, fontname="helv", fontsize=6.2)
        page.insert_text(
            (width - 42 - label_width, height - 22),
            page_label,
            fontsize=6.2,
            fontname="helv",
            color=muted,
        )


def chromium_executable() -> str:
    configured = os.environ.get("RXA_CHROMIUM_PATH")
    candidates = [configured] if configured else []
    candidates.extend(("chromium", "chromium-browser", "google-chrome"))
    for candidate in candidates:
        if not candidate:
            continue
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise RuntimeError(
        "Chromium is required to render the RXA plan; set RXA_CHROMIUM_PATH"
    )


def unused_temp_path(*, prefix: str, suffix: str) -> Path:
    handle, name = tempfile.mkstemp(prefix=prefix, suffix=suffix, dir=PDF.parent)
    os.close(handle)
    path = Path(name)
    path.unlink()
    return path


def build_pdf(source_text: str) -> tuple[int, int]:
    body_html, rendered_lines = source_to_html(source_text)
    PDF.parent.mkdir(parents=True, exist_ok=True)
    html_path = unused_temp_path(prefix=".rxa-plan-", suffix=".tmp.html")
    browser_pdf = unused_temp_path(prefix=".rxa-plan-browser-", suffix=".tmp.pdf")
    final_pdf = unused_temp_path(prefix=".rxa-plan-final-", suffix=".tmp.pdf")
    document: pymupdf.Document | None = None
    try:
        html_path.write_text(
            f"<style>{CSS}</style>{body_html}", encoding="utf-8", newline="\n"
        )
        with tempfile.TemporaryDirectory(prefix="rxa-plan-chromium-") as profile:
            command = [
                chromium_executable(),
                "--headless=new",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-extensions",
                "--disable-crash-reporter",
                f"--user-data-dir={profile}",
                "--no-pdf-header-footer",
                f"--print-to-pdf={browser_pdf}",
                html_path.resolve().as_uri(),
            ]
            completed = subprocess.run(
                command,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=120,
            )
        if completed.returncode != 0 or not browser_pdf.exists():
            output = completed.stdout.strip()[-4000:]
            raise RuntimeError(
                f"Chromium PDF render failed ({completed.returncode}): {output}"
            )

        document = pymupdf.open(browser_pdf)
        if document.page_count < 2:
            raise RuntimeError("RXA plan unexpectedly rendered to fewer than two pages")

        add_toc(document)
        add_page_chrome(document)
        document.set_metadata(
            {
                "title": "TaptPay implementation plan — corrected senior review revision",
                "author": "TaptPay",
                "subject": "Security remediation, App Store submission and Xero integration",
                "keywords": "TaptPay, remediation, App Store, Xero, implementation plan",
                "creator": "Chromium and PyMuPDF via .agents/scripts/render_rxa_plan.py",
                "producer": "PyMuPDF",
                "creationDate": "D:20260829000000Z",
                "modDate": "D:20260829000000Z",
            }
        )
        document.embfile_add(
            SOURCE.name,
            SOURCE.read_bytes(),
            filename=SOURCE.name,
            ufilename=SOURCE.name,
            desc="Authoritative corrected RXA plan source",
        )

        blank_pages = [
            index + 1
            for index, page in enumerate(document)
            if len(page.get_text("text").strip()) < 100
        ]
        if blank_pages:
            raise RuntimeError(f"blank or near-blank PDF pages: {blank_pages}")

        page_count = document.page_count
        document.save(
            final_pdf,
            garbage=4,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            use_objstms=1,
            reproducible=True,
        )
        document.close()
        document = None
        final_pdf.replace(PDF)
    finally:
        if document is not None:
            document.close()
        for temp_path in (html_path, browser_pdf, final_pdf):
            if temp_path.exists():
                temp_path.unlink()

    return rendered_lines, page_count


def render_previews() -> int:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    document = pymupdf.open(PDF)
    staged: list[tuple[Path, Path]] = []
    try:
        for index, page in enumerate(document):
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.2, 1.2), alpha=False)
            final = PREVIEW / f"page-{index + 1:03d}.png"
            temp = PREVIEW / f".{final.name}.tmp.png"
            pixmap.save(temp)
            staged.append((temp, final))

        for old in PREVIEW.glob("page-*.png"):
            old.unlink()
        for temp, final in staged:
            temp.replace(final)
        return document.page_count
    finally:
        document.close()
        for temp, _ in staged:
            if temp.exists():
                temp.unlink()


def verify_artifacts(source_text: str, expected_pages: int) -> None:
    document = pymupdf.open(PDF)
    try:
        if document.page_count != expected_pages:
            raise RuntimeError("PDF and preview page counts disagree")
        previews = sorted(PREVIEW.glob("page-*.png"))
        if len(previews) != expected_pages:
            raise RuntimeError(
                f"expected {expected_pages} preview pages, found {len(previews)}"
            )
        embedded = document.embfile_names()
        if SOURCE.name not in embedded:
            raise RuntimeError("authoritative source is not embedded in the PDF")
        embedded_source = document.embfile_get(SOURCE.name)
        if bytes(embedded_source) != SOURCE.read_bytes():
            raise RuntimeError("embedded authoritative source does not match the text file")
        all_text = "\n".join(page.get_text("text") for page in document)
        required = (
            "corrected senior review revision",
            "R0 — Emergency containment",
            "Apple — App Store readiness",
            "Xero — accounting integration",
            "Final go-live gate",
            "https://www.ird.govt.nz/managing-my-tax/record-keeping",
        )
        missing = [needle for needle in required if needle not in all_text]
        if missing:
            raise RuntimeError(f"required rendered text missing: {missing}")
        linked_pages = [
            index + 1 for index, page in enumerate(document) if page.get_links()
        ]
        if len(linked_pages) < 2:
            raise RuntimeError(
                f"hyperlinks unexpectedly confined to pages: {linked_pages}"
            )
        chrome_text = {
            "TAPTPAY  /  FULL IMPLEMENTATION PLAN  /  CORRECTED 2026-08-29",
            "Authoritative source: full_intergration_plan_-_taptpay_1787816180424.txt",
        }
        out_of_bounds: list[str] = []
        for page_index, page in enumerate(document):
            page_text = page.get_text("text")
            expected_chrome = chrome_text | {
                f"{page_index + 1} / {expected_pages}"
            }
            missing_chrome = [
                value for value in expected_chrome if value not in page_text
            ]
            if missing_chrome:
                raise RuntimeError(
                    f"page {page_index + 1} is missing page chrome: {missing_chrome}"
                )
            for block in page.get_text("dict")["blocks"]:
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        value = span["text"].strip()
                        if not value or value in chrome_text or re.fullmatch(
                            rf"{page_index + 1} / {expected_pages}", value
                        ):
                            continue
                        y0, y1 = span["bbox"][1], span["bbox"][3]
                        if y0 < 42 or y1 > page.rect.height - 42:
                            out_of_bounds.append(
                                f"page {page_index + 1}: {value[:60]!r} at {y0:.1f}..{y1:.1f}"
                            )
        if out_of_bounds:
            raise RuntimeError(
                "rendered body text crossed the page chrome: "
                + "; ".join(out_of_bounds[:8])
            )
        if source_text.count("\ufffd"):
            raise RuntimeError("source contains replacement characters")
    finally:
        document.close()


def main() -> None:
    source_bytes = SOURCE.read_bytes()
    source_text = source_bytes.decode("utf-8-sig")
    nonempty_lines = sum(bool(line.strip()) for line in source_text.splitlines())
    rendered_lines, pdf_pages = build_pdf(source_text)
    if rendered_lines != nonempty_lines:
        raise RuntimeError(
            f"rendered {rendered_lines} nonempty lines, expected {nonempty_lines}"
        )
    preview_pages = render_previews()
    verify_artifacts(source_text, pdf_pages)
    digest = hashlib.sha256(source_bytes).hexdigest()
    print(f"source={SOURCE.relative_to(ROOT)}")
    print(f"sha256={digest}")
    print(f"nonempty_lines={nonempty_lines}")
    print(f"pdf={PDF.relative_to(ROOT)} pages={pdf_pages}")
    print(f"previews={PREVIEW.relative_to(ROOT)} pages={preview_pages}")


if __name__ == "__main__":
    main()
