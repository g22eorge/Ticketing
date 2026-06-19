import { ImageResponse } from "next/og";
import { eagleLogo } from "@/lib/eagle-logo";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#020408",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: 72,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(900px 450px at 18% 22%, rgba(230,198,92,0.22), transparent 55%), radial-gradient(720px 420px at 82% 70%, rgba(230,198,92,0.14), transparent 60%)",
          }}
        />

        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 40,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "linear-gradient(180deg, rgba(16,16,16,0.92), rgba(0,0,0,0.86))",
            boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
            display: "flex",
            padding: 64,
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -140,
              top: -120,
              width: 520,
              height: 520,
              borderRadius: 999,
              background: "radial-gradient(circle at 30% 30%, rgba(230,198,92,0.26), rgba(230,198,92,0.00) 65%)",
              filter: "blur(1px)",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 999,
                  background: "#fff",
                  border: "1px solid rgba(230,198,92,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 18px rgba(230,198,92,0.25)",
                  overflow: "hidden",
                }}
              >
                <img src={eagleLogo} width={72} height={72} style={{ objectFit: "cover" }} alt="" />
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ color: "rgba(255,255,255,0.86)", fontSize: 14, letterSpacing: 4, fontWeight: 700 }}>
                  BUSINESS OS
                </div>
                <div style={{ color: "rgba(230,198,92,0.92)", fontSize: 12, letterSpacing: 3, fontWeight: 700 }}>
                  BUSINESS MANAGEMENT
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", color: "#fff", fontSize: 56, fontWeight: 800, lineHeight: 1.05 }}>
              <div style={{ display: "flex" }}>Repair Booking,</div>
              <div style={{ display: "flex" }}>Hardware, and Software</div>
            </div>

            <div style={{ color: "rgba(255,255,255,0.70)", fontSize: 18, lineHeight: 1.4 }}>
              Track jobs, approvals, external assignments, and customer updates in one place.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-end", gap: 10 }}>
            <div
              style={{
                color: "rgba(255,255,255,0.72)",
                fontSize: 12,
                letterSpacing: 3,
                fontWeight: 700,
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.35)",
              }}
            >
              BusinessOS
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
