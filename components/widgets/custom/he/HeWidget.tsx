"use client";

import { type CSSProperties } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
};

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  textTransform: "uppercase",
};

const panelStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 14,
  boxShadow: "2px 2px 0 var(--shadow)",
};

const statStyle: CSSProperties = {
  ...panelStyle,
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
  padding: "7px 8px",
};

const trackStyle: CSSProperties = {
  ...panelStyle,
  display: "grid",
  gap: 5,
  padding: 10,
};

const segmentStyle: CSSProperties = {
  background: "var(--accent-cyan)",
  border: "1.5px solid var(--border)",
  borderRadius: 999,
  boxShadow: "1px 1px 0 var(--shadow)",
  height: 7,
};

const orangeSegmentStyle: CSSProperties = {
  ...segmentStyle,
  background: "var(--accent-orange)",
};

function cleanText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : "run";
}

function RunTrack({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-hidden="true" style={{ ...trackStyle, gridTemplateColumns: compact ? "1fr" : "1.2fr 0.7fr 1fr" }}>
      <span style={orangeSegmentStyle} />
      {!compact && <span style={segmentStyle} />}
      <span style={{ ...segmentStyle, opacity: 0.72 }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statStyle}>
      <span style={labelStyle}>{label}</span>
      <span className="block-value" style={{ ...monoStyle, fontSize: "0.98rem", lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

export function HeWidget() {
  const { size, settings } = useWidget();
  const prompt = cleanText(settings.example);

  if (size === "S") {
    return (
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          height: "100%",
          justifyContent: "center",
          minWidth: 0,
          textAlign: "center",
        }}
      >
        <div style={labelStyle}>he</div>
        <div className="block-value accent" style={{ ...monoStyle, fontSize: "1.58rem", lineHeight: 1 }}>
          {prompt}
        </div>
        <RunTrack compact />
      </div>
    );
  }

  if (size === "M") {
    return (
      <div style={{ display: "grid", gap: 10, height: "100%", minWidth: 0 }}>
        <div style={{ alignItems: "baseline", display: "flex", gap: 8, justifyContent: "space-between", minWidth: 0 }}>
          <div>
            <div style={labelStyle}>he</div>
            <div className="block-value accent" style={{ ...monoStyle, fontSize: "1.72rem", lineHeight: 1.05 }}>
              {prompt}
            </div>
          </div>
          <div className="block-sub" style={{ ...monoStyle, textAlign: "right" }}>
            steady
          </div>
        </div>
        <RunTrack />
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <Stat label="pace" value="5:42" />
          <Stat label="km" value="3.8" />
          <Stat label="hr" value="142" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10, height: "100%", minWidth: 0 }}>
      <div style={{ alignItems: "start", display: "flex", gap: 12, justifyContent: "space-between", minWidth: 0 }}>
        <div>
          <div style={labelStyle}>he</div>
          <div className="block-value accent" style={{ ...monoStyle, fontSize: "2rem", lineHeight: 1 }}>
            {prompt}
          </div>
          <div className="block-sub" style={{ marginTop: 3 }}>
            forward motion log
          </div>
        </div>
        <div style={{ ...panelStyle, padding: "7px 10px", textAlign: "right" }}>
          <div style={labelStyle}>state</div>
          <div className="block-value teal" style={{ ...monoStyle, fontSize: "1rem" }}>
            active
          </div>
        </div>
      </div>
      <RunTrack />
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <Stat label="pace" value="5:42" />
        <Stat label="km" value="3.8" />
        <Stat label="hr" value="142" />
        <Stat label="cad" value="176" />
      </div>
      <div style={{ display: "grid", gap: 6, minHeight: 0 }}>
        <div className="more-head">splits</div>
        <div className="more-row">
          <span>km 1</span>
          <span style={monoStyle}>5:51</span>
        </div>
        <div className="more-row">
          <span>km 2</span>
          <span style={monoStyle}>5:39</span>
        </div>
        <div className="more-row">
          <span>km 3</span>
          <span style={monoStyle}>5:36</span>
        </div>
      </div>
    </div>
  );
}
