/**
 * How each picture is drawn: a Lucide icon the app already carries, in one of the four
 * chart colours. The colour helps a child tell cards apart at a glance; the shape and
 * the spoken name carry the picture on their own.
 */
import {
  Apple,
  Banana,
  Bike,
  Bird,
  Bus,
  Car,
  Carrot,
  Cat,
  Cherry,
  Cloud,
  Dog,
  Fish,
  Grape,
  type LucideIcon,
  Moon,
  Plane,
  Rabbit,
  Sailboat,
  Snail,
  Snowflake,
  Squirrel,
  Sun,
  Tractor,
  TrainFront,
  Turtle,
  Umbrella,
} from "lucide-react";
import type { Picture } from "./engine";

/** `text-chart-1` … `text-chart-4`: written out so that Tailwind finds the classes. */
const TEAL = "text-chart-1";
const AMBER = "text-chart-2";
const VIOLET = "text-chart-3";
const ROSE = "text-chart-4";

export const PICTURE_ART: Record<Picture, { icon: LucideIcon; colour: string }> = {
  cat: { icon: Cat, colour: AMBER },
  dog: { icon: Dog, colour: TEAL },
  fish: { icon: Fish, colour: ROSE },
  bird: { icon: Bird, colour: VIOLET },
  rabbit: { icon: Rabbit, colour: ROSE },
  turtle: { icon: Turtle, colour: TEAL },
  snail: { icon: Snail, colour: AMBER },
  squirrel: { icon: Squirrel, colour: VIOLET },
  apple: { icon: Apple, colour: ROSE },
  banana: { icon: Banana, colour: AMBER },
  cherries: { icon: Cherry, colour: VIOLET },
  grapes: { icon: Grape, colour: TEAL },
  carrot: { icon: Carrot, colour: AMBER },
  sun: { icon: Sun, colour: AMBER },
  moon: { icon: Moon, colour: VIOLET },
  cloud: { icon: Cloud, colour: TEAL },
  snowflake: { icon: Snowflake, colour: TEAL },
  umbrella: { icon: Umbrella, colour: ROSE },
  car: { icon: Car, colour: ROSE },
  bus: { icon: Bus, colour: AMBER },
  bike: { icon: Bike, colour: VIOLET },
  train: { icon: TrainFront, colour: TEAL },
  boat: { icon: Sailboat, colour: VIOLET },
  plane: { icon: Plane, colour: TEAL },
  tractor: { icon: Tractor, colour: ROSE },
};
