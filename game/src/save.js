// save.js — Port Solace progress in localStorage: cash, story progress, position, stats.
// Deliberately tiny and defensive: a corrupt or missing save simply reads as "no save".

import { GAME } from './config.js';

const KEY = GAME.saveKey;

export function hasSave() {
  try { return !!window.localStorage.getItem(KEY); } catch { return false; }
}

export function writeSave(state) {
  const data = {
    cash: Math.round(state.cash),
    jobIndex: state.jobIndex,
    jobDone: !!state.jobDone,
    x: +state.x.toFixed(2),
    z: +state.z.toFixed(2),
    heading: +state.heading.toFixed(3),
    jobsCompleted: state.jobsCompleted || 0,
    faresDone: state.faresDone || 0,
    savedAt: Date.now(),
  };
  try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode etc. */ }
  return data;
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.jobIndex !== 'number') return null;
    return data;
  } catch { return null; }
}

export function clearSave() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}
