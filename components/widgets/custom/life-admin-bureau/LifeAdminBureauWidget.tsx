"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

type BureauAction = "resolve" | "appeal" | "extend" | "form";

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
};

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const nestedPanelStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 14,
};

const raisedPanelStyle: CSSProperties = {
  ...nestedPanelStyle,
  boxShadow: "4px 4px 0 var(--shadow)",
};

const rowStyle: CSSProperties = {
  alignItems: "center",
  borderBottom: "1.5px solid var(--border)",
  color: "var(--text-muted)",
  display: "flex",
  fontSize: "0.7rem",
  gap: 12,
  justifyContent: "space-between",
  padding: "9px 0",
};

const folderLineStyle: CSSProperties = {
  borderBottom: "1.5px solid var(--border)",
  display: "grid",
  gap: 3,
  paddingBottom: 8,
};

const caseMatrix = [
  {
    code: "UM-09",
    text: "Unanswered Messages demands a reply with adequate punctuation remorse.",
  },
  {
    code: "LP-14",
    text: "Laundry Permits disputes the legal status of one chair pile.",
  },
  {
    code: "HC-22",
    text: "Hydration Compliance requires evidence of bottle interaction.",
  },
  {
    code: "SZ-03",
    text: "Snack Zoning contests chips eaten in the hallway district.",
  },
];

const history = [
  { label: "mug moved", status: "approved", color: "var(--text-muted)" },
  { label: "toast zoning", status: "waived", color: "var(--accent-cyan)", rotate: "-2deg" },
  { label: "nap lien", status: "active", color: "var(--accent-orange)", rotate: "2deg" },
  { label: "drawer proof", status: "missing", color: "var(--text-muted)" },
];

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="block-label" style={{ ...labelStyle, alignItems: "center", display: "flex", gap: 6, padding: 0 }}>
      {children}
    </div>
  );
}

function DeskButton({
  action,
  children,
  onAction,
}: {
  action: BureauAction;
  children: ReactNode;
  onAction: (action: BureauAction) => void;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [isPressing, setIsPressing] = useState(false);

  return (
    <button
      onClick={() => onAction(action)}
      onMouseDown={() => setIsPressing(true)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        setIsPressing(false);
      }}
      onMouseUp={() => setIsPressing(false)}
      style={{
        background: "var(--bg-nested)",
        border: `1.5px solid ${isHovering ? "var(--accent-cyan)" : "var(--border)"}`,
        borderRadius: 12,
        boxShadow: isPressing ? "1px 1px 0 var(--shadow)" : "3px 3px 0 var(--shadow)",
        color: isHovering ? "var(--accent-cyan)" : "var(--text-primary)",
        cursor: "pointer",
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: "0.66rem",
        fontWeight: 500,
        minHeight: 36,
        textTransform: "uppercase",
        transform: isPressing ? "translate(1px, 1px)" : isHovering ? "translate(-1px, -1px)" : "none",
        transition: "transform 140ms ease, color 140ms ease, border-color 140ms ease",
        width: "100%",
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function CompactView({ miniStatus }: { miniStatus: string }) {
  return (
    <div
      style={{
        ...monoStyle,
        color: "var(--text-primary)",
        display: "grid",
        gap: 10,
        height: "100%",
        minHeight: 0,
      }}
    >
      <SectionLabel>S / citation</SectionLabel>
      <div style={{ display: "grid", gap: 10, minHeight: 0 }}>
        <div
          style={{
            ...raisedPanelStyle,
            alignItems: "center",
            borderColor: "var(--accent-orange)",
            display: "grid",
            gap: 12,
            gridTemplateColumns: "auto 1fr",
            padding: 10,
          }}
        >
          <b
            className="block-value accent"
            style={{
              color: "var(--accent-orange)",
              fontFamily: "var(--font-dot-gothic), monospace",
              fontSize: "3.4rem",
              fontWeight: 400,
              lineHeight: 0.9,
            }}
          >
            3
          </b>
          <span className="block-sub" style={{ color: "var(--text-primary)", fontSize: "0.8rem", lineHeight: 1.35 }}>
            forms overdue under municipal self-annoyance code
          </span>
        </div>
        <div className="more-row" style={rowStyle}>
          <span>highest risk</span>
          <span style={{ color: "var(--accent-cyan)", textAlign: "right" }}>sleep debt</span>
        </div>
        <div className="more-row" style={{ ...rowStyle, borderBottom: "none" }}>
          <span>stamp status</span>
          <span style={{ color: "var(--accent-cyan)", textAlign: "right" }}>{miniStatus}</span>
        </div>
      </div>
    </div>
  );
}

function FolderView({ deadlineText }: { deadlineText: string }) {
  return (
    <div
      style={{
        ...monoStyle,
        color: "var(--text-primary)",
        display: "grid",
        gap: 10,
        height: "100%",
        minHeight: 0,
        overflow: "auto",
      }}
    >
      <SectionLabel>M / active folder</SectionLabel>
      <div style={{ display: "grid", gap: 10, minHeight: 0 }}>
        <div
          style={{
            ...nestedPanelStyle,
            borderBottomColor: "var(--bg-nested)",
            borderRadius: "12px 12px 0 0",
            color: "var(--accent-cyan)",
            fontFamily: "var(--font-dot-gothic), monospace",
            fontSize: "0.76rem",
            justifySelf: "start",
            padding: "7px 10px",
            textTransform: "uppercase",
          }}
        >
          SDR-31
        </div>
        <div
          style={{
            ...nestedPanelStyle,
            borderRadius: "0 14px 14px 14px",
            display: "grid",
            gap: 8,
            padding: 12,
          }}
        >
          <FolderLine label="department">Sleep Debt Recovery and Blanket Asset Seizure</FolderLine>
          <FolderLine label="violation">
            Alarm snoozed three times without filing an intent-to-rest amendment.
          </FolderLine>
          <FolderLine label="deadline">{deadlineText}</FolderLine>
          <FolderLine label="penalty">
            Accrued fatigue interest and a suspiciously early bedtime recommendation.
          </FolderLine>
          <div style={{ color: "var(--text-primary)", fontSize: "0.74rem", lineHeight: 1.45 }}>
            Remediation: lie down with procedural dignity, close all tabs, and initial the blanket corner.
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderLine({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="more-row" style={folderLineStyle}>
      <small className="more-meta" style={labelStyle}>
        {label}
      </small>
      <span style={{ color: "var(--text-primary)", fontSize: "0.75rem", lineHeight: 1.45 }}>{children}</span>
    </div>
  );
}

function NoticeCard({
  children,
  isGenerated = false,
  title,
  visible = true,
}: {
  children: ReactNode;
  isGenerated?: boolean;
  title: string;
  visible?: boolean;
}) {
  return (
    <div
      style={{
        ...nestedPanelStyle,
        display: "grid",
        fontSize: "0.66rem",
        gap: visible ? 5 : 0,
        lineHeight: 1.35,
        maxHeight: visible ? 110 : 0,
        opacity: visible ? 1 : 0,
        overflow: "hidden",
        padding: visible ? 10 : "0 10px",
        transform: visible ? "translateX(0)" : "translateX(8px)",
        transition:
          "max-height 180ms ease, opacity 180ms ease, transform 180ms ease, padding 180ms ease, gap 180ms ease",
      }}
    >
      <b
        style={{
          color: isGenerated ? "var(--accent-cyan)" : "var(--accent-orange)",
          fontFamily: "var(--font-dot-gothic), monospace",
          fontSize: "0.7rem",
          fontWeight: 400,
          textTransform: "uppercase",
        }}
      >
        {title}
      </b>
      <span style={{ color: "var(--text-muted)" }}>{children}</span>
    </div>
  );
}

function RichView({
  deadlineText,
  formOutput,
  meterExtended,
  meterLabel,
  onAction,
  sealApproved,
  sealText,
  showFollowUp,
}: {
  deadlineText: string;
  formOutput: string;
  meterExtended: boolean;
  meterLabel: string;
  onAction: (action: BureauAction) => void;
  sealApproved: boolean;
  sealText: string;
  showFollowUp: boolean;
}) {
  return (
    <div
      style={{
        ...monoStyle,
        color: "var(--text-primary)",
        display: "grid",
        gap: 14,
        height: "100%",
        minHeight: 0,
        overflow: "auto",
      }}
    >
      <section
        style={{
          ...raisedPanelStyle,
          alignItems: "center",
          display: "grid",
          gap: 18,
          gridTemplateColumns: "minmax(0, 1fr) auto",
          padding: "14px 16px",
        }}
      >
        <h2
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-dot-gothic), monospace",
            fontSize: "clamp(1.3rem, 3vw, 2.1rem)",
            fontWeight: 400,
            lineHeight: 1,
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          Personal Civic Audit Ledger
        </h2>
        <span style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "right" }}>
          office of petty domestic compliance / no refunds
        </span>
      </section>

      <SectionLabel>L / compliance machine</SectionLabel>

      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "minmax(0, 1fr) minmax(190px, 230px)",
          minHeight: 0,
        }}
      >
        <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
          <div
            style={{
              alignItems: "stretch",
              display: "grid",
              gap: 14,
              gridTemplateColumns: "190px minmax(0, 1fr)",
            }}
          >
            <div
              style={{
                ...raisedPanelStyle,
                borderColor: "var(--accent-orange)",
                display: "grid",
                minHeight: 190,
                padding: 16,
                placeItems: "center",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  border: `1.5px solid ${sealApproved ? "var(--accent-cyan)" : "var(--accent-orange)"}`,
                  borderRadius: 16,
                  color: sealApproved ? "var(--accent-cyan)" : "var(--accent-orange)",
                  display: "grid",
                  fontFamily: "var(--font-dot-gothic), monospace",
                  fontSize: "0.9rem",
                  height: 132,
                  lineHeight: 1.1,
                  placeItems: "center",
                  textAlign: "center",
                  textTransform: "uppercase",
                  transform: sealApproved ? "rotate(5deg) scale(1.03)" : "rotate(-8deg)",
                  transition: "transform 180ms ease, color 180ms ease, border-color 180ms ease",
                  width: 132,
                }}
              >
                {sealText}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              {caseMatrix.map((item) => (
                <div
                  className="more-row"
                  key={item.code}
                  style={{
                    ...nestedPanelStyle,
                    display: "grid",
                    gap: 6,
                    minHeight: 86,
                    padding: 10,
                  }}
                >
                  <b
                    style={{
                      color: "var(--accent-cyan)",
                      fontFamily: "var(--font-dot-gothic), monospace",
                      fontSize: "0.78rem",
                      fontWeight: 400,
                      textTransform: "uppercase",
                    }}
                  >
                    {item.code}
                  </b>
                  <span className="block-sub" style={{ color: "var(--text-muted)", fontSize: "0.64rem", lineHeight: 1.35 }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...nestedPanelStyle, display: "grid", gap: 8, padding: 10 }}>
            <div
              className="more-head"
              style={{
                alignItems: "center",
                color: "var(--text-muted)",
                display: "flex",
                fontSize: "0.68rem",
                gap: 12,
                justifyContent: "space-between",
                textTransform: "uppercase",
              }}
            >
              <span>escalation pressure</span>
              <span>{meterLabel}</span>
            </div>
            <div
              style={{
                background: "var(--bg-card)",
                border: "1.5px solid var(--border)",
                borderRadius: 12,
                height: 20,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: meterExtended ? "var(--accent-cyan)" : "var(--accent-orange)",
                  height: "100%",
                  transition: "width 180ms ease, background 180ms ease",
                  width: meterExtended ? "42%" : "62%",
                }}
              />
            </div>
          </div>

          <FolderView deadlineText={deadlineText} />

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {history.map((item) => (
              <div
                key={item.label}
                style={{
                  ...nestedPanelStyle,
                  color: item.color,
                  display: "grid",
                  fontFamily: "var(--font-dot-gothic), monospace",
                  fontSize: "0.66rem",
                  lineHeight: 1.25,
                  minHeight: 70,
                  padding: 8,
                  placeItems: "center",
                  textAlign: "center",
                  textTransform: "uppercase",
                  transform: item.rotate ? `rotate(${item.rotate})` : "none",
                }}
              >
                <span>
                  {item.label}
                  <br />
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ alignContent: "start", display: "grid", gap: 8, minWidth: 0 }}>
          <div className="more-head" style={labelStyle}>
            desk actions
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <DeskButton action="resolve" onAction={onAction}>
              stamp as resolved
            </DeskButton>
            <DeskButton action="appeal" onAction={onAction}>
              appeal decision
            </DeskButton>
            <DeskButton action="extend" onAction={onAction}>
              request extension
            </DeskButton>
            <DeskButton action="form" onAction={onAction}>
              generate form
            </DeskButton>
          </div>

          <div className="more-head" style={labelStyle}>
            notices
          </div>
          <NoticeCard title="approval stamp">Snack Zoning accepted one corridor chip under protest.</NoticeCard>
          <NoticeCard title="escalation">Sleep Debt Recovery may garnish tomorrow's patience.</NoticeCard>
          <NoticeCard isGenerated title="follow-up" visible={showFollowUp}>
            Resolved sleep case created Blanket Corner Verification Form SDR-32A.
          </NoticeCard>

          <div className="more-head" style={labelStyle}>
            form output
          </div>
          <div
            aria-live="polite"
            style={{
              ...nestedPanelStyle,
              color: "var(--text-muted)",
              fontSize: "0.66rem",
              lineHeight: 1.35,
              minHeight: 42,
              padding: "9px 10px",
            }}
          >
            {formOutput}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LifeAdminBureauWidget() {
  const { size } = useWidget();
  const [formIndex, setFormIndex] = useState(31);
  const [formOutput, setFormOutput] = useState("No current form. This itself may require a form.");
  const [meterExtended, setMeterExtended] = useState(false);
  const [meterLabel, setMeterLabel] = useState("moderately official");
  const [miniStatus, setMiniStatus] = useState("unsettled");
  const [sealApproved, setSealApproved] = useState(false);
  const [sealText, setSealText] = useState("review in triplicate");
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [deadlineText, setDeadlineText] = useState("Before pillow negotiations resume");

  function handleAction(action: BureauAction) {
    if (action === "resolve") {
      setSealText("resolved but reopened");
      setSealApproved(true);
      setShowFollowUp(true);
      setMiniStatus("reopened");
      setFormOutput("Closure accepted. New follow-up notice SDR-32A has been opened automatically.");
      return;
    }

    if (action === "appeal") {
      setSealText("appeal denied");
      setSealApproved(false);
      setMeterLabel("personally offended");
      setFormOutput("Appeal routed to the Department of Already Decided Outcomes.");
      return;
    }

    if (action === "extend") {
      setDeadlineText("Before pillow negotiations resume, plus nine procedural minutes");
      setMeterExtended(true);
      setMeterLabel("temporarily suspicious");
      setFormOutput("Extension granted in exchange for one sincere yawn.");
      return;
    }

    const nextIndex = formIndex + 1;
    setFormIndex(nextIndex);
    setFormOutput(`Generated Form SDR-${nextIndex}C: affidavit of blanket intent and tab closure.`);
  }

  if (size === "S") {
    return <CompactView miniStatus={miniStatus} />;
  }

  if (size === "M") {
    return <FolderView deadlineText={deadlineText} />;
  }

  return (
    <RichView
      deadlineText={deadlineText}
      formOutput={formOutput}
      meterExtended={meterExtended}
      meterLabel={meterLabel}
      onAction={handleAction}
      sealApproved={sealApproved}
      sealText={sealText}
      showFollowUp={showFollowUp}
    />
  );
}
