/**
 * Snake, as pure functions with no React, so that the rules can be tested on their own.
 *
 * The field is a grid of cells, index = row × width + column, row 0 at the top. The
 * snake is a list of cells, its head first. Each step it moves one cell the way it is
 * heading; eating the food makes it one cell longer, and new food appears on an empty
 * cell. With walls the game ends when the head leaves the field; with wrapping edges it
 * comes back on the far side. Either way it ends when the head runs into the snake's own
 * body, and is won when the snake fills the field.
 */
import { type Rng, randomInt, seededRng } from "../kit/rng";

export type Direction = "up" | "down" | "left" | "right";
export type Edges = "walls" | "wrap";
export type Ending = "wall" | "self" | "full";

export interface Snake {
  width: number;
  height: number;
  edges: Edges;
  /** Cells from the head to the tail. */
  body: number[];
  heading: Direction;
  /** Turns asked for and not yet made, at most two, so that a quick double turn is not lost. */
  turns: Direction[];
  /** The cell the food is on, or null once the field is full. */
  food: number | null;
  eaten: number;
  seed: number;
  ending: Ending | null;
}

export const FIELD = 16;
export const START_LENGTH = 3;
const MOST_TURNS = 2;

const STEP: Record<Direction, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };

export const columnOf = (snake: Pick<Snake, "width">, cell: number): number => cell % snake.width;
export const rowOf = (snake: Pick<Snake, "width">, cell: number): number => Math.floor(cell / snake.width);

/** The food's next cell: an empty one, chosen from the seed and how much has been eaten, so a game replays the same. */
function placeFood(width: number, height: number, body: readonly number[], seed: number, eaten: number): number | null {
  const taken = new Set(body);
  const free: number[] = [];
  for (let cell = 0; cell < width * height; cell += 1) if (!taken.has(cell)) free.push(cell);
  if (free.length === 0) return null;
  const rng: Rng = seededRng((seed ^ Math.imul(eaten + 1, 0x9e3779b1)) >>> 0);
  return free[randomInt(rng, free.length)]!;
}

/** A new game: a snake of three heading right from the middle of the left half, food placed from the seed. */
export function newSnake(seed: number, edges: Edges, width = FIELD, height = FIELD): Snake {
  const row = Math.floor(height / 2);
  const headColumn = Math.floor(width / 4) + START_LENGTH - 1;
  const body = Array.from({ length: START_LENGTH }, (_, index) => row * width + headColumn - index);
  return {
    width,
    height,
    edges,
    body,
    heading: "right",
    turns: [],
    food: placeFood(width, height, body, seed, 0),
    eaten: 0,
    seed,
    ending: null,
  };
}

/** Asks for a turn. A turn back on itself, or the way it is already going, is ignored. */
export function turn(snake: Snake, direction: Direction): Snake {
  if (snake.ending) return snake;
  const last = snake.turns[snake.turns.length - 1] ?? snake.heading;
  if (direction === last || direction === OPPOSITE[last] || snake.turns.length >= MOST_TURNS) return snake;
  return { ...snake, turns: [...snake.turns, direction] };
}

/** One step forward. */
export function step(snake: Snake): Snake {
  if (snake.ending) return snake;
  const [heading = snake.heading, ...turns] = snake.turns;
  const [dx, dy] = STEP[heading];
  const head = snake.body[0]!;
  let column = columnOf(snake, head) + dx;
  let row = rowOf(snake, head) + dy;
  if (snake.edges === "wrap") {
    column = (column + snake.width) % snake.width;
    row = (row + snake.height) % snake.height;
  } else if (column < 0 || column >= snake.width || row < 0 || row >= snake.height) {
    return { ...snake, heading, turns, ending: "wall" };
  }
  const next = row * snake.width + column;
  const eating = next === snake.food;
  // The tail moves out of the way this step unless the snake is growing, so the head may follow it into its cell.
  const staying = eating ? snake.body : snake.body.slice(0, -1);
  if (staying.includes(next)) return { ...snake, heading, turns, ending: "self" };
  const body = [next, ...staying];
  if (!eating) return { ...snake, body, heading, turns };
  const eaten = snake.eaten + 1;
  const food = placeFood(snake.width, snake.height, body, snake.seed, eaten);
  return { ...snake, body, heading, turns, eaten, food, ending: food === null ? "full" : null };
}

/** The direction a swipe of (dx, dy) pixels means, or null if it is too short to be one. */
export function swipeDirection(dx: number, dy: number, least = 24): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < least) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** The direction a key means: the arrow keys and W, A, S and D. */
export function keyDirection(key: string): Direction | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    default:
      return null;
  }
}
