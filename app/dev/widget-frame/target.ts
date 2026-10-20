// Widget under test for /dev/widget-frame. The Widget Creator's verify step
// (lib/widget-creator/verifyWidget.ts) points this at the widget it is
// checking, then writes this stub back. Keep it a stub in git.
import type { VerifyTarget } from "./types";

export const VERIFY_TARGET: VerifyTarget | null = null;
