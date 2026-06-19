import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 128,
            height: 128,
            borderRadius: 32,
            background: "#000",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 18px 55px rgba(0,0,0,0.55)",
          }}
        >
          <span style={{ color: "#E6C65C", fontWeight: 900, fontSize: 44, letterSpacing: 3 }}>BOS</span>
        </div>
      </div>
    ),
    size,
  );
}
