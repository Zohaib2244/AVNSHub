"use client";

import { useEffect, useState } from "react";

// ASCII retro CRT mascot. Big round eyes wander around the screen and blink
// every so often — gaze shifts left/center/right on a loose random rhythm.
type Gaze = "left" | "center" | "right";

// each gaze keeps the two eyes one cell apart inside the 5-char screen
function eyeLine(gaze: Gaze, blink: boolean): { pre: string; l: string; mid: string; r: string; post: string } {
  const eye = blink ? "─" : "●";
  if (gaze === "left") return { pre: "", l: eye, mid: " ", r: eye, post: "  " };
  if (gaze === "right") return { pre: "  ", l: eye, mid: " ", r: eye, post: "" };
  return { pre: " ", l: eye, mid: " ", r: eye, post: " " };
}

export function NutBotFace() {
  const [gaze, setGaze] = useState<Gaze>("center");
  const [blink, setBlink] = useState(false);

  // wander: every ~2.4s pick a new gaze (weighted back toward center)
  useEffect(() => {
    const id = setInterval(() => {
      setGaze((prev) => {
        const options: Gaze[] = prev === "center" ? ["left", "right"] : ["center", "center", prev === "left" ? "right" : "left"];
        return options[Math.floor(Math.random() * options.length)];
      });
    }, 2400);
    return () => clearInterval(id);
  }, []);

  // blink: quick shut every ~3.8s
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 130);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  const e = eyeLine(gaze, blink);

  return (
    <div className="nutbot-face" aria-hidden>
      <div>{"╭─────╮"}</div>
      <div>
        {"│"}
        <span className="nutbot-face-screen">
          {e.pre}
          <span className="nutbot-face-eye">{e.l}</span>
          {e.mid}
          <span className="nutbot-face-eye">{e.r}</span>
          {e.post}
        </span>
        {"│"}
      </div>
      <div>
        {"│"}
        <span className="nutbot-face-screen">
          {" "}
          <span className="nutbot-face-mouth">{"▂▂▂"}</span>{" "}
        </span>
        {"│"}
      </div>
      <div>{"╰─────╯"}</div>
      <div>
        {"▐"}
        <span className="nutbot-face-slot">{"▬▬ ▪ "}</span>
        {"▌"}
      </div>
    </div>
  );
}
