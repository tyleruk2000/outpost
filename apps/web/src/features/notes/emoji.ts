/**
 * A short, hand-picked set of emoji for page icons, grouped by what pages here tend to
 * be about. It is deliberately not the whole of Unicode: the picker also takes any emoji
 * pasted or typed, so nothing is out of reach, and no emoji data file has to be shipped.
 */
export interface EmojiChoice {
  char: string;
  name: string;
}

export const emojiGroups: Array<{ label: string; emoji: EmojiChoice[] }> = [
  {
    label: "Writing and planning",
    emoji: [
      { char: "📝", name: "Memo" },
      { char: "📄", name: "Page" },
      { char: "📓", name: "Notebook" },
      { char: "📚", name: "Books" },
      { char: "📖", name: "Open book" },
      { char: "🗂️", name: "Card dividers" },
      { char: "📌", name: "Pin" },
      { char: "🔖", name: "Bookmark" },
      { char: "📅", name: "Calendar" },
      { char: "✅", name: "Done" },
      { char: "💡", name: "Idea" },
      { char: "❓", name: "Question" },
      { char: "⭐", name: "Star" },
      { char: "🎯", name: "Target" },
      { char: "🧠", name: "Brain" },
      { char: "✏️", name: "Pencil" },
    ],
  },
  {
    label: "Outdoors and travel",
    emoji: [
      { char: "🧭", name: "Compass" },
      { char: "🗺️", name: "Map" },
      { char: "⛰️", name: "Mountain" },
      { char: "🏔️", name: "Snowy mountain" },
      { char: "🏕️", name: "Camping" },
      { char: "⛺", name: "Tent" },
      { char: "🥾", name: "Boot" },
      { char: "🎒", name: "Rucksack" },
      { char: "🔦", name: "Torch" },
      { char: "🔥", name: "Fire" },
      { char: "🌲", name: "Tree" },
      { char: "🌊", name: "Water" },
      { char: "❄️", name: "Snow" },
      { char: "☀️", name: "Sun" },
      { char: "🌧️", name: "Rain" },
      { char: "🌙", name: "Moon" },
      { char: "⚓", name: "Anchor" },
      { char: "🚲", name: "Bicycle" },
      { char: "🚗", name: "Car" },
      { char: "🚆", name: "Train" },
      { char: "✈️", name: "Aeroplane" },
      { char: "⛵", name: "Sailing boat" },
      { char: "🧗", name: "Climbing" },
      { char: "🎣", name: "Fishing" },
    ],
  },
  {
    label: "Home, tools and power",
    emoji: [
      { char: "🏠", name: "House" },
      { char: "🔧", name: "Spanner" },
      { char: "🛠️", name: "Tools" },
      { char: "🧰", name: "Toolbox" },
      { char: "🔩", name: "Nut and bolt" },
      { char: "🔑", name: "Key" },
      { char: "🔋", name: "Battery" },
      { char: "🔌", name: "Plug" },
      { char: "💾", name: "Disk" },
      { char: "🖥️", name: "Computer" },
      { char: "📡", name: "Aerial" },
      { char: "📻", name: "Radio" },
      { char: "🧪", name: "Test tube" },
      { char: "🌱", name: "Seedling" },
      { char: "🪵", name: "Firewood" },
      { char: "🧵", name: "Thread" },
    ],
  },
  {
    label: "Food and health",
    emoji: [
      { char: "🍞", name: "Bread" },
      { char: "🥫", name: "Tinned food" },
      { char: "🍲", name: "Stew" },
      { char: "🥕", name: "Carrot" },
      { char: "🍎", name: "Apple" },
      { char: "☕", name: "Hot drink" },
      { char: "💧", name: "Water drop" },
      { char: "🧂", name: "Salt" },
      { char: "🩹", name: "Plaster" },
      { char: "💊", name: "Medicine" },
      { char: "🩺", name: "Stethoscope" },
      { char: "❤️", name: "Heart" },
      { char: "🧼", name: "Soap" },
      { char: "🛒", name: "Shopping" },
      { char: "🐕", name: "Dog" },
      { char: "🐈", name: "Cat" },
    ],
  },
  {
    label: "People and signs",
    emoji: [
      { char: "👋", name: "Wave" },
      { char: "👥", name: "People" },
      { char: "🏫", name: "School" },
      { char: "🏥", name: "Hospital" },
      { char: "📞", name: "Telephone" },
      { char: "✉️", name: "Letter" },
      { char: "💬", name: "Speech" },
      { char: "🎵", name: "Music" },
      { char: "🎨", name: "Art" },
      { char: "🧮", name: "Abacus" },
      { char: "⚠️", name: "Warning" },
      { char: "🚫", name: "Not allowed" },
      { char: "🆘", name: "SOS" },
      { char: "♻️", name: "Recycling" },
      { char: "🔒", name: "Lock" },
      { char: "🏁", name: "Finish flag" },
    ],
  },
];

const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣/u;

/**
 * The first emoji in a piece of text, whole (flags, skin tones and joined families are
 * several code points but one emoji), or `null` if it does not start with one.
 */
export function firstEmoji(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let first = Array.from(text)[0] ?? "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segment = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)[Symbol.iterator]().next();
    if (!segment.done) first = segment.value.segment;
  }
  return PICTOGRAPH.test(first) ? first : null;
}
