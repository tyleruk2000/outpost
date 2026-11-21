/**
 * The rules of Snake: the start, moving and turning (never back on itself, two quick turns
 * both kept), eating and growing, the walls and the wrapping edges, running into itself
 * (but not into the cell its tail is leaving), filling the field, and the controls' keys
 * and swipes.
 */
import { describe, expect, it } from "vitest";
import { keyDirection, newSnake, type Snake, START_LENGTH, step, swipeDirection, turn } from "./engine";

const steps = (snake: Snake, count: number) => {
  let current = snake;
  for (let index = 0; index < count; index += 1) current = step(current);
  return current;
};
/** A snake with its food put where a test wants it. */
const withFood = (snake: Snake, food: number | null): Snake => ({ ...snake, food });

describe("the start", () => {
  it("is a snake of three heading right, with food on an empty cell, the same for the same seed", () => {
    const snake = newSnake(7, "walls");
    expect(snake.body).toHaveLength(START_LENGTH);
    expect(snake.body).toEqual([8 * 16 + 6, 8 * 16 + 5, 8 * 16 + 4]);
    expect(snake.heading).toBe("right");
    expect(snake.food).not.toBeNull();
    expect(snake.body).not.toContain(snake.food);
    expect(newSnake(7, "walls").food).toBe(snake.food);
  });
});

describe("moving", () => {
  it("moves one cell a step the way it is heading", () => {
    const snake = withFood(newSnake(1, "walls"), 0);
    expect(step(snake).body).toEqual([8 * 16 + 7, 8 * 16 + 6, 8 * 16 + 5]);
  });

  it("turns, but never back on itself, and keeps two quick turns", () => {
    const snake = withFood(newSnake(1, "walls"), 0);
    expect(turn(snake, "left").turns).toEqual([]);
    expect(turn(snake, "right").turns).toEqual([]);
    const twice = turn(turn(snake, "up"), "left");
    expect(twice.turns).toEqual(["up", "left"]);
    const after = steps(twice, 2);
    expect(after.heading).toBe("left");
    expect(after.body[0]).toBe(7 * 16 + 5);
    // A third turn waiting is not taken: the field cannot be steered faster than it moves.
    expect(turn(twice, "down").turns).toEqual(["up", "left"]);
  });
});

describe("eating", () => {
  it("grows by one and counts it, and new food appears off the snake", () => {
    const snake = withFood(newSnake(3, "walls"), 8 * 16 + 7);
    const fed = step(snake);
    expect(fed.body).toHaveLength(START_LENGTH + 1);
    expect(fed.eaten).toBe(1);
    expect(fed.food).not.toBeNull();
    expect(fed.body).not.toContain(fed.food);
  });
});

describe("the end", () => {
  it("comes at a wall, with walls", () => {
    const snake = withFood(newSnake(1, "walls"), 0);
    const ended = steps(snake, 10);
    expect(ended.ending).toBe("wall");
    // The head is never drawn off the field.
    expect(ended.body[0]).toBe(8 * 16 + 15);
    expect(step(ended)).toBe(ended);
  });

  it("does not come at the edge when the edges wrap: the snake comes back on the far side", () => {
    const snake = withFood(newSnake(1, "wrap"), 0);
    const wrapped = steps(snake, 10);
    expect(wrapped.ending).toBeNull();
    expect(wrapped.body[0]).toBe(8 * 16 + 0);
    const up = steps(turn(withFood(newSnake(1, "wrap"), 15), "up"), 9);
    expect(up.body[0]).toBe(15 * 16 + 6);
  });

  it("comes when the head runs into the body, but not into the cell the tail is leaving", () => {
    // A snake of five in a U: turning into its own neck ends it.
    const coiled: Snake = { ...newSnake(1, "walls"), body: [20, 21, 37, 36, 35], heading: "left", food: 200 };
    expect(step(turn(coiled, "down")).ending).toBe("self");
    // A ring of four chasing its own tail goes round for ever.
    const ring: Snake = { ...newSnake(1, "walls"), body: [17, 18, 34, 33], heading: "left", food: 200 };
    const round = step(turn(ring, "down"));
    expect(round.ending).toBeNull();
    expect(round.body).toEqual([33, 17, 18, 34]);
  });

  it("is won when the snake fills the field", () => {
    const snake: Snake = { ...newSnake(1, "walls", 2, 2), body: [1, 0, 2], heading: "down", food: 3 };
    const full = step(snake);
    expect(full.ending).toBe("full");
    expect(full.food).toBeNull();
    expect(full.eaten).toBe(1);
  });
});

describe("the controls", () => {
  it("reads the arrow keys and W, A, S and D", () => {
    expect(["ArrowUp", "w", "S", "a", "ArrowRight", "x"].map(keyDirection)).toEqual(["up", "up", "down", "left", "right", null]);
  });

  it("reads a swipe by its longer side, and ignores a tap", () => {
    expect(swipeDirection(40, 10)).toBe("right");
    expect(swipeDirection(-5, -60)).toBe("up");
    expect(swipeDirection(6, 4)).toBeNull();
  });
});
