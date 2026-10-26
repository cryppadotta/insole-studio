import { cloneParams } from "./model";
import { sameParams, type Foot, type Pair } from "./project";

export interface Snapshot {
  feet: Pair;
  linked: boolean;
}

export interface History {
  past: Snapshot[];
  present: Pair;
  linked: boolean;
  future: Snapshot[];
}

const HISTORY_LIMIT = 80;

function cloneFeet(feet: Pair): Pair {
  return { left: cloneParams(feet.left), right: cloneParams(feet.right) };
}

function snapshot(history: History): Snapshot {
  return { feet: cloneFeet(history.present), linked: history.linked };
}

function appendPast(history: History) {
  return [...history.past.slice(-(HISTORY_LIMIT - 1)), snapshot(history)];
}

export function createHistory(feet: Pair, linked: boolean): History {
  return { past: [], present: cloneFeet(feet), linked, future: [] };
}

export function editHistory(
  history: History,
  nextFeet: Pair,
  coalesce = false,
): History {
  const unchanged = (["left", "right"] as const).every((side) =>
    sameParams(history.present[side], nextFeet[side]),
  );
  if (unchanged) return history;
  return {
    past:
      coalesce && history.past.at(-1)?.linked === history.linked
        ? history.past
        : appendPast(history),
    present: cloneFeet(nextFeet),
    linked: history.linked,
    future: [],
  };
}

export function toggleHistoryLink(history: History, side: Foot): History {
  const feet = history.linked
    ? cloneFeet(history.present)
    : {
        left: cloneParams(history.present[side]),
        right: cloneParams(history.present[side]),
      };
  return {
    past: appendPast(history),
    present: feet,
    linked: !history.linked,
    future: [],
  };
}

export function undoHistory(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: cloneFeet(previous.feet),
    linked: previous.linked,
    future: [snapshot(history), ...history.future].slice(0, HISTORY_LIMIT),
  };
}

export function redoHistory(history: History): History {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: appendPast(history),
    present: cloneFeet(next.feet),
    linked: next.linked,
    future: history.future.slice(1),
  };
}
