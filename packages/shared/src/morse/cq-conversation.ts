/**
 * Guided CW CQ conversations shared by the web and native send trainers.
 *
 * These are deliberately teaching scripts rather than a contest macro bank:
 * every stage pairs the station the learner just heard with the over they
 * should key next, and explains why that over is unambiguous on air.
 */

export type CqConversationKind = "standard" | "sota" | "pota";

export interface CqConversationContext {
  myCall: string;
  myName: string;
  myQth: string;
  otherCall: string;
  /** Summit or park reference. Ignored by the standard conversation. */
  reference?: string;
}

export interface CqConversationStage {
  id: "call" | "exchange" | "close";
  title: string;
  /** What the other station sends before the learner's turn. */
  incoming: string | null;
  /** Exact teaching target for the learner to key. */
  target: string;
  guidance: string;
}

export interface CqConversation {
  kind: CqConversationKind;
  label: string;
  description: string;
  role: string;
  referenceLabel: string | null;
  stages: readonly CqConversationStage[];
}

export interface CqConversationDefinition {
  id: CqConversationKind;
  label: string;
  shortLabel: string;
  description: string;
  role: string;
  referenceLabel: string | null;
  referenceExample: string | null;
}

export const CQ_CONVERSATION_DEFINITIONS: readonly CqConversationDefinition[] = [
  {
    id: "standard",
    label: "Standard CQ",
    shortLabel: "Standard",
    description: "Call any station, exchange RST, name and QTH, then sign off cleanly.",
    role: "You are calling CQ from your station.",
    referenceLabel: null,
    referenceExample: null,
  },
  {
    id: "sota",
    label: "SOTA activation",
    shortLabel: "SOTA",
    description: "Run a concise summit pile-up exchange with callsigns, reports and a summit reference.",
    role: "You are the summit activator; the other station is a chaser.",
    referenceLabel: "Summit reference",
    referenceExample: "G/LD-001",
  },
  {
    id: "pota",
    label: "POTA activation",
    shortLabel: "POTA",
    description: "Run a friendly park activation exchange and return the frequency to callers.",
    role: "You are the park activator; the other station is a hunter.",
    referenceLabel: "Park reference",
    referenceExample: "GB-0099",
  },
] as const;

function clean(value: string, fallback: string): string {
  const next = value.trim().toUpperCase().replace(/\s+/g, " ");
  return next || fallback;
}

function portableCall(call: string): string {
  return call.includes("/") ? call : `${call}/P`;
}

/** Build a complete three-over teaching drill from operator-supplied details. */
export function buildCqConversation(kind: CqConversationKind, context: CqConversationContext): CqConversation {
  const definition = CQ_CONVERSATION_DEFINITIONS.find((item) => item.id === kind) ?? CQ_CONVERSATION_DEFINITIONS[0]!;
  const myCall = clean(context.myCall, "Q7XYZ");
  const myName = clean(context.myName, "PAT");
  const myQth = clean(context.myQth, "LEEDS");
  const otherCall = clean(context.otherCall, "Q4RTF");

  if (kind === "standard") {
    return {
      kind,
      label: definition.label,
      description: definition.description,
      role: definition.role,
      referenceLabel: null,
      stages: [
        {
          id: "call",
          title: "Call CQ",
          incoming: null,
          target: `CQ CQ CQ DE ${myCall} ${myCall} K`,
          guidance: "Repeat your callsign and finish with K to invite any station to answer.",
        },
        {
          id: "exchange",
          title: "Give the first over",
          incoming: `${myCall} DE ${otherCall} ${otherCall} K`,
          target: `${otherCall} DE ${myCall} GM UR RST 579 579 = NAME ${myName} ${myName} = QTH ${myQth} ${myQth} = HW? ${otherCall} DE ${myCall} KN`,
          guidance:
            "Address the caller, exchange useful details, repeat the callsigns and use KN because you expect only that station back.",
        },
        {
          id: "close",
          title: "Acknowledge and sign off",
          incoming: `R R ${myCall} DE ${otherCall} UR RST 599 599 = NAME ALEX QTH YORK = 73 KN`,
          target: `R TU ${otherCall} 73 ES GUD DX DE ${myCall} <SK>`,
          guidance: "Acknowledge what you copied, send 73, identify once more and finish with SK.",
        },
      ],
    };
  }

  const onAirCall = portableCall(myCall);
  const reference = clean(context.reference ?? "", definition.referenceExample ?? (kind === "sota" ? "G/LD-001" : "GB-0099"));
  const programme = kind.toUpperCase();
  const finalTail = kind === "pota" ? "QRZ?" : "K";

  return {
    kind,
    label: definition.label,
    description: definition.description,
    role: definition.role,
    referenceLabel: definition.referenceLabel,
    stages: [
      {
        id: "call",
        title: `Call CQ ${programme}`,
        incoming: null,
        target: `CQ ${programme} CQ ${programme} DE ${onAirCall} ${onAirCall} K`,
        guidance: `Name ${programme} in the call so chasers know this is an activation, then repeat your portable callsign.`,
      },
      {
        id: "exchange",
        title: "Work one caller",
        incoming: `${otherCall} ${otherCall}`,
        target: `${otherCall} UR RST 579 579 = REF ${reference} ${reference} BK`,
        guidance:
          kind === "sota"
            ? "Send the selected chaser a report and the summit reference. BK hands the contact straight back without reopening the pile-up."
            : "POTA has no mandatory formal exchange; this clear teaching over gives a report and park reference before handing it back.",
      },
      {
        id: "close",
        title: "Confirm and take the next caller",
        incoming: `R UR RST 599 599 73 BK`,
        target: `R TU 73 DE ${onAirCall} ${finalTail}`,
        guidance:
          kind === "pota"
            ? "Confirm the report, thank the hunter, identify and send QRZ? to invite the next caller."
            : "Confirm the report, thank the chaser, identify and send K to return control to the callers.",
      },
    ],
  };
}
