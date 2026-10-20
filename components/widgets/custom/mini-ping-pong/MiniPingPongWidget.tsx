"use client";

import { type CSSProperties, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";
import { canvasScopedKey, getActiveCanvasId, subscribeCanvases } from "@/lib/canvases";

type Difficulty = "Easy" | "Normal" | "Hard";
type GameStatus = "Ready" | "Playing" | "Paused" | "You Win" | "CPU Wins";
type Score = { player: number; cpu: number };
type Ball = { x: number; y: number; vx: number; vy: number };
type GameState = { ball: Ball; playerY: number; cpuY: number; lastTime: number };
type Palette = {
  accent: string;
  teal: string;
  primary: string;
  muted: string;
  border: string;
  bg: string;
  labelFont: string;
};
type HistoryItem = {
  id: number;
  result: Extract<GameStatus, "You Win" | "CPU Wins">;
  player: number;
  cpu: number;
  difficulty: Difficulty;
};

const WIN_SCORE = 7;
const PADDLE_HALF = 0.145;
const PADDLE_WIDTH = 0.026;
const PLAYER_X = 0.052;
const CPU_X = 0.948;
const BALL_RADIUS = 0.018;
const BALL_SPEED = 0.56;
const HIGH_SCORE_KEY = "nutmag-mini-ping-pong-high-score";
const DIFFICULTIES: Difficulty[] = ["Easy", "Normal", "Hard"];
const CPU_SPEED: Record<Difficulty, number> = {
  Easy: 0.54,
  Normal: 0.78,
  Hard: 1.08,
};

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: 0,
  textTransform: "uppercase",
};
const rowStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: 6,
  justifyContent: "space-between",
  minWidth: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readVar(el: HTMLElement, name: string, fallback: string) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

function readPalette(el: HTMLElement): Palette {
  return {
    accent: readVar(el, "--accent-orange", "CanvasText"),
    teal: readVar(el, "--accent-cyan", "CanvasText"),
    primary: readVar(el, "--text-primary", "CanvasText"),
    muted: readVar(el, "--text-muted", "CanvasText"),
    border: readVar(el, "--border", "CanvasText"),
    bg: readVar(el, "--bg-nested", "Canvas"),
    labelFont: readVar(el, "--font-dot-gothic", "monospace"),
  };
}

function readStoredHighScore(key: string) {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number(localStorage.getItem(key));
    if (!Number.isFinite(value)) return 0;
    return clamp(Math.floor(value), 0, WIN_SCORE);
  } catch {
    return 0;
  }
}

function makeBall(direction: -1 | 1): Ball {
  const vertical = 0.18 + Math.random() * 0.22;
  return {
    x: 0.5,
    y: 0.5,
    vx: BALL_SPEED * direction,
    vy: vertical * (Math.random() > 0.5 ? 1 : -1),
  };
}

function buildButtonStyle(active = false, disabled = false): CSSProperties {
  return {
    background: active ? "var(--accent-cyan)" : "var(--bg-nested)",
    border: "1.5px solid var(--border)",
    borderRadius: 12,
    boxShadow: "2px 2px 0 var(--shadow)",
    color: active ? "var(--bg-card)" : "var(--text-primary)",
    cursor: disabled ? "default" : "pointer",
    fontFamily: "var(--font-dot-gothic), monospace",
    fontSize: "0.66rem",
    lineHeight: 1,
    opacity: disabled ? 0.55 : 1,
    padding: "6px 9px",
    textTransform: "uppercase",
  };
}

function drawGame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: GameState,
  palette: Palette,
  status: GameStatus,
) {
  const paddleWidth = Math.max(6, width * PADDLE_WIDTH);
  const paddleHeight = Math.max(24, height * PADDLE_HALF * 2);
  const ballRadius = Math.max(4, Math.min(width, height) * BALL_RADIUS);
  const playerX = width * PLAYER_X;
  const cpuX = width * CPU_X - paddleWidth;
  const playerY = height * state.playerY - paddleHeight / 2;
  const cpuY = height * state.cpuY - paddleHeight / 2;

  context.clearRect(0, 0, width, height);
  context.fillStyle = palette.bg;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = palette.border;
  context.lineWidth = 1.5;
  context.setLineDash([5, 7]);
  context.beginPath();
  context.moveTo(width / 2, 8);
  context.lineTo(width / 2, height - 8);
  context.stroke();
  context.restore();

  context.fillStyle = palette.accent;
  context.fillRect(playerX, playerY, paddleWidth, paddleHeight);

  context.fillStyle = palette.teal;
  context.fillRect(cpuX, cpuY, paddleWidth, paddleHeight);

  context.beginPath();
  context.fillStyle = palette.primary;
  context.arc(width * state.ball.x, height * state.ball.y, ballRadius, 0, Math.PI * 2);
  context.fill();

  if (status !== "Playing") {
    context.save();
    context.fillStyle = palette.primary;
    context.font = `700 ${Math.max(14, Math.min(24, height * 0.18))}px ${palette.labelFont}, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(status, width / 2, height / 2);
    context.restore();
  }
}

export function MiniPingPongWidget() {
  const { size, isFocused } = useWidget();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerActiveRef = useRef(false);
  const historyIdRef = useRef(0);
  const storageKeyRef = useRef(HIGH_SCORE_KEY);
  const [score, setScore] = useState<Score>({ player: 0, cpu: 0 });
  const [status, setStatus] = useState<GameStatus>("Ready");
  const [difficulty, setDifficulty] = useState<Difficulty>("Normal");
  const [highScore, setHighScore] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const scoreRef = useRef(score);
  const statusRef = useRef(status);
  const difficultyRef = useRef(difficulty);
  const highScoreRef = useRef(highScore);
  const gameRef = useRef<GameState>({
    ball: makeBall(1),
    playerY: 0.5,
    cpuY: 0.5,
    lastTime: 0,
  });

  const setGameStatus = useCallback((next: GameStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const setGameScore = useCallback((next: Score) => {
    scoreRef.current = next;
    setScore(next);
  }, []);

  const persistHighScore = useCallback((playerScore: number) => {
    const next = clamp(playerScore, 0, WIN_SCORE);
    if (next <= highScoreRef.current) return;
    highScoreRef.current = next;
    setHighScore(next);
    try {
      localStorage.setItem(storageKeyRef.current, String(next));
    } catch {
      // Local storage is optional; the session value still updates.
    }
  }, []);

  const resetPositions = useCallback((direction: -1 | 1 = 1) => {
    gameRef.current = {
      ball: makeBall(direction),
      playerY: 0.5,
      cpuY: 0.5,
      lastTime: 0,
    };
  }, []);

  const startGame = useCallback(() => {
    if (statusRef.current === "Paused") {
      gameRef.current.lastTime = 0;
      setGameStatus("Playing");
      return;
    }

    setGameScore({ player: 0, cpu: 0 });
    resetPositions(Math.random() > 0.5 ? 1 : -1);
    setGameStatus("Playing");
  }, [resetPositions, setGameScore, setGameStatus]);

  const pauseGame = useCallback(() => {
    if (statusRef.current !== "Playing") return;
    setGameStatus("Paused");
  }, [setGameStatus]);

  const resetGame = useCallback(() => {
    setGameScore({ player: 0, cpu: 0 });
    resetPositions(1);
    setGameStatus("Ready");
  }, [resetPositions, setGameScore, setGameStatus]);

  const finishRound = useCallback(
    (result: Extract<GameStatus, "You Win" | "CPU Wins">, finalScore: Score) => {
      const id = historyIdRef.current + 1;
      historyIdRef.current = id;
      setGameStatus(result);
      persistHighScore(finalScore.player);
      setHistory((items) => [
        {
          cpu: finalScore.cpu,
          difficulty: difficultyRef.current,
          id,
          player: finalScore.player,
          result,
        },
        ...items,
      ].slice(0, 5));
      resetPositions(result === "You Win" ? -1 : 1);
    },
    [persistHighScore, resetPositions, setGameStatus],
  );

  const awardPoint = useCallback(
    (side: "player" | "cpu") => {
      const current = scoreRef.current;
      const next = {
        player: current.player + (side === "player" ? 1 : 0),
        cpu: current.cpu + (side === "cpu" ? 1 : 0),
      };

      setGameScore(next);
      persistHighScore(next.player);

      if (next.player >= WIN_SCORE || next.cpu >= WIN_SCORE) {
        finishRound(next.player >= WIN_SCORE ? "You Win" : "CPU Wins", next);
        return;
      }

      resetPositions(side === "player" ? -1 : 1);
    },
    [finishRound, persistHighScore, resetPositions, setGameScore],
  );

  const setPlayerFromPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextY = (event.clientY - bounds.top) / Math.max(1, bounds.height);
    gameRef.current.playerY = clamp(nextY, PADDLE_HALF, 1 - PADDLE_HALF);
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      pointerActiveRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setPlayerFromPointer(event);
    },
    [setPlayerFromPointer],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!pointerActiveRef.current) return;
      setPlayerFromPointer(event);
    },
    [setPlayerFromPointer],
  );

  const handlePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    pointerActiveRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const changeDifficulty = useCallback((next: Difficulty) => {
    difficultyRef.current = next;
    setDifficulty(next);
  }, []);

  useEffect(() => {
    const syncHighScore = () => {
      const key = canvasScopedKey(HIGH_SCORE_KEY, getActiveCanvasId());
      const stored = readStoredHighScore(key);
      storageKeyRef.current = key;
      highScoreRef.current = stored;
      setHighScore(stored);
    };

    syncHighScore();
    return subscribeCanvases(syncHighScore);
  }, []);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isFocused) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      gameRef.current.playerY = clamp(gameRef.current.playerY + direction * 0.055, PADDLE_HALF, 1 - PADDLE_HALF);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFocused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !stage || !context) return;

    let frame = 0;
    let width = 220;
    let height = 120;
    let palette = readPalette(stage);

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      width = Math.max(140, Math.round(bounds.width || 220));
      height = Math.max(72, Math.round(bounds.height || 120));
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      palette = readPalette(stage);
    };

    const updateGame = (dt: number) => {
      const state = gameRef.current;
      const ball = state.ball;
      const cpuSpeed = CPU_SPEED[difficultyRef.current];
      const targetY = ball.vx > 0 ? ball.y : 0.5;
      const cpuDelta = clamp(targetY - state.cpuY, -cpuSpeed * dt, cpuSpeed * dt);

      state.cpuY = clamp(state.cpuY + cpuDelta, PADDLE_HALF, 1 - PADDLE_HALF);
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.y <= BALL_RADIUS || ball.y >= 1 - BALL_RADIUS) {
        ball.y = clamp(ball.y, BALL_RADIUS, 1 - BALL_RADIUS);
        ball.vy *= -1;
      }

      const playerTop = state.playerY - PADDLE_HALF;
      const playerBottom = state.playerY + PADDLE_HALF;
      const cpuTop = state.cpuY - PADDLE_HALF;
      const cpuBottom = state.cpuY + PADDLE_HALF;
      const playerFace = PLAYER_X + PADDLE_WIDTH;
      const cpuFace = CPU_X - PADDLE_WIDTH;

      if (ball.vx < 0 && ball.x - BALL_RADIUS <= playerFace && ball.x > PLAYER_X && ball.y >= playerTop && ball.y <= playerBottom) {
        const hit = (ball.y - state.playerY) / PADDLE_HALF;
        ball.x = playerFace + BALL_RADIUS;
        ball.vx = Math.min(Math.abs(ball.vx) * 1.04, 0.86);
        ball.vy = clamp(ball.vy + hit * 0.22, -0.72, 0.72);
      }

      if (ball.vx > 0 && ball.x + BALL_RADIUS >= cpuFace && ball.x < CPU_X && ball.y >= cpuTop && ball.y <= cpuBottom) {
        const hit = (ball.y - state.cpuY) / PADDLE_HALF;
        ball.x = cpuFace - BALL_RADIUS;
        ball.vx = -Math.min(Math.abs(ball.vx) * 1.04, 0.86);
        ball.vy = clamp(ball.vy + hit * 0.2, -0.72, 0.72);
      }

      if (ball.x < -BALL_RADIUS) {
        awardPoint("cpu");
      } else if (ball.x > 1 + BALL_RADIUS) {
        awardPoint("player");
      }
    };

    const tick = (time: number) => {
      const state = gameRef.current;
      const previous = state.lastTime || time;
      const dt = Math.min(0.032, (time - previous) / 1000);
      state.lastTime = time;

      if (statusRef.current === "Playing") {
        updateGame(dt);
      } else {
        state.lastTime = time;
      }

      drawGame(context, width, height, state, palette, statusRef.current);
      frame = requestAnimationFrame(tick);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    frame = requestAnimationFrame(tick);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [awardPoint, size]);

  const stageStyle: CSSProperties = {
    background: "var(--bg-nested)",
    border: "1.5px solid var(--border)",
    borderRadius: 14,
    boxShadow: "3px 3px 0 var(--shadow)",
    cursor: "ns-resize",
    flex: "1 1 auto",
    minHeight: size === "L" ? 112 : 42,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
    touchAction: "none",
  };

  if (size === "S") {
    return (
      <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 7, height: "100%", justifyContent: "center", minHeight: 0, overflow: "hidden" }}>
        <div className="block-label" style={{ ...labelStyle, color: "var(--accent-orange)" }}>
          PING
        </div>
        <div className="block-value" style={{ ...monoStyle, fontSize: "1.8rem", lineHeight: 1 }}>
          {score.player}-{score.cpu}
        </div>
        <div className="block-sub" style={{ ...labelStyle, color: status === "Playing" ? "var(--accent-cyan)" : "var(--text-muted)" }}>
          {status}
        </div>
        <div className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.72rem" }}>
          HI {highScore}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size === "L" ? 8 : 6, height: "100%", minHeight: 0, overflow: "hidden" }}>
      {size === "L" ? (
        <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <div>
            <div className="block-label" style={labelStyle}>
              player
            </div>
            <div className="block-value accent" style={{ ...monoStyle, fontSize: "1.1rem", lineHeight: 1.1 }}>
              {score.player}
            </div>
          </div>
          <div>
            <div className="block-label" style={labelStyle}>
              cpu
            </div>
            <div className="block-value teal" style={{ ...monoStyle, fontSize: "1.1rem", lineHeight: 1.1 }}>
              {score.cpu}
            </div>
          </div>
          <div>
            <div className="block-label" style={labelStyle}>
              high
            </div>
            <div className="block-value" style={{ ...monoStyle, fontSize: "1.1rem", lineHeight: 1.1 }}>
              {highScore}
            </div>
          </div>
          <div>
            <div className="block-label" style={labelStyle}>
              status
            </div>
            <div className="block-sub" style={{ ...labelStyle, color: status === "Playing" ? "var(--accent-cyan)" : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status}
            </div>
          </div>
        </div>
      ) : (
        <div className="more-head" style={{ ...rowStyle, lineHeight: 1 }}>
          <span className="block-value" style={{ ...monoStyle, color: "var(--text-primary)", fontSize: "0.95rem" }}>
            {score.player}-{score.cpu}
          </span>
          <span style={{ ...labelStyle, color: status === "Playing" ? "var(--accent-cyan)" : "var(--text-muted)" }}>{status}</span>
          <span className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.68rem" }}>
            HI {highScore}
          </span>
        </div>
      )}

      <div
        ref={stageRef}
        aria-label="Mini Ping Pong playfield"
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        role="img"
        style={stageStyle}
      >
        <canvas ref={canvasRef} style={{ display: "block", height: "100%", width: "100%" }} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button onClick={startGame} style={buildButtonStyle(status === "Playing")} type="button">
          Start
        </button>
        <button disabled={status !== "Playing"} onClick={pauseGame} style={buildButtonStyle(status === "Paused", status !== "Playing")} type="button">
          Pause
        </button>
        <button onClick={resetGame} style={buildButtonStyle(false)} type="button">
          Reset
        </button>
      </div>

      {size === "L" && (
        <>
          <div aria-label="Difficulty" style={{ display: "flex", gap: 6, minWidth: 0 }}>
            {DIFFICULTIES.map((option) => (
              <button
                key={option}
                onClick={() => changeDifficulty(option)}
                style={{ ...buildButtonStyle(difficulty === option), flex: "1 1 0", minWidth: 0 }}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, overflow: "hidden" }}>
            <div className="more-head" style={{ ...labelStyle, color: "var(--text-primary)" }}>
              recent round history
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, overflowY: "auto" }}>
              {history.length === 0 ? (
                <div className="more-row" style={{ ...rowStyle, color: "var(--text-muted)" }}>
                  <span style={labelStyle}>No rounds yet</span>
                  <span className="more-meta" style={monoStyle}>
                    Ready
                  </span>
                </div>
              ) : (
                history.map((item) => (
                  <div className="more-row" key={item.id} style={rowStyle}>
                    <span style={{ ...labelStyle, color: item.result === "You Win" ? "var(--accent-orange)" : "var(--accent-cyan)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.result}
                    </span>
                    <span className="more-meta" style={{ ...monoStyle, color: "var(--text-primary)" }}>
                      {item.player}-{item.cpu}
                    </span>
                    <span className="more-meta" style={{ ...labelStyle, color: "var(--text-muted)" }}>
                      {item.difficulty}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
