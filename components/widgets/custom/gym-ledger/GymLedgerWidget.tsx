"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useWidget } from "@/components/framework/WidgetContext";
import { canvasScopedKey, DEFAULT_CANVAS_ID, getActiveCanvasId, subscribeCanvases } from "@/lib/canvases";

type WeightUnit = "lb" | "kg";

type Targets = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  water: number;
  weeklyWorkoutGoal: number;
  weightUnit: WeightUnit;
  preferredSplit: string;
};

type ExerciseDraft = {
  id: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
  rpe: string;
  isPr: boolean;
};

type WorkoutDraft = {
  date: string;
  split: string;
  exercises: ExerciseDraft[];
  notes: string;
  skippedMuscles: string[];
};

type ExerciseEntry = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  isPr: boolean;
};

type SavedWorkout = {
  id: string;
  date: string;
  split: string;
  exercises: ExerciseEntry[];
  notes: string;
  prs: string[];
  skippedMuscles: string[];
  createdAt: string;
};

type MealDraft = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  notes: string;
};

type SavedMeal = {
  id: string;
  date: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  notes: string;
  createdAt: string;
};

type WeightEntry = {
  id: string;
  date: string;
  weight: number;
};

type LedgerState = {
  workouts: SavedWorkout[];
  meals: SavedMeal[];
  waterByDate: Record<string, number>;
  targets: Targets;
  weights: WeightEntry[];
};

type Suggestion = {
  label: string;
  detail: string;
};

type Summary = {
  adherence: number;
  hasTargets: boolean;
  macroTotals: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  proteinLeft: number;
  waterToday: number;
  waterPct: number;
  weeklySets: number;
  weeklyWeight: number;
  weeklyWorkouts: number;
  streak: number;
  suggestions: Suggestion[];
  prHistory: Array<{ date: string; name: string; weight: number | null }>;
  weightTrend: { current: number; delta: number } | null;
  todayMeals: SavedMeal[];
  todayWorkouts: SavedWorkout[];
};

const STORAGE_KEY = "gym-ledger-v1";
const WATER_STEP = 250;

const SPLITS = ["push", "pull", "legs", "upper", "lower", "full body", "rest"];
const MUSCLES = ["chest", "back", "legs", "shoulders", "arms", "core", "cardio"];

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: 0,
  textTransform: "uppercase",
};
const panelStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 14,
  boxShadow: "2px 2px 0 var(--shadow)",
  padding: 8,
};
const buttonStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.64rem",
  lineHeight: 1,
  minHeight: 26,
  padding: "5px 8px",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const mutedButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "var(--bg-nested)",
  boxShadow: "1px 1px 0 var(--shadow)",
};
const inputBaseStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  color: "var(--text-primary)",
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: "0.72rem",
  minHeight: 26,
  minWidth: 0,
  padding: "4px 7px",
  width: "100%",
};
const selectStyle: CSSProperties = {
  ...inputBaseStyle,
  fontFamily: "var(--font-dot-gothic), monospace",
  textTransform: "uppercase",
};
const tinyGridStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
};

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(key: string, offset: number) {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return dateKey(date);
}

function formatShortDate(key: string) {
  const [, month, day] = key.split("-");
  return `${month}/${day}`;
}

function numberSetting(settings: Record<string, unknown>, key: string, fallback: number) {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringSetting(settings: Record<string, unknown>, key: string, fallback: string) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function targetsFromSettings(settings: Record<string, unknown>): Targets {
  const unit = stringSetting(settings, "weightUnit", "lb");
  return {
    calories: numberSetting(settings, "targetCalories", 2400),
    protein: numberSetting(settings, "targetProtein", 160),
    carbs: numberSetting(settings, "targetCarbs", 250),
    fats: numberSetting(settings, "targetFats", 70),
    water: numberSetting(settings, "targetWater", 2500),
    weeklyWorkoutGoal: numberSetting(settings, "weeklyWorkoutGoal", 4),
    weightUnit: unit === "kg" ? "kg" : "lb",
    preferredSplit: stringSetting(settings, "preferredSplit", "push-pull-legs"),
  };
}

function createExerciseDraft(): ExerciseDraft {
  return { id: makeId(), name: "", sets: "", reps: "", weight: "", rpe: "", isPr: false };
}

function createWorkoutDraft(targets: Targets, today = dateKey()): WorkoutDraft {
  return {
    date: today,
    split: targets.preferredSplit === "push-pull-legs" ? "push" : targets.preferredSplit,
    exercises: [createExerciseDraft()],
    notes: "",
    skippedMuscles: [],
  };
}

function createMealDraft(): MealDraft {
  return { name: "", calories: "", protein: "", carbs: "", fats: "", notes: "" };
}

function emptyLedger(targets: Targets): LedgerState {
  return { workouts: [], meals: [], waterByDate: {}, targets, weights: [] };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cleanNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanTargets(raw: unknown, defaults: Targets): Targets {
  const record = asRecord(raw) ?? {};
  const unit = record.weightUnit === "kg" ? "kg" : record.weightUnit === "lb" ? "lb" : defaults.weightUnit;
  return {
    calories: cleanNumber(record.calories, defaults.calories),
    protein: cleanNumber(record.protein, defaults.protein),
    carbs: cleanNumber(record.carbs, defaults.carbs),
    fats: cleanNumber(record.fats, defaults.fats),
    water: cleanNumber(record.water, defaults.water),
    weeklyWorkoutGoal: cleanNumber(record.weeklyWorkoutGoal, defaults.weeklyWorkoutGoal),
    weightUnit: unit,
    preferredSplit: typeof record.preferredSplit === "string" ? record.preferredSplit : defaults.preferredSplit,
  };
}

function mergeLedger(raw: unknown, defaults: Targets): LedgerState {
  const record = asRecord(raw);
  if (!record) return emptyLedger(defaults);
  return {
    workouts: Array.isArray(record.workouts) ? (record.workouts as SavedWorkout[]) : [],
    meals: Array.isArray(record.meals) ? (record.meals as SavedMeal[]) : [],
    waterByDate: (asRecord(record.waterByDate) as Record<string, number> | null) ?? {},
    targets: cleanTargets(record.targets, defaults),
    weights: Array.isArray(record.weights) ? (record.weights as WeightEntry[]) : [],
  };
}

function parseDraftNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericError(value: string, label: string, options: { required?: boolean; integer?: boolean; min?: number; max?: number } = {}) {
  if (!value.trim()) return options.required ? `${label} required` : "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `${label} must be a number`;
  if (options.integer && !Number.isInteger(parsed)) return `${label} must be whole`;
  if (options.min !== undefined && parsed < options.min) return `${label} too low`;
  if (options.max !== undefined && parsed > options.max) return `${label} too high`;
  return "";
}

function validateWorkoutDraft(draft: WorkoutDraft) {
  const workoutErrors: string[] = [];
  if (!draft.date) workoutErrors.push("date required");
  if (!draft.split.trim()) workoutErrors.push("split required");
  const namedExercises = draft.exercises.filter((exercise) => exercise.name.trim());
  if (namedExercises.length === 0) workoutErrors.push("add exercise name");

  const exerciseErrors = draft.exercises.map((exercise) => {
    if (!exercise.name.trim()) return "";
    return [
      numericError(exercise.sets, "sets", { required: true, integer: true, min: 1 }),
      numericError(exercise.reps, "reps", { required: true, integer: true, min: 1 }),
      numericError(exercise.weight, "weight", { min: 0 }),
      numericError(exercise.rpe, "RPE", { min: 0, max: 10 }),
    ]
      .filter(Boolean)
      .join(", ");
  });

  return {
    exerciseErrors,
    ok: workoutErrors.length === 0 && exerciseErrors.every((error) => !error),
    workoutErrors,
  };
}

function validateMealDraft(draft: MealDraft) {
  const errors = [
    draft.name.trim() ? "" : "meal name required",
    numericError(draft.calories, "calories", { required: true, min: 0 }),
    numericError(draft.protein, "protein", { required: true, min: 0 }),
    numericError(draft.carbs, "carbs", { required: true, min: 0 }),
    numericError(draft.fats, "fats", { required: true, min: 0 }),
  ].filter(Boolean);
  return { errors, ok: errors.length === 0 };
}

function bestForExercise(workouts: SavedWorkout[], name: string) {
  const normalized = name.trim().toLowerCase();
  let best: number | null = null;
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (exercise.name.trim().toLowerCase() !== normalized || exercise.weight === null) continue;
      best = best === null ? exercise.weight : Math.max(best, exercise.weight);
    }
  }
  return best;
}

function activityStreak(workouts: SavedWorkout[], meals: SavedMeal[], today: string) {
  const days = new Set([...workouts.map((workout) => workout.date), ...meals.map((meal) => meal.date)]);
  let streak = 0;
  let cursor = today;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function summarize(ledger: LedgerState, today: string): Summary {
  const todayMeals = ledger.meals.filter((meal) => meal.date === today);
  const todayWorkouts = ledger.workouts.filter((workout) => workout.date === today);
  const weekStart = addDays(today, -6);
  const weekWorkouts = ledger.workouts.filter((workout) => workout.date >= weekStart && workout.date <= today);
  const macroTotals = todayMeals.reduce(
    (total, meal) => ({
      calories: total.calories + meal.calories,
      protein: total.protein + meal.protein,
      carbs: total.carbs + meal.carbs,
      fats: total.fats + meal.fats,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );

  const weeklySets = weekWorkouts.reduce(
    (total, workout) => total + workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0),
    0,
  );
  const weeklyWeight = weekWorkouts.reduce(
    (total, workout) =>
      total +
      workout.exercises.reduce((sum, exercise) => {
        if (exercise.weight === null) return sum;
        return sum + exercise.sets * exercise.reps * exercise.weight;
      }, 0),
    0,
  );

  const waterToday = cleanNumber(ledger.waterByDate[today], 0);
  const targetParts = [
    ledger.targets.calories,
    ledger.targets.protein,
    ledger.targets.carbs,
    ledger.targets.fats,
    ledger.targets.water,
    ledger.targets.weeklyWorkoutGoal,
  ];
  const hasTargets = targetParts.some((target) => target > 0);
  const macroRatios = [
    ledger.targets.calories > 0 ? Math.min(macroTotals.calories / ledger.targets.calories, 1) : null,
    ledger.targets.protein > 0 ? Math.min(macroTotals.protein / ledger.targets.protein, 1) : null,
    ledger.targets.carbs > 0 ? Math.min(macroTotals.carbs / ledger.targets.carbs, 1) : null,
    ledger.targets.fats > 0 ? Math.min(macroTotals.fats / ledger.targets.fats, 1) : null,
  ].filter((value): value is number => value !== null);
  const macroScore = macroRatios.length ? macroRatios.reduce((sum, value) => sum + value, 0) / macroRatios.length : 0;
  const workoutScore = ledger.targets.weeklyWorkoutGoal > 0 ? Math.min(weekWorkouts.length / ledger.targets.weeklyWorkoutGoal, 1) : 0;
  const waterScore = ledger.targets.water > 0 ? Math.min(waterToday / ledger.targets.water, 1) : 0;
  const scoreParts = hasTargets ? [macroScore, workoutScore, waterScore] : [0];
  const adherence = Math.round((scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length) * 100);

  const prHistory = ledger.workouts
    .flatMap((workout) =>
      workout.exercises
        .filter((exercise) => exercise.isPr)
        .map((exercise) => ({ date: workout.date, name: exercise.name, weight: exercise.weight })),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const weights = [...ledger.weights].sort((a, b) => a.date.localeCompare(b.date));
  const firstWeight = weights[0];
  const lastWeight = weights[weights.length - 1];
  const weightTrend = firstWeight && lastWeight && weights.length > 1 ? { current: lastWeight.weight, delta: lastWeight.weight - firstWeight.weight } : null;

  const proteinLeft = Math.max(0, ledger.targets.protein - macroTotals.protein);
  const waterPct = ledger.targets.water > 0 ? Math.min(100, Math.round((waterToday / ledger.targets.water) * 100)) : 0;
  const skipped = new Set(weekWorkouts.flatMap((workout) => workout.skippedMuscles));
  const trainedLegs = weekWorkouts.some((workout) => workout.split.toLowerCase().includes("leg"));
  const lastSevenPrs = prHistory.filter((pr) => pr.date >= weekStart);
  const suggestions: Suggestion[] = [];

  if (ledger.targets.protein > 0 && proteinLeft >= 25) {
    suggestions.push({ label: "add protein", detail: `${Math.round(proteinLeft)}g left today` });
  }
  if ((skipped.has("legs") || !trainedLegs) && weekWorkouts.length > 0) {
    suggestions.push({ label: "hit legs next", detail: "recent history is light on legs" });
  }
  if (weekWorkouts.length >= ledger.targets.weeklyWorkoutGoal && ledger.targets.weeklyWorkoutGoal > 0) {
    suggestions.push({ label: "take a rest day", detail: "weekly workout goal is covered" });
  }
  if (ledger.targets.water > 0 && waterToday < ledger.targets.water * 0.65) {
    suggestions.push({ label: "drink water", detail: `${Math.max(0, ledger.targets.water - waterToday)}ml left` });
  }
  if (todayMeals.length === 0 || (ledger.targets.calories > 0 && macroTotals.calories < ledger.targets.calories * 0.45)) {
    suggestions.push({ label: "prep a meal", detail: "macro log is behind today" });
  }
  if (weekWorkouts.length >= 2 && lastSevenPrs.length === 0) {
    suggestions.push({ label: "increase weight", detail: "try a small jump on a clean set" });
  }
  if (suggestions.length === 0) {
    suggestions.push({ label: "log next set", detail: "keep the ledger current" });
  }

  return {
    adherence,
    hasTargets,
    macroTotals,
    proteinLeft,
    prHistory,
    streak: activityStreak(ledger.workouts, ledger.meals, today),
    suggestions,
    todayMeals,
    todayWorkouts,
    waterPct,
    waterToday,
    weeklySets,
    weeklyWeight,
    weeklyWorkouts: weekWorkouts.length,
    weightTrend,
  };
}

function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value)}`;
}

function fieldStyle(error?: boolean): CSSProperties {
  return {
    ...inputBaseStyle,
    borderColor: error ? "var(--accent-orange)" : "var(--border)",
  };
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
      <div className="more-head" style={{ alignItems: "center", display: "flex", gap: 6, justifyContent: "space-between" }}>
        <span>{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "accent" | "teal" }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="block-label" style={labelStyle}>
        {label}
      </div>
      <div className={`block-value ${accent ?? ""}`} style={{ ...monoStyle, fontSize: "0.86rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: 12, height: 8, overflow: "hidden" }}>
      <div style={{ background: "var(--accent-cyan)", height: "100%", width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function GymLedgerWidget() {
  const { hoverExpanded, settings, size } = useWidget();
  const canvasId = useSyncExternalStore(subscribeCanvases, getActiveCanvasId, () => DEFAULT_CANVAS_ID);
  const settingsBag = settings as Record<string, unknown>;
  const defaultTargets = useMemo(
    () => targetsFromSettings(settingsBag),
    [
      settingsBag.preferredSplit,
      settingsBag.targetCalories,
      settingsBag.targetCarbs,
      settingsBag.targetFats,
      settingsBag.targetProtein,
      settingsBag.targetWater,
      settingsBag.weeklyWorkoutGoal,
      settingsBag.weightUnit,
    ],
  );
  const storageKey = useMemo(() => canvasScopedKey(STORAGE_KEY, canvasId), [canvasId]);
  const today = useMemo(() => dateKey(), []);

  const [ledger, setLedger] = useState<LedgerState>(() => emptyLedger(defaultTargets));
  const [loadedKey, setLoadedKey] = useState("");
  const [workoutDraft, setWorkoutDraft] = useState<WorkoutDraft>(() => createWorkoutDraft(defaultTargets, today));
  const [mealDraft, setMealDraft] = useState<MealDraft>(() => createMealDraft());
  const [skipDraft, setSkipDraft] = useState("legs");
  const [workoutMessage, setWorkoutMessage] = useState("");
  const [mealMessage, setMealMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weightDraft, setWeightDraft] = useState("");

  useEffect(() => {
    let next = emptyLedger(defaultTargets);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) next = mergeLedger(JSON.parse(raw), defaultTargets);
    } catch {
      next = emptyLedger(defaultTargets);
    }
    setLedger(next);
    setWorkoutDraft((draft) => ({ ...draft, split: draft.split || next.targets.preferredSplit }));
    setLoadedKey(storageKey);
  }, [defaultTargets, storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(ledger));
    } catch {
      // Keep editing in memory if storage is unavailable.
    }
  }, [ledger, loadedKey, storageKey]);

  const summary = useMemo(() => summarize(ledger, today), [ledger, today]);
  const workoutValidation = useMemo(() => validateWorkoutDraft(workoutDraft), [workoutDraft]);
  const mealValidation = useMemo(() => validateMealDraft(mealDraft), [mealDraft]);
  const effectiveSize = hoverExpanded ? "L" : size;

  function updateExercise(id: string, field: keyof Omit<ExerciseDraft, "id">, value: string | boolean) {
    setWorkoutDraft((draft) => ({
      ...draft,
      exercises: draft.exercises.map((exercise) => (exercise.id === id ? { ...exercise, [field]: value } : exercise)),
    }));
  }

  function addExercise() {
    setWorkoutDraft((draft) => ({ ...draft, exercises: [...draft.exercises, createExerciseDraft()] }));
    setWorkoutMessage("");
  }

  function startWorkout() {
    setWorkoutDraft(createWorkoutDraft(ledger.targets, today));
    setWorkoutMessage("new workout draft");
  }

  function markPr() {
    const target = [...workoutDraft.exercises].reverse().find((exercise) => exercise.name.trim());
    if (!target) {
      setWorkoutMessage("add exercise before marking PR");
      return;
    }
    updateExercise(target.id, "isPr", true);
    setWorkoutMessage("PR marked");
  }

  function skipMuscle() {
    setWorkoutDraft((draft) => ({
      ...draft,
      skippedMuscles: draft.skippedMuscles.includes(skipDraft) ? draft.skippedMuscles : [...draft.skippedMuscles, skipDraft],
    }));
    setWorkoutMessage(`${skipDraft} skipped`);
  }

  function clearDraft() {
    setWorkoutDraft(createWorkoutDraft(ledger.targets, today));
    setWorkoutMessage("draft cleared");
  }

  function saveWorkout() {
    const validation = validateWorkoutDraft(workoutDraft);
    if (!validation.ok) {
      setWorkoutMessage([...validation.workoutErrors, ...validation.exerciseErrors.filter(Boolean)][0] ?? "check workout");
      return;
    }

    const exercises = workoutDraft.exercises
      .filter((exercise) => exercise.name.trim())
      .map((exercise) => {
        const weight = parseDraftNumber(exercise.weight);
        const previousBest = bestForExercise(ledger.workouts, exercise.name);
        const autoPr = weight !== null && (previousBest === null || weight > previousBest);
        return {
          id: makeId(),
          isPr: exercise.isPr || autoPr,
          name: exercise.name.trim(),
          reps: parseDraftNumber(exercise.reps) ?? 0,
          rpe: parseDraftNumber(exercise.rpe),
          sets: parseDraftNumber(exercise.sets) ?? 0,
          weight,
        };
      });
    const workout: SavedWorkout = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      date: workoutDraft.date,
      exercises,
      notes: workoutDraft.notes.trim(),
      prs: exercises.filter((exercise) => exercise.isPr).map((exercise) => exercise.name),
      skippedMuscles: workoutDraft.skippedMuscles,
      split: workoutDraft.split.trim(),
    };

    setLedger((current) => ({ ...current, workouts: [workout, ...current.workouts].slice(0, 80) }));
    setWorkoutDraft(createWorkoutDraft(ledger.targets, today));
    setWorkoutMessage("workout saved");
  }

  function startMeal() {
    setMealDraft(createMealDraft());
    setMealMessage("meal draft ready");
  }

  function saveMeal() {
    const validation = validateMealDraft(mealDraft);
    if (!validation.ok) {
      setMealMessage(validation.errors[0] ?? "check meal");
      return;
    }
    const meal: SavedMeal = {
      id: makeId(),
      calories: parseDraftNumber(mealDraft.calories) ?? 0,
      carbs: parseDraftNumber(mealDraft.carbs) ?? 0,
      createdAt: new Date().toISOString(),
      date: today,
      fats: parseDraftNumber(mealDraft.fats) ?? 0,
      name: mealDraft.name.trim(),
      notes: mealDraft.notes.trim(),
      protein: parseDraftNumber(mealDraft.protein) ?? 0,
    };
    setLedger((current) => ({ ...current, meals: [meal, ...current.meals].slice(0, 120) }));
    setMealDraft(createMealDraft());
    setMealMessage("meal saved");
  }

  function addWater() {
    setLedger((current) => ({
      ...current,
      waterByDate: { ...current.waterByDate, [today]: cleanNumber(current.waterByDate[today], 0) + WATER_STEP },
    }));
  }

  function resetToday() {
    setLedger((current) => {
      const waterByDate = { ...current.waterByDate, [today]: 0 };
      return { ...current, meals: current.meals.filter((meal) => meal.date !== today), waterByDate };
    });
    setMealMessage("today reset");
  }

  function updateTarget(key: keyof Omit<Targets, "weightUnit" | "preferredSplit">, value: string) {
    const next = Number(value);
    setLedger((current) => ({
      ...current,
      targets: { ...current.targets, [key]: Number.isFinite(next) ? Math.max(0, next) : 0 },
    }));
  }

  function saveWeight() {
    const weight = parseDraftNumber(weightDraft);
    if (weight === null || weight <= 0) {
      setMealMessage("body weight must be positive");
      return;
    }
    setLedger((current) => ({
      ...current,
      weights: [{ id: makeId(), date: today, weight }, ...current.weights.filter((entry) => entry.date !== today)].slice(0, 90),
    }));
    setWeightDraft("");
  }

  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  };

  const header = (
    <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between", minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div className="block-label" style={labelStyle}>
          Gym Ledger
        </div>
        <div className="block-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summary.hasTargets ? `${summary.weeklyWorkouts}/${ledger.targets.weeklyWorkoutGoal} workouts this week` : "no targets set"}
        </div>
      </div>
      <div style={{ alignItems: "end", display: "grid", gap: 2, justifyItems: "end" }}>
        <div className="block-value accent" style={{ ...monoStyle, fontSize: "1.22rem", lineHeight: 1 }}>
          {summary.adherence}%
        </div>
        <div className="block-sub">{summary.streak} day streak</div>
      </div>
    </div>
  );

  if (effectiveSize === "S") {
    return (
      <div style={{ ...rootStyle, justifyContent: "space-between" }}>
        <div className="block-label" style={labelStyle}>
          Gym Ledger
        </div>
        <div className="block-value accent" style={{ ...monoStyle, fontSize: "2rem", lineHeight: 1 }}>
          {summary.adherence}%
        </div>
        <div className="block-sub" style={{ ...monoStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          protein left today: {formatCompact(summary.proteinLeft)}g
        </div>
        <div className="block-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summary.suggestions[0].label}: {summary.suggestions[0].detail}
        </div>
        <div style={{ ...labelStyle, color: "var(--accent-cyan)" }}>{summary.streak} day streak</div>
      </div>
    );
  }

  if (effectiveSize === "M") {
    const firstExercise = workoutDraft.exercises[0];
    const firstExerciseError = workoutValidation.exerciseErrors[0];
    return (
      <div style={rootStyle}>
        {header}
        <div style={{ display: "grid", gap: 6, minHeight: 0, overflowY: "auto" }}>
          <Section
            action={
              <div style={{ display: "flex", gap: 5 }}>
                <button onClick={startWorkout} style={buttonStyle} type="button">
                  + Workout
                </button>
                <button onClick={saveWorkout} style={buttonStyle} type="button">
                  Save Workout
                </button>
              </div>
            }
            title="Workout Log"
          >
            <div style={{ display: "grid", gap: 5, gridTemplateColumns: "0.8fr 1.2fr 0.48fr 0.48fr 0.62fr", minWidth: 0 }}>
              <select
                aria-label="split"
                onChange={(event) => setWorkoutDraft((draft) => ({ ...draft, split: event.currentTarget.value }))}
                style={selectStyle}
                value={workoutDraft.split}
              >
                {SPLITS.map((split) => (
                  <option key={split} value={split}>
                    {split}
                  </option>
                ))}
              </select>
              <input
                aria-label="exercise"
                onChange={(event) => updateExercise(firstExercise.id, "name", event.currentTarget.value)}
                placeholder="exercise"
                style={fieldStyle(Boolean(firstExerciseError))}
                value={firstExercise.name}
              />
              <input
                aria-label="sets"
                inputMode="numeric"
                onChange={(event) => updateExercise(firstExercise.id, "sets", event.currentTarget.value)}
                placeholder="set"
                style={fieldStyle(Boolean(firstExerciseError))}
                value={firstExercise.sets}
              />
              <input
                aria-label="reps"
                inputMode="numeric"
                onChange={(event) => updateExercise(firstExercise.id, "reps", event.currentTarget.value)}
                placeholder="rep"
                style={fieldStyle(Boolean(firstExerciseError))}
                value={firstExercise.reps}
              />
              <input
                aria-label="weight"
                inputMode="decimal"
                onChange={(event) => updateExercise(firstExercise.id, "weight", event.currentTarget.value)}
                placeholder={ledger.targets.weightUnit}
                style={fieldStyle(Boolean(firstExerciseError))}
                value={firstExercise.weight}
              />
            </div>
            {firstExerciseError && <div style={{ ...labelStyle, color: "var(--accent-orange)" }}>{firstExerciseError}</div>}
          </Section>

          <Section
            action={
              <div style={{ display: "flex", gap: 5 }}>
                <button onClick={startMeal} style={buttonStyle} type="button">
                  + Meal
                </button>
                <button onClick={addWater} style={buttonStyle} type="button">
                  + Water
                </button>
              </div>
            }
            title="Meals + Macros"
          >
            <div style={tinyGridStyle}>
              <Metric label="cal" value={`${formatCompact(summary.macroTotals.calories)}/${formatCompact(ledger.targets.calories)}`} />
              <Metric label="protein" value={`${formatCompact(summary.macroTotals.protein)}g`} accent="teal" />
              <Metric label="carbs" value={`${formatCompact(summary.macroTotals.carbs)}g`} />
              <Metric label="fats" value={`${formatCompact(summary.macroTotals.fats)}g`} />
            </div>
            <div className="more-row" style={{ alignItems: "center", display: "grid", gap: 6, gridTemplateColumns: "1fr auto" }}>
              <div style={{ minWidth: 0 }}>
                <div className="block-sub">water {summary.waterToday}ml / {ledger.targets.water}ml</div>
                <ProgressBar value={summary.waterPct} />
              </div>
              <div className="block-sub" style={{ ...monoStyle }}>
                protein left {formatCompact(summary.proteinLeft)}g
              </div>
            </div>
          </Section>

          <Section title="Smart Suggestions">
            <div className="block-value teal" style={{ ...monoStyle, fontSize: "0.86rem" }}>
              {summary.suggestions[0].label}
            </div>
            {summary.suggestions.slice(1, 3).map((suggestion) => (
              <div className="block-sub" key={suggestion.label}>
                {suggestion.label}: {suggestion.detail}
              </div>
            ))}
          </Section>
        </div>
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      <div style={{ alignItems: "center", display: "grid", gap: 8, gridTemplateColumns: "1.2fr 0.8fr 0.8fr", minWidth: 0 }}>
        {header}
        <Metric accent="teal" label="weekly volume" value={`${summary.weeklySets} sets`} />
        <Metric label="lifted" value={summary.weeklyWeight > 0 ? `${formatCompact(summary.weeklyWeight)} ${ledger.targets.weightUnit}` : "no weight"} />
      </div>

      <div style={{ display: "grid", gap: 8, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
        <Section
          action={
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "end" }}>
              <button onClick={startWorkout} style={buttonStyle} type="button">
                + Workout
              </button>
              <button onClick={addExercise} style={buttonStyle} type="button">
                + Exercise
              </button>
              <button onClick={saveWorkout} style={buttonStyle} type="button">
                Save Workout
              </button>
              <button onClick={markPr} style={mutedButtonStyle} type="button">
                Mark PR
              </button>
              <button onClick={skipMuscle} style={mutedButtonStyle} type="button">
                Skip Muscle
              </button>
              <button onClick={clearDraft} style={mutedButtonStyle} type="button">
                Clear Draft
              </button>
            </div>
          }
          title="Workout Log"
        >
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "0.78fr 0.78fr 0.72fr", minWidth: 0 }}>
            <input
              aria-label="date"
              onChange={(event) => setWorkoutDraft((draft) => ({ ...draft, date: event.currentTarget.value }))}
              style={fieldStyle(!workoutDraft.date)}
              type="date"
              value={workoutDraft.date}
            />
            <select
              aria-label="split"
              onChange={(event) => setWorkoutDraft((draft) => ({ ...draft, split: event.currentTarget.value }))}
              style={selectStyle}
              value={workoutDraft.split}
            >
              {SPLITS.map((split) => (
                <option key={split} value={split}>
                  {split}
                </option>
              ))}
            </select>
            <select aria-label="skipped muscle group" onChange={(event) => setSkipDraft(event.currentTarget.value)} style={selectStyle} value={skipDraft}>
              {MUSCLES.map((muscle) => (
                <option key={muscle} value={muscle}>
                  {muscle}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            {workoutDraft.exercises.map((exercise, index) => {
              const error = workoutValidation.exerciseErrors[index];
              return (
                <div key={exercise.id} style={{ display: "grid", gap: 5, gridTemplateColumns: "1.4fr 0.45fr 0.45fr 0.55fr 0.45fr auto", minWidth: 0 }}>
                  <input
                    aria-label="exercise name"
                    onChange={(event) => updateExercise(exercise.id, "name", event.currentTarget.value)}
                    placeholder="exercise"
                    style={fieldStyle(Boolean(error))}
                    value={exercise.name}
                  />
                  <input
                    aria-label="sets"
                    inputMode="numeric"
                    onChange={(event) => updateExercise(exercise.id, "sets", event.currentTarget.value)}
                    placeholder="sets"
                    style={fieldStyle(Boolean(error))}
                    value={exercise.sets}
                  />
                  <input
                    aria-label="reps"
                    inputMode="numeric"
                    onChange={(event) => updateExercise(exercise.id, "reps", event.currentTarget.value)}
                    placeholder="reps"
                    style={fieldStyle(Boolean(error))}
                    value={exercise.reps}
                  />
                  <input
                    aria-label="weight"
                    inputMode="decimal"
                    onChange={(event) => updateExercise(exercise.id, "weight", event.currentTarget.value)}
                    placeholder={ledger.targets.weightUnit}
                    style={fieldStyle(Boolean(error))}
                    value={exercise.weight}
                  />
                  <input
                    aria-label="RPE"
                    inputMode="decimal"
                    onChange={(event) => updateExercise(exercise.id, "rpe", event.currentTarget.value)}
                    placeholder="RPE"
                    style={fieldStyle(Boolean(error))}
                    value={exercise.rpe}
                  />
                  <button onClick={() => updateExercise(exercise.id, "isPr", !exercise.isPr)} style={mutedButtonStyle} type="button">
                    {exercise.isPr ? "PR" : "mark"}
                  </button>
                  {error && <div style={{ ...labelStyle, color: "var(--accent-orange)", gridColumn: "1 / -1" }}>{error}</div>}
                </div>
              );
            })}
          </div>

          <textarea
            aria-label="workout notes"
            onChange={(event) => setWorkoutDraft((draft) => ({ ...draft, notes: event.currentTarget.value }))}
            placeholder="notes"
            rows={2}
            style={{ ...inputBaseStyle, minHeight: 44, resize: "none" }}
            value={workoutDraft.notes}
          />
          <div className="more-row" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span className="block-sub">PRs: {workoutDraft.exercises.filter((exercise) => exercise.isPr).map((exercise) => exercise.name || "draft").join(", ") || "no PRs yet"}</span>
            <span className="block-sub">skipped muscle groups: {workoutDraft.skippedMuscles.join(", ") || "none"}</span>
            {workoutMessage && <span style={{ ...labelStyle, color: "var(--accent-cyan)" }}>{workoutMessage}</span>}
          </div>
          {ledger.workouts.length === 0 && <div className="block-sub">no workouts yet</div>}
        </Section>

        <Section
          action={
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "end" }}>
              <button onClick={startMeal} style={buttonStyle} type="button">
                + Meal
              </button>
              <button onClick={saveMeal} style={buttonStyle} type="button">
                Save Meal
              </button>
              <button onClick={addWater} style={buttonStyle} type="button">
                + Water
              </button>
              <button onClick={resetToday} style={mutedButtonStyle} type="button">
                Reset Today
              </button>
            </div>
          }
          title="Meals + Macros"
        >
          <div style={{ display: "grid", gap: 5, gridTemplateColumns: "1.3fr repeat(4, 0.55fr)", minWidth: 0 }}>
            <input
              aria-label="meal name"
              onChange={(event) => setMealDraft((draft) => ({ ...draft, name: event.currentTarget.value }))}
              placeholder="meal"
              style={fieldStyle(!mealDraft.name.trim() && mealMessage.includes("meal"))}
              value={mealDraft.name}
            />
            <input
              aria-label="calories"
              inputMode="numeric"
              onChange={(event) => setMealDraft((draft) => ({ ...draft, calories: event.currentTarget.value }))}
              placeholder="cal"
              style={fieldStyle(Boolean(numericError(mealDraft.calories, "calories", { required: true, min: 0 })))}
              value={mealDraft.calories}
            />
            <input
              aria-label="protein"
              inputMode="numeric"
              onChange={(event) => setMealDraft((draft) => ({ ...draft, protein: event.currentTarget.value }))}
              placeholder="pro"
              style={fieldStyle(Boolean(numericError(mealDraft.protein, "protein", { required: true, min: 0 })))}
              value={mealDraft.protein}
            />
            <input
              aria-label="carbs"
              inputMode="numeric"
              onChange={(event) => setMealDraft((draft) => ({ ...draft, carbs: event.currentTarget.value }))}
              placeholder="carb"
              style={fieldStyle(Boolean(numericError(mealDraft.carbs, "carbs", { required: true, min: 0 })))}
              value={mealDraft.carbs}
            />
            <input
              aria-label="fats"
              inputMode="numeric"
              onChange={(event) => setMealDraft((draft) => ({ ...draft, fats: event.currentTarget.value }))}
              placeholder="fat"
              style={fieldStyle(Boolean(numericError(mealDraft.fats, "fats", { required: true, min: 0 })))}
              value={mealDraft.fats}
            />
          </div>
          <textarea
            aria-label="meal notes"
            onChange={(event) => setMealDraft((draft) => ({ ...draft, notes: event.currentTarget.value }))}
            placeholder="meal notes"
            rows={2}
            style={{ ...inputBaseStyle, minHeight: 42, resize: "none" }}
            value={mealDraft.notes}
          />
          <div style={tinyGridStyle}>
            <Metric label="meals" value={summary.todayMeals.length ? `${summary.todayMeals.length}` : "no meals yet"} />
            <Metric label="calories" value={`${formatCompact(summary.macroTotals.calories)}/${formatCompact(ledger.targets.calories)}`} />
            <Metric label="protein left today" value={`${formatCompact(summary.proteinLeft)}g`} accent="teal" />
            <Metric label="water" value={`${summary.waterToday}/${ledger.targets.water}ml`} />
          </div>
          <ProgressBar value={summary.waterPct} />
          {mealValidation.errors.length > 0 && mealMessage && <div style={{ ...labelStyle, color: "var(--accent-orange)" }}>{mealMessage}</div>}
        </Section>

        <Section title="Smart Suggestions">
          <div style={{ display: "grid", gap: 5, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {summary.suggestions.slice(0, 6).map((suggestion, index) => (
              <div key={suggestion.label} style={{ ...panelStyle, boxShadow: "1px 1px 0 var(--shadow)", minWidth: 0, padding: 7 }}>
                <div className={index === 0 ? "block-value teal" : "block-value"} style={{ ...monoStyle, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {suggestion.label}
                </div>
                <div className="block-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {suggestion.detail}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Progress Snapshot">
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
            <Metric label="weekly volume" value={`${summary.weeklySets} sets`} accent="teal" />
            <Metric label="lifted" value={summary.weeklyWeight > 0 ? `${formatCompact(summary.weeklyWeight)} ${ledger.targets.weightUnit}` : "no weight"} />
            <Metric label="streak" value={`${summary.streak} days`} />
            <Metric label="adherence score" value={summary.hasTargets ? `${summary.adherence}%` : "no targets set"} accent="accent" />
            <Metric
              label="body weight trend"
              value={
                summary.weightTrend
                  ? `${summary.weightTrend.current}${ledger.targets.weightUnit} ${summary.weightTrend.delta >= 0 ? "+" : ""}${Math.round(summary.weightTrend.delta * 10) / 10}`
                  : "no body weight trend yet"
              }
            />
          </div>
          <div className="more-row" style={{ display: "grid", gap: 5 }}>
            <div className="block-label" style={labelStyle}>
              PR history
            </div>
            {summary.prHistory.length === 0 ? (
              <div className="block-sub">no PRs yet</div>
            ) : (
              summary.prHistory.slice(0, 4).map((pr) => (
                <div className="more-row" key={`${pr.date}-${pr.name}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.name}</span>
                  <span className="more-meta" style={monoStyle}>
                    {formatShortDate(pr.date)} {pr.weight === null ? "PR" : `${pr.weight}${ledger.targets.weightUnit}`}
                  </span>
                </div>
              ))
            )}
          </div>
        </Section>

        <Section
          action={
            <button onClick={() => setSettingsOpen((open) => !open)} style={mutedButtonStyle} type="button">
              {settingsOpen ? "Close" : "Settings"}
            </button>
          }
          title="Settings"
        >
          {settingsOpen ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "grid", gap: 5, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                <Metric label="cal target" value={`${ledger.targets.calories}`} />
                <Metric label="protein target" value={`${ledger.targets.protein}g`} />
                <Metric label="water target" value={`${ledger.targets.water}ml`} />
                <Metric label="weekly goal" value={`${ledger.targets.weeklyWorkoutGoal}`} />
              </div>
              <div style={{ display: "grid", gap: 5, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                <input aria-label="target calories" inputMode="numeric" onChange={(event) => updateTarget("calories", event.currentTarget.value)} style={inputBaseStyle} value={ledger.targets.calories} />
                <input aria-label="target protein" inputMode="numeric" onChange={(event) => updateTarget("protein", event.currentTarget.value)} style={inputBaseStyle} value={ledger.targets.protein} />
                <input aria-label="target carbs" inputMode="numeric" onChange={(event) => updateTarget("carbs", event.currentTarget.value)} style={inputBaseStyle} value={ledger.targets.carbs} />
                <input aria-label="target fats" inputMode="numeric" onChange={(event) => updateTarget("fats", event.currentTarget.value)} style={inputBaseStyle} value={ledger.targets.fats} />
                <input aria-label="target water" inputMode="numeric" onChange={(event) => updateTarget("water", event.currentTarget.value)} style={inputBaseStyle} value={ledger.targets.water} />
                <input
                  aria-label="weekly workout goal"
                  inputMode="numeric"
                  onChange={(event) => updateTarget("weeklyWorkoutGoal", event.currentTarget.value)}
                  style={inputBaseStyle}
                  value={ledger.targets.weeklyWorkoutGoal}
                />
                <select
                  aria-label="weight unit"
                  onChange={(event) => setLedger((current) => ({ ...current, targets: { ...current.targets, weightUnit: event.currentTarget.value === "kg" ? "kg" : "lb" } }))}
                  style={selectStyle}
                  value={ledger.targets.weightUnit}
                >
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
                <select
                  aria-label="preferred split"
                  onChange={(event) => setLedger((current) => ({ ...current, targets: { ...current.targets, preferredSplit: event.currentTarget.value } }))}
                  style={selectStyle}
                  value={ledger.targets.preferredSplit}
                >
                  <option value="push-pull-legs">push-pull-legs</option>
                  <option value="upper-lower">upper-lower</option>
                  <option value="full body">full body</option>
                  <option value="bro split">bro split</option>
                  <option value="custom">custom</option>
                </select>
              </div>
              <div style={{ display: "grid", gap: 5, gridTemplateColumns: "1fr auto", minWidth: 0 }}>
                <input
                  aria-label="body weight"
                  inputMode="decimal"
                  onChange={(event) => setWeightDraft(event.currentTarget.value)}
                  placeholder={`body weight ${ledger.targets.weightUnit}`}
                  style={fieldStyle(Boolean(weightDraft && numericError(weightDraft, "body weight", { min: 0 })))}
                  value={weightDraft}
                />
                <button onClick={saveWeight} style={buttonStyle} type="button">
                  Save Weight
                </button>
              </div>
            </div>
          ) : (
            <div className="block-sub">
              targets, water, weekly goal, body weight
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
