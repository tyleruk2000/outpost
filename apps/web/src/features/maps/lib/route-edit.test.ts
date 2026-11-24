import { haversineMeters, MAX_ROUTE_POINTS } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import {
  addPoint,
  canRedo,
  canSave,
  canUndo,
  closeLoop,
  EDITABLE_POINTS,
  editablePoints,
  HISTORY_LIMIT,
  insertPoint,
  isChanged,
  isFull,
  isStoredRouteDraft,
  midpoints,
  movePoint,
  type RouteEdit,
  redo,
  removePoint,
  reversePoints,
  simplifyLine,
  startEdit,
  undo,
} from "./route-edit";

const a = { lat: 53.085, lon: -4.1 };
const b = { lat: 53.0685, lon: -4.0763 };
const c = { lat: 53.06, lon: -4.05 };
const d = { lat: 53.04, lon: -4.0 };

const drawn = (...points: Array<{ lat: number; lon: number }>) => points.reduce<RouteEdit>(addPoint, startEdit());

describe("drawing a route point by point", () => {
  it("starts empty and cannot be saved until it has two points", () => {
    const empty = startEdit();
    expect(empty.points).toEqual([]);
    expect(canSave(empty)).toBe(false);
    expect(canUndo(empty)).toBe(false);
    expect(isChanged(empty)).toBe(false);
    expect(canSave(drawn(a))).toBe(false);
    expect(canSave(drawn(a, b))).toBe(true);
  });

  it("adds points at the end, to six decimal places", () => {
    const edit = addPoint(drawn(a), { lat: 53.06851234567, lon: -4.07630000049 });
    expect(edit.points).toEqual([a, { lat: 53.068512, lon: -4.0763 }]);
    expect(isChanged(edit)).toBe(true);
  });

  it("ignores a second press on the same spot", () => {
    const once = drawn(a, b);
    const twice = addPoint(once, { lat: b.lat + 0.0000001, lon: b.lon });
    expect(twice).toBe(once);
    expect(twice.past).toHaveLength(2);
  });

  it("stops adding at the limit the server accepts", () => {
    const full = startEdit(Array.from({ length: MAX_ROUTE_POINTS }, (_, index) => ({ lat: 10 + index / 1000, lon: 5 })));
    expect(isFull(full)).toBe(true);
    expect(addPoint(full, a)).toBe(full);
    expect(insertPoint(full, 3, a)).toBe(full);
    // Removing one makes room again.
    expect(addPoint(removePoint(full, 0), a).points).toHaveLength(MAX_ROUTE_POINTS);
  });

  it("moves one point and leaves the others where they were", () => {
    const edit = movePoint(drawn(a, b, c), 1, d);
    expect(edit.points).toEqual([a, d, c]);
    expect(movePoint(edit, 7, a)).toBe(edit);
    // Dropping a point back exactly where it was is not a step.
    expect(movePoint(edit, 1, d)).toBe(edit);
  });

  it("inserts a point between two others, at the start, or at the end", () => {
    expect(insertPoint(drawn(a, c), 1, b).points).toEqual([a, b, c]);
    expect(insertPoint(drawn(b, c), 0, a).points).toEqual([a, b, c]);
    expect(insertPoint(drawn(a, b), 2, c).points).toEqual([a, b, c]);
    const edit = drawn(a, b);
    expect(insertPoint(edit, 3, c)).toBe(edit);
    expect(insertPoint(edit, -1, c)).toBe(edit);
  });

  it("removes a point and closes the gap", () => {
    expect(removePoint(drawn(a, b, c), 1).points).toEqual([a, c]);
    expect(removePoint(drawn(a, b, c), 0).points).toEqual([b, c]);
    const edit = drawn(a, b);
    expect(removePoint(edit, 2)).toBe(edit);
  });

  it("reverses the direction", () => {
    expect(reversePoints(drawn(a, b, c)).points).toEqual([c, b, a]);
  });
});

describe("undo and redo", () => {
  it("steps back through every kind of change and forward again", () => {
    let edit = drawn(a, b, c); // three adds
    edit = movePoint(edit, 2, d);
    edit = insertPoint(edit, 1, c);
    edit = removePoint(edit, 0);
    expect(edit.points).toEqual([c, b, d]);

    const states = [edit.points];
    while (canUndo(edit)) {
      edit = undo(edit);
      states.push(edit.points);
    }
    expect(states).toEqual([[c, b, d], [a, c, b, d], [a, b, d], [a, b, c], [a, b], [a], []]);
    expect(isChanged(edit)).toBe(false);
    expect(undo(edit)).toBe(edit);

    for (const expected of states.slice(0, -1).reverse()) {
      expect(canRedo(edit)).toBe(true);
      edit = redo(edit);
      expect(edit.points).toEqual(expected);
    }
    expect(canRedo(edit)).toBe(false);
    expect(redo(edit)).toBe(edit);
  });

  it("forgets what was undone once something new is done", () => {
    let edit = undo(drawn(a, b, c));
    expect(canRedo(edit)).toBe(true);
    edit = addPoint(edit, d);
    expect(canRedo(edit)).toBe(false);
    expect(edit.points).toEqual([a, b, d]);
    expect(undo(edit).points).toEqual([a, b]);
  });

  it("keeps a bounded number of steps", () => {
    let edit = startEdit();
    for (let index = 0; index < HISTORY_LIMIT + 50; index += 1) edit = addPoint(edit, { lat: index / 1000, lon: 1 });
    expect(edit.past).toHaveLength(HISTORY_LIMIT);
    for (let index = 0; index < HISTORY_LIMIT; index += 1) edit = undo(edit);
    expect(canUndo(edit)).toBe(false);
    expect(edit.points).toHaveLength(50);
  });

  it("measures change against the route as it was opened, not against empty", () => {
    const opened = startEdit([a, b, c]);
    expect(isChanged(opened)).toBe(false);
    expect(canUndo(opened)).toBe(false);
    const moved = movePoint(opened, 0, d);
    expect(isChanged(moved)).toBe(true);
    expect(isChanged(undo(moved))).toBe(false);
    // Moving it back by hand is also "unchanged", though there are steps to undo.
    const back = movePoint(moved, 0, a);
    expect(isChanged(back)).toBe(false);
    expect(canUndo(back)).toBe(true);
  });
});

describe("handles between points", () => {
  it("sit in the middle of each leg", () => {
    expect(midpoints([])).toEqual([]);
    expect(midpoints([a])).toEqual([]);
    const [first, second] = midpoints([a, b, c]);
    expect(midpoints([a, b, c])).toHaveLength(2);
    expect(first!.lon).toBeCloseTo((a.lon + b.lon) / 2, 6);
    expect(first!.lat).toBeCloseTo((a.lat + b.lat) / 2, 4);
    // Equally far from both ends.
    expect(haversineMeters(a.lat, a.lon, first!.lat, first!.lon)).toBeCloseTo(haversineMeters(first!.lat, first!.lon, b.lat, b.lon), 0);
    expect(second!.lon).toBeCloseTo((b.lon + c.lon) / 2, 6);
  });

  it("follow the line the map draws on a long leg northwards", () => {
    // On the map's projection the middle of a line from 0° to 80° north is well north of 40°.
    const [middle] = midpoints([
      { lat: 0, lon: 0 },
      { lat: 80, lon: 0 },
    ]);
    expect(middle!.lat).toBeGreaterThan(55);
    expect(middle!.lat).toBeLessThan(62);
  });
});

describe("making a recording editable", () => {
  /** A zigzag walked as a GPS records it: a point every few metres. */
  const recording = Array.from({ length: 3000 }, (_, index) => {
    const along = index / 3000;
    return { lat: 53 + along * 0.2 + Math.sin(along * 40) * 0.004, lon: -4 + along * 0.3 };
  });

  it("leaves a short line alone", () => {
    const short = [a, b, c, d];
    expect(simplifyLine(short)).toBe(short);
  });

  it("thins a long line to a number of points a person can edit, keeping both ends and the shape", () => {
    const simplified = simplifyLine(recording);
    expect(simplified.length).toBeLessThanOrEqual(EDITABLE_POINTS);
    expect(simplified.length).toBeGreaterThan(20);
    expect(simplified[0]).toEqual(recording[0]);
    expect(simplified.at(-1)).toEqual(recording.at(-1));
    const length = (line: typeof recording) =>
      line.slice(1).reduce((sum, point, index) => sum + haversineMeters(line[index]!.lat, line[index]!.lon, point.lat, point.lon), 0);
    // Corners are cut a little, never by much.
    expect(length(simplified)).toBeLessThanOrEqual(length(recording));
    expect(length(simplified)).toBeGreaterThan(length(recording) * 0.98);
  });

  it("joins the parts of a stored track in order and counts what was recorded", () => {
    const geojson = {
      type: "FeatureCollection" as const,
      features: [
        { type: "Feature", properties: { name: "Cairn" }, geometry: { type: "Point", coordinates: [-4.07, 53.07, 900] } },
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [a.lon, a.lat, 400],
                [b.lon, b.lat, 1081],
              ],
              [
                // The second part starts where the first ended: that point is not doubled.
                [b.lon, b.lat, 1081],
                [c.lon, c.lat, 660],
              ],
            ],
          },
        },
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [c.lon, c.lat],
              [d.lon, d.lat],
            ],
          },
        },
      ],
    };
    expect(editablePoints(geojson)).toEqual({ points: [a, b, c, d], recorded: 6, parts: 3 });
  });
});

describe("an unsaved route kept in the browser", () => {
  it("is only taken back when it is whole", () => {
    expect(isStoredRouteDraft({ name: "", color: "teal", points: [] })).toBe(true);
    expect(isStoredRouteDraft({ trackId: "abc", name: "Ridge", color: "violet", points: [a, b] })).toBe(true);
    expect(isStoredRouteDraft(null)).toBe(false);
    expect(isStoredRouteDraft({ name: "Ridge", color: "puce", points: [a] })).toBe(false);
    expect(isStoredRouteDraft({ name: "Ridge", color: "teal", points: [{ lat: 95, lon: 0 }] })).toBe(false);
    expect(isStoredRouteDraft({ name: "Ridge", color: "teal", points: [{ lat: "53", lon: 0 }] })).toBe(false);
    expect(isStoredRouteDraft({ name: 4, color: "teal", points: [] })).toBe(false);
  });
});

describe("a round walk", () => {
  it("closes the loop when the first point is pressed, once there are three", () => {
    const a = { lat: 53.06, lon: -4.07 };
    const b = { lat: 53.07, lon: -4.07 };
    const c = { lat: 53.07, lon: -4.06 };
    expect(closeLoop(drawn(a, b), 0)).toBeNull();
    const closed = closeLoop(drawn(a, b, c), 0);
    expect(closed?.points).toHaveLength(4);
    expect(closed?.points.at(-1)).toEqual(closed?.points[0]);
    expect(closeLoop(closed!, 0)).toBeNull();
    expect(closeLoop(drawn(a, b, c), 1)).toBeNull();
  });
});
