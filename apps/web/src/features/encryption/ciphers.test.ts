/**
 * Every cipher against a published worked example, then round trips with awkward
 * input. The examples were read from the pages named below on 16 November 2026 (the
 * revision of each is given so that the exact text can be found again) and are listed
 * in docs/encryption.md.
 */
import { describe, expect, it } from "vitest";
import {
  ALPHABET,
  CipherError,
  caesar,
  columnar,
  columnOrder,
  inGroups,
  oneTimePad,
  playfair,
  playfairSquare,
  railFence,
  randomLetters,
  reduce,
  rot13,
  vigenere,
  vigenereSquare,
} from "./ciphers";

const AWKWARD = [
  "",
  " ",
  "a",
  "Z",
  "Hello, World!",
  "  spaced   out  ",
  "ünïcödé straße",
  "数字 and 🙂 emoji",
  "line one\nline two\ttab",
  "1234567890",
  "x".repeat(501),
];

describe("preparing a message", () => {
  it("keeps the letters A to Z, in capitals, without their accents", () => {
    expect(reduce("Héllo, Wörld!")).toEqual({ text: "HELLOWORLD", digits: 0, others: 2 });
    expect(reduce("straße")).toEqual({ text: "STRASSE", digits: 0, others: 0 });
    expect(reduce("")).toEqual({ text: "", digits: 0, others: 0 });
  });

  it("counts what it leaves out, so that the screen can say so", () => {
    expect(reduce("QTH 51.5N at 19:00 🙂")).toEqual({ text: "QTHNAT", digits: 7, others: 3 });
    expect(reduce("QTH 51.5N at 19:00", { digits: true })).toEqual({ text: "QTH515NAT1900", digits: 0, others: 2 });
    expect(reduce("数字").text).toBe("");
    expect(reduce("数字").others).toBe(2);
  });

  it("writes ciphertext in groups of five", () => {
    expect(inGroups("BMODZBXDNABEKUDMUIXMMOUVIF")).toBe("BMODZ BXDNA BEKUD MUIXM MOUVI F");
    expect(inGroups("")).toBe("");
  });
});

describe("Caesar", () => {
  // https://en.wikipedia.org/wiki/Caesar_cipher (revision 1384766789): "a left shift of 3 places, equivalent to a right shift of 23".
  it("matches the published example: a left shift of 3", () => {
    const plain = "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG";
    const cipher = "QEB NRFZH YOLTK CLU GRJMP LSBO QEB IXWV ALD";
    expect(caesar(plain, 23).output).toBe(cipher);
    expect(caesar(plain, -3).output).toBe(cipher);
    expect(caesar(plain, 23).cipherAlphabet).toBe("XYZABCDEFGHIJKLMNOPQRSTUVW");
    expect(caesar(cipher, 23, "decipher").output).toBe(plain);
  });

  // https://en.wikipedia.org/wiki/ROT13 (revision 1382439832).
  it("matches the published ROT13 example, and undoes itself", () => {
    expect(rot13("Why did the chicken cross the road?")).toBe("Jul qvq gur puvpxra pebff gur ebnq?");
    expect(rot13("Gb trg gb gur bgure fvqr!")).toBe("To get to the other side!");
    for (const text of AWKWARD) expect(rot13(rot13(text))).toBe(text);
  });

  it("keeps case and leaves everything that is not a letter A to Z alone", () => {
    expect(caesar("Zebra-123 é ß 数", 1).output).toBe("Afcsb-123 é ß 数");
    expect(caesar("", 5).output).toBe("");
  });

  it("round-trips any text with any shift", () => {
    for (const text of AWKWARD) {
      for (const shift of [0, 1, 13, 25, 26, 27, -1, -53, 1000]) {
        expect(caesar(caesar(text, shift).output, shift, "decipher").output).toBe(text);
      }
    }
    expect(caesar("abc", 26).output).toBe("abc");
    expect(caesar("abc", 0).shift).toBe(0);
    expect(caesar("abc", -1).shift).toBe(25);
  });

  it("refuses a shift that is not a whole number", () => {
    expect(() => caesar("abc", 1.5)).toThrow(CipherError);
    expect(() => caesar("abc", Number.NaN)).toThrow(CipherError);
  });
});

describe("Vigenère", () => {
  // https://en.wikipedia.org/w/index.php?title=Vigen%C3%A8re_cipher&oldid=1328532396 (the well-known example; removed from the page in March 2026).
  it("matches the classic published example: attackatdawn with LEMON", () => {
    expect(vigenere("attackatdawn", "LEMON").output).toBe("lxfopvefrnhr");
    expect(vigenere("ATTACKATDAWN", "lemon").output).toBe("LXFOPVEFRNHR");
    expect(vigenere("LXFOPVEFRNHR", "LEMON", "decipher").output).toBe("ATTACKATDAWN");
  });

  // https://en.wikipedia.org/wiki/Vigen%C3%A8re_cipher (revision 1385837243).
  it("matches the examples on the current page", () => {
    expect(vigenere("attacking tonight", "oculorhinolaryngology").output).toBe("ovnlqbpvt hznzeuz");
    expect(vigenere("helloworld", "key").output).toBe("rijvsuyvjn");
    expect(vigenere("cryptoisshortforcryptography", "ABCD").output.toUpperCase()).toBe("CSASTPKVSIQUTGQUCSASTPIUAQJB");
    // Two keys in turn are one key as long as their lengths' least common multiple.
    expect(vigenere(vigenere("attackatdawn", "GO").output, "CAT").output.toUpperCase()).toBe("IHSQIRIHCQCU");
    expect(vigenere("attackatdawn", "IOZQGH").output.toUpperCase()).toBe("IHSQIRIHCQCU");
  });

  it("shows its working letter by letter", () => {
    const { steps, key } = vigenere("at dawn", "LEMON");
    expect(key).toBe("LEMON");
    expect(steps.map((step) => `${step.input}+${step.key}=${step.output}`)).toEqual(["A+L=L", "T+E=X", "D+M=P", "A+O=O", "W+N=J", "N+L=Y"]);
  });

  it("moves the key on only at letters, and keeps case, spaces and other characters", () => {
    expect(vigenere("At-tack, at dawn! é 9", "Lemon").output).toBe("Lx-fopv, ef rnhr! é 9");
    expect(vigenere("abc", "A").output).toBe("abc");
    expect(vigenere("abc", "l-e m.o,n9").key).toBe("LEMON");
  });

  it("round-trips any text with any key", () => {
    for (const text of AWKWARD) {
      for (const key of ["A", "KEY", "Oculorhinolaryngology", "zz top"]) {
        expect(vigenere(vigenere(text, key).output, key, "decipher").output).toBe(text);
      }
    }
  });

  it("refuses a key with no letters in it", () => {
    expect(() => vigenere("abc", "")).toThrow(/at least one letter/);
    expect(() => vigenere("abc", "123 !")).toThrow(CipherError);
  });

  it("draws the square: row K is the alphabet shifted by K", () => {
    const square = vigenereSquare();
    expect(square).toHaveLength(26);
    expect(square[0]).toBe(ALPHABET);
    expect(square[11]).toBe("LMNOPQRSTUVWXYZABCDEFGHIJK");
    // Row L, column A is L: the first step of the example above.
    expect(square[ALPHABET.indexOf("L")]![ALPHABET.indexOf("A")]).toBe("L");
    expect(square[ALPHABET.indexOf("E")]![ALPHABET.indexOf("T")]).toBe("X");
  });
});

describe("Playfair", () => {
  // https://en.wikipedia.org/wiki/Playfair_cipher (revision 1371494878): key "playfair example", I and J interchangeable.
  it("builds the published key square", () => {
    expect(playfairSquare("playfair example")).toEqual(["PLAYF", "IREXM", "BCDGH", "KNOQS", "TUVWZ"]);
  });

  it("matches the published example pair by pair, with the rule used for each", () => {
    const worked = playfair("hide the gold in the tree stump", "playfair example");
    expect(worked.steps.map((step) => step.input).join(" ")).toBe("HI DE TH EG OL DI NT HE TR EX ES TU MP");
    expect(worked.steps.map((step) => step.output).join(" ")).toBe("BM OD ZB XD NA BE KU DM UI XM MO UV IF");
    expect(inGroups(worked.output)).toBe("BMODZ BXDNA BEKUD MUIXM MOUVI F");
    expect(worked.fillers).toBe(1);
    const rules = Object.fromEntries(worked.steps.map((step) => [step.input, step.rule]));
    expect(rules).toMatchObject({ DE: "column", EX: "row", TU: "row", HI: "rectangle", MP: "rectangle" });
  });

  it("deciphers the published ciphertext, leaving the filler for the reader", () => {
    expect(playfair("BMODZ BXDNA BEKUD MUIXM MOUVI F", "playfair example", "decipher").output).toBe("HIDETHEGOLDINTHETREXESTUMP");
  });

  it("treats J as I, parts doubled letters, and pads an odd length", () => {
    expect(playfair("jam", "playfair example").steps.map((step) => step.input)).toEqual(["IA", "MX"]);
    expect(playfair("balloon", "key").steps.map((step) => step.input)).toEqual(["BA", "LX", "LO", "ON"]);
    // Letters are only parted when they would share a pair: here the two Xs fall in different pairs.
    expect(playfair("exxon", "key").steps.map((step) => step.input)).toEqual(["EX", "XO", "NX"]);
    // X is its own filler's exception: two Xs in one pair are parted by Q, and a final X is paired with Q.
    expect(playfair("xxa", "key").steps.map((step) => step.input)).toEqual(["XQ", "XA"]);
    expect(playfair("box", "key").steps.map((step) => step.input)).toEqual(["BO", "XQ"]);
    expect(playfair("", "key").output).toBe("");
  });

  it("uses a plain alphabet square when the key has no letters", () => {
    expect(playfairSquare("")).toEqual(["ABCDE", "FGHIK", "LMNOP", "QRSTU", "VWXYZ"]);
    expect(playfairSquare("jij")).toEqual(["IABCD", "EFGHK", "LMNOP", "QRSTU", "VWXYZ"]);
  });

  it("round-trips: deciphering gives back the prepared pairs", () => {
    for (const text of [...AWKWARD, "The quick brown fox jumps over the lazy dog", "xx", "jazz", "aaaa"]) {
      for (const key of ["playfair example", "", "zebra", "JJ"]) {
        const enciphered = playfair(text, key);
        expect(enciphered.output).toMatch(/^[A-IK-Z]*$/);
        expect(enciphered.output.length % 2).toBe(0);
        const prepared = enciphered.steps.map((step) => step.input).join("");
        expect(playfair(enciphered.output, key, "decipher").output).toBe(prepared);
        // No pair is ever a doubled letter, which the cipher could not hide.
        for (const step of enciphered.steps) expect(step.input[0]).not.toBe(step.input[1]);
      }
    }
  });

  it("says what was left out, and refuses ciphertext with a letter missing", () => {
    expect(playfair("Meet at 9, pier 4!", "key").dropped).toMatchObject({ digits: 2, others: 2 });
    expect(() => playfair("BMODZ", "playfair example", "decipher")).toThrow(/comes in pairs/);
  });
});

describe("rail fence", () => {
  // https://en.wikipedia.org/wiki/Rail_fence_cipher (revision 1384142693).
  const MESSAGE = "WE ARE DISCOVERED. RUN AT ONCE.";

  it("matches the published example on 3 rails, zigzag and all", () => {
    const worked = railFence(MESSAGE, 3);
    expect(worked.layout.map((line) => line.replaceAll(" ", "."))).toEqual([
      "W...E...C...R...U...O...",
      ".E.R.D.S.O.E.E.R.N.T.N.E",
      "..A...I...V...D...A...C.",
    ]);
    expect(worked.output).toBe("WECRUOERDSOEERNTNEAIVDAC");
    expect(worked.dropped.others).toBe(2);
  });

  it("matches the published example on 6 rails", () => {
    expect(railFence(MESSAGE, 6).output).toBe("WVOEOETNACRACRSENEEIDUDR");
    expect(railFence(MESSAGE, 6).layout[0]!.replaceAll(" ", ".")).toBe("W.........V.........O...");
  });

  it("deciphers both", () => {
    expect(railFence("WECRUO ERDSOEERNTNE AIVDAC", 3, "decipher").output).toBe("WEAREDISCOVEREDRUNATONCE");
    expect(railFence("WVO EOETN ACRAC RSENE EIDU DR", 6, "decipher").output).toBe("WEAREDISCOVEREDRUNATONCE");
  });

  it("keeps figures, which a transposition can carry", () => {
    expect(railFence("QSY 7.150 at 1900", 2).output).toBe("QY10T90S75A10");
    expect(railFence("QY10T90S75A10", 2, "decipher").output).toBe("QSY7150AT1900");
  });

  it("round-trips any text on any number of rails", () => {
    for (const text of [...AWKWARD, MESSAGE]) {
      const prepared = reduce(text, { digits: true }).text;
      for (const rails of [2, 3, 4, 7, 40]) {
        expect(railFence(railFence(text, rails).output, rails, "decipher").output).toBe(prepared);
      }
    }
  });

  it("needs at least two rails", () => {
    expect(() => railFence("abc", 1)).toThrow(/at least 2 rails/);
    expect(() => railFence("abc", 0)).toThrow(CipherError);
    expect(() => railFence("abc", 2.5)).toThrow(CipherError);
    expect(() => railFence("abc", 41)).toThrow(CipherError);
  });
});

describe("columnar transposition", () => {
  // https://en.wikipedia.org/wiki/Transposition_cipher (revision 1385307730), "Columnar transposition".
  const MESSAGE = "WE ARE DISCOVERED. FLEE AT ONCE";

  it("numbers the columns by the alphabetical order of the key, repeats left to right", () => {
    expect(columnOrder("ZEBRAS")).toEqual([6, 3, 2, 4, 1, 5]);
    expect(columnOrder("CIPHER")).toEqual([1, 4, 5, 3, 2, 6]);
    expect(columnOrder("STRIPE")).toEqual([5, 6, 4, 2, 3, 1]);
    // "the keyword TOMATO yields a numeric keystring of 532164"
    expect(columnOrder("TOMATO")).toEqual([5, 3, 2, 1, 6, 4]);
  });

  it("matches the published irregular example (the last row left short)", () => {
    const worked = columnar(MESSAGE, "ZEBRAS");
    expect(worked.rows).toEqual(["WEARED", "ISCOVE", "REDFLE", "EATONC", "E"]);
    expect(inGroups(worked.output)).toBe("EVLNA CDTES EAROF ODEEC WIREE");
  });

  it("matches the published regular example (five nulls, QKJEU, filling the last row)", () => {
    const worked = columnar(`${MESSAGE} QKJEU`, "ZEBRAS");
    expect(worked.rows).toEqual(["WEARED", "ISCOVE", "REDFLE", "EATONC", "EQKJEU"]);
    expect(inGroups(worked.output)).toBe("EVLNE ACDTK ESEAQ ROFOJ DEECU WIREE");
  });

  it("matches the published double transposition and the page's first example", () => {
    expect(inGroups(columnar(columnar(MESSAGE, "ZEBRAS").output, "STRIPE").output)).toBe("CAEEN SOIAE DRLEF WEDRE EVTOC");
    expect(inGroups(columnar("THIS IS WIKIPEDIA", "CIPHER").output)).toBe("TWDIP SIHII IKASE");
  });

  it("deciphers all of them", () => {
    expect(columnar("EVLNA CDTES EAROF ODEEC WIREE", "ZEBRAS", "decipher").output).toBe("WEAREDISCOVEREDFLEEATONCE");
    expect(columnar("EVLNE ACDTK ESEAQ ROFOJ DEECU WIREE", "ZEBRAS", "decipher").output).toBe("WEAREDISCOVEREDFLEEATONCEQKJEU");
    const twice = columnar(columnar("CAEEN SOIAE DRLEF WEDRE EVTOC", "STRIPE", "decipher").output, "ZEBRAS", "decipher");
    expect(twice.output).toBe("WEAREDISCOVEREDFLEEATONCE");
    expect(twice.rows.at(-1)).toBe("E");
  });

  it("fills the last row when asked", () => {
    const worked = columnar("attack at dawn", "KEY", "encipher", { pad: "x" });
    expect(worked.rows).toEqual(["ATT", "ACK", "ATD", "AWN"]);
    expect(columnar("abcd", "KEY", "encipher", { pad: "x" }).rows).toEqual(["ABC", "DXX"]);
    expect(() => columnar("abcd", "KEY", "encipher", { pad: "7" })).toThrow(CipherError);
  });

  it("round-trips any text with any key", () => {
    for (const text of [...AWKWARD, MESSAGE]) {
      const prepared = reduce(text, { digits: true }).text;
      for (const key of ["ZEBRAS", "AB", "BA", "TOMATO", "aaaa", "Oculorhinolaryngology"]) {
        const enciphered = columnar(text, key);
        expect(enciphered.output).toHaveLength(prepared.length);
        expect(columnar(enciphered.output, key, "decipher").output).toBe(prepared);
      }
    }
  });

  it("needs a key of at least two letters", () => {
    expect(() => columnar("abc", "A")).toThrow(/at least two letters/);
    expect(() => columnar("abc", "12")).toThrow(CipherError);
  });
});

describe("one-time pad", () => {
  // https://en.wikipedia.org/wiki/One-time_pad (revision 1385690660).
  it("matches the published example, number by number", () => {
    const worked = oneTimePad("hello", "XMCKL");
    expect(worked.output).toBe("EQNVZ");
    expect(worked.steps.map((step) => step.sum)).toEqual([30, 16, 13, 21, 25]);
    expect(worked.used).toBe(5);
    const back = oneTimePad("EQNVZ", "XMCKL", "decipher");
    expect(back.output).toBe("HELLO");
    expect(back.steps.map((step) => step.sum)).toEqual([-19, 4, 11, 11, 14]);
  });

  it("shows why it cannot be broken: another pad gives another message", () => {
    expect(oneTimePad("EQNVZ", "TQURI", "decipher").output).toBe("LATER");
  });

  it("refuses a pad shorter than the message, and never repeats one", () => {
    expect(() => oneTimePad("hello world", "XMCKL")).toThrow(/10 letters and the pad only 5/);
    expect(() => oneTimePad("a", "")).toThrow(CipherError);
    expect(oneTimePad("", "").output).toBe("");
    // Spaces and grouping in the pad are not letters of the pad.
    expect(oneTimePad("hello", "XM CK-L 99").output).toBe("EQNVZ");
    expect(oneTimePad("hi", "XMCKL").used).toBe(2);
  });

  it("round-trips any text with a pad long enough", () => {
    const pad = randomLetters(600);
    for (const text of AWKWARD) {
      const prepared = reduce(text).text;
      const enciphered = oneTimePad(text, pad);
      expect(enciphered.output).toHaveLength(prepared.length);
      expect(oneTimePad(enciphered.output, pad, "decipher").output).toBe(prepared);
    }
  });
});

describe("letters for a pad", () => {
  it("come from the bytes it is given, with the top of the range thrown away so that no letter is favoured", () => {
    const supply = [0, 25, 26, 233, 234, 255, 51];
    let at = 0;
    const fill = (bytes: Uint8Array) => {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = supply[at % supply.length]!;
        at += 1;
      }
    };
    // 0 → A, 25 → Z, 26 → A, 233 → Z (233 = 8 × 26 + 25), 234 and 255 skipped, 51 → Z.
    expect(randomLetters(5, fill)).toBe("AZAZZ");
  });

  it("uses every byte value below 234 evenly", () => {
    const counts = new Map<string, number>();
    let next = 0;
    const fill = (bytes: Uint8Array) => {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = next % 256;
        next += 1;
      }
    };
    for (const character of randomLetters(234, fill)) counts.set(character, (counts.get(character) ?? 0) + 1);
    expect(counts.size).toBe(26);
    expect(new Set(counts.values())).toEqual(new Set([9]));
  });

  it("uses the browser's cryptographic source by default", () => {
    const letters = randomLetters(2000);
    expect(letters).toMatch(/^[A-Z]{2000}$/);
    expect(new Set(letters).size).toBe(26);
    expect(randomLetters(2000)).not.toBe(letters);
    expect(randomLetters(0)).toBe("");
    expect(() => randomLetters(-1)).toThrow(CipherError);
  });
});
