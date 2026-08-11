import { createRoot } from "react-dom/client";
import LandingDemoApp from "./LandingDemoApp";
import "./landing-demo.css";

const rootElement = document.getElementById("root");

if (
  !(rootElement instanceof HTMLElement) ||
  rootElement.dataset.landingDemoRoot !== "taptpay-landing-demo-v1"
) {
  throw new Error("Landing demo root marker is missing");
}

createRoot(rootElement).render(<LandingDemoApp />);
