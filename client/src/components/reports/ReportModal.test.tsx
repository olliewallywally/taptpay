import { render, screen } from "@testing-library/react";

import { ReportModal } from "./ReportModal";

const options = [
  {
    id: "summary",
    title: "Summary",
    description: "Current summary",
    formats: ["pdf" as const],
    periodFiltered: true,
  },
];

function modal() {
  return (
    <ReportModal
      onClose={jest.fn()}
      options={options}
      onGenerate={jest.fn(async () => undefined)}
    />
  );
}

describe("ReportModal portal target", () => {
  test("is fixed to the viewport for the mobile app", () => {
    render(modal());

    const layer = screen.getByTestId("report-modal-layer");
    expect(layer.parentElement).toBe(document.body);
    expect(layer).toHaveStyle({ position: "fixed" });
  });

  test("is contained by the tablet/desktop frame without inheriting canvas scale", () => {
    const frame = document.createElement("div");
    frame.className = "tapt-desktop-frame";
    document.body.appendChild(frame);

    render(modal());

    const layer = screen.getByTestId("report-modal-layer");
    expect(layer.parentElement).toBe(frame);
    expect(layer).toHaveStyle({ position: "absolute" });

    frame.remove();
  });
});
