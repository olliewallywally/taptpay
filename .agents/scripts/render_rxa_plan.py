from pathlib import Path
import fitz

source = Path("attached_assets/full_intergration_plan_-_taptpay_1787816108070.pdf")
output = Path(".agents/outputs/rxa-plan-preview")
output.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"pages={document.page_count}")
for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2), alpha=False)
    destination = output / f"page-{index + 1:02d}.png"
    pixmap.save(destination)
    print(f"{destination} {page.rect.width:.0f}x{page.rect.height:.0f}")