import { useLocation } from "wouter";
import taptLogo from "@assets/IMG_6592_1755070818452.png";

export default function AppLogin() {
  const [, setLocation] = useLocation();

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0055FF",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "48px",
        padding: "32px",
      }}
    >
      <img
        src={taptLogo}
        alt="TaptPay"
        style={{ width: 200, maxWidth: "60vw", objectFit: "contain" }}
      />
      <button
        onClick={() => setLocation("/login")}
        style={{
          background: "#ffffff",
          color: "#0055FF",
          border: "none",
          borderRadius: "16px",
          padding: "18px 64px",
          fontSize: "20px",
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "-0.3px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}
      >
        Log in
      </button>
    </div>
  );
}
