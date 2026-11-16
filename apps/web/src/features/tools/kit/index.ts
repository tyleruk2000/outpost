/**
 * The small kit every calculator under Tools is built from, so that they look and behave
 * as one thing: inputs with units that are remembered on the device, the answer as one
 * types, and how it is worked out one press away. Formulas live in pure functions beside
 * each screen, not here. See docs/tools.md.
 */
export { useDevicePref } from "./device-pref";
export {
  allValues,
  ChoiceField,
  type ChoiceOption,
  Inputs,
  NumberField,
  type NumberInput,
  type NumberSpec,
  useChoice,
  useNumber,
  useText,
} from "./fields";
export { formatDuration, formatFigure, formatQuantity, formatRange, roundSignificant } from "./format";
export { Calculator, ToolScreen } from "./layout";
export { type NumberLimits, readNumber } from "./read-number";
export { Formula, HowWorkedOut, KeepButtons, Result, type Source, SourceList } from "./result";
export * as u from "./units";
export { convert, type Unit } from "./units";
