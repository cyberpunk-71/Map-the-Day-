// Map the Day! core: clock geometry for 12h/24h circular day planning.
// Angles: 0deg = 12 o'clock (top), clockwise positive. Full circle = 360.

export const HOUR_ANGLES = {
  h12: { hours: 12, perHour: 30 },   // 360/12
  h24: { hours: 24, perHour: 15 },   // 360/24
};

/** Parse "HH:MM" or "HH:MM:SS" into minutes since midnight. */
export function timeToMinutes(timeStr) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(timeStr).trim());
  if (!m) throw new Error(`Invalid time: ${timeStr}`);
  const h = +m[1], min = +m[2], s = m[3] ? +m[3] : 0;
  if (h > 23 || min > 59 || s > 59) throw new Error(`Invalid time: ${timeStr}`);
  return h * 60 + min + s / 60;
}

/** Minutes since midnight -> "HH:MM" */
export function minutesToTime(mins, { seconds = false } = {}) {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.floor(mins % 60);
  const s = Math.floor((mins % 1) * 60);
  const pad = (n) => String(n).padStart(2, "0");
  return seconds ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
}

/** Angle in degrees (0 at top, clockwise) for given minutes + mode. */
export function minutesToAngle(mins, mode = "h12") {
  const hours = mode === "h24" ? 24 : 12;
  const dayMins = hours * 60;
  const wrapped = ((mins % dayMins) + dayMins) % dayMins;
  return (wrapped / dayMins) * 360;
}

/** Angle -> minutes for mode. */
export function angleToMinutes(angle, mode = "h12") {
  const hours = mode === "h24" ? 24 : 12;
  const dayMins = hours * 60;
  const a = ((angle % 360) + 360) % 360;
  return (a / 360) * dayMins;
}

/**
 * Build SVG arc path for an event from startMin to endMin.
 * radius: centerline radius; width: stroke thickness.
 * Returns path `d` string for a stroked arc, or full pie wedge if style=pie.
 */
export function arcPath(startMin, endMin, radius, { mode = "h12", cx = 0, cy = 0, style = "stroke", width = 18 } = {}) {
  const a0 = minutesToAngle(startMin, mode);
  let a1 = minutesToAngle(endMin, mode);
  if (a1 <= a0) a1 += 360; // wrap past midnight / top
  const sweep = a1 - a0;
  const large = sweep > 180 ? 1 : 0;

  const rad = (deg) => ((deg - 90) * Math.PI) / 180;
  const x0 = cx + radius * Math.cos(rad(a0));
  const y0 = cy + radius * Math.sin(rad(a0));
  const x1 = cx + radius * Math.cos(rad(a1));
  const y1 = cy + radius * Math.sin(rad(a1));

  if (style === "pie") {
    const ri = Math.max(0, radius - width);
    const xi0 = cx + ri * Math.cos(rad(a0));
    const yi0 = cy + ri * Math.sin(rad(a0));
    const xi1 = cx + ri * Math.cos(rad(a1));
    const yi1 = cy + ri * Math.sin(rad(a1));
    return [
      `M ${x0} ${y0}`,
      `A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`,
      `L ${xi1} ${yi1}`,
      `A ${ri} ${ri} 0 ${large} 0 ${xi0} ${yi0}`,
      "Z",
    ].join(" ");
  }
  // thick round-cap stroke along centerline
  return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
}

/** Point on circle at angle (deg from top, clockwise). */
export function polarPoint(angleDeg, radius, cx = 0, cy = 0) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

/** Normalize an event range into minutes; handles overnight (end < start). */
export function normalizeRange(startMin, endMin) {
  let s = ((startMin % 1440) + 1440) % 1440;
  let e = ((endMin % 1440) + 1440) % 1440;
  const overnight = e <= s;
  const endAbs = overnight ? e + 1440 : e;
  return { startMin: s, endMin: e, overnight, span: endAbs - s };
}

/** Current local minutes since midnight (float). */
export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** Clock hand tip for "now" at given mode/radius. */
export function nowHand(nowMin, radius, mode = "h12", cx = 0, cy = 0) {
  const a = minutesToAngle(nowMin, mode);
  const p = polarPoint(a, radius, cx, cy);
  return { angle: a, ...p };
}

/** Generate hour tick marks for the dial. */
export function hourTicks({ mode = "h12", cx = 0, cy = 0, outer = 100, inner = 90, labelR = 78 } = {}) {
  const hours = mode === "h24" ? 24 : 12;
  const ticks = [];
  for (let h = 0; h < hours; h++) {
    const step = mode === "h24" && h % 2 !== 0 && h !== 0 ? 2 : 1;
    const angle = (h / hours) * 360;
    const isMain = mode === "h12" || h % 2 === 0 || h === 0;
    const i = isMain ? inner : inner + (outer - inner) * 0.4;
    const p1 = polarPoint(angle, outer, cx, cy);
    const p2 = polarPoint(angle, i, cx, cy);
    ticks.push({
      kind: "tick", h, angle,
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      major: isMain, step,
    });
    if (isMain) {
      const lp = polarPoint(angle, labelR, cx, cy);
      ticks.push({ kind: "label", h, angle, x: lp.x, y: lp.y, text: mode === "h24" ? String(h) : (h === 0 ? 12 : h) });
    }
  }
  return ticks;
}
