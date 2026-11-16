/**
 * Test-only: small XML documents, and whether each is well-formed.
 *
 * `wellFormed` is what XML 1.0 and "Namespaces in XML" say, and what the GPX reader
 * must decide. Each verdict here was also the verdict of `saxes`, a strict parser, when
 * this table was written.
 *
 * `before` records what the reader before this one did with the same document. It
 * built a tree with `@xmldom/xmldom`, which let through a number of things that are not
 * XML and refused a byte-order mark. That reader is gone; the column was checked
 * against it in the commit that added this file, and is kept as the record of what
 * changed for people's files.
 */
export interface WellFormedCase {
  what: string;
  xml: string;
  wellFormed: boolean;
  before: "read" | "refused";
}

export const WELL_FORMED_CASES: WellFormedCase[] = [
  {
    what: "a plain document",
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n<gpx><wpt lat="1" lon="2"/></gpx>\n',
    wellFormed: true,
    before: "read",
  },
  { what: "no XML declaration", xml: '<gpx><wpt lat="1" lon="2"/></gpx>', wellFormed: true, before: "read" },
  {
    what: "a byte-order mark before the declaration",
    xml: '\ufeff<?xml version="1.0"?><gpx><wpt lat="1" lon="2"/></gpx>',
    wellFormed: true,
    before: "refused",
  },
  { what: "a byte-order mark and no declaration", xml: '\ufeff<gpx><wpt lat="1" lon="2"/></gpx>', wellFormed: true, before: "refused" },
  {
    what: "white space before the root, without a declaration",
    xml: '  \n<gpx><wpt lat="1" lon="2"/></gpx>',
    wellFormed: true,
    before: "read",
  },
  {
    what: "a declaration with encoding and standalone",
    xml: "<?xml version='1.0' encoding='utf-8' standalone='yes'?><gpx/>",
    wellFormed: true,
    before: "read",
  },
  { what: "a declaration that says version 1.1", xml: '<?xml version="1.1"?><gpx/>', wellFormed: true, before: "read" },
  {
    what: "comments and processing instructions around the root",
    xml: "<!-- before --><?app note?><gpx/><!-- after --><?app?>\n",
    wellFormed: true,
    before: "read",
  },
  { what: "single-quoted attributes, and quotes of the other kind inside", xml: "<gpx a='\"' b=\"'\"/>", wellFormed: true, before: "read" },
  {
    what: "white space inside tags",
    xml: '<gpx\n\tversion="1.1"\n><wpt\tlat = "1"\r\nlon\n=\n"2"\n/></gpx\n>',
    wellFormed: true,
    before: "read",
  },
  {
    what: "the five entities and numbered characters",
    xml: '<gpx><wpt lat="1" lon="2"><name>&amp;&lt;&gt;&quot;&apos;&#65;&#x42;&#x1F600;</name></wpt></gpx>',
    wellFormed: true,
    before: "read",
  },
  { what: "entities in an attribute", xml: '<gpx a="&amp;&#49;&lt;"/>', wellFormed: true, before: "read" },
  { what: "> on its own in text", xml: '<gpx><wpt lat="1" lon="2"><name>a > b</name></wpt></gpx>', wellFormed: true, before: "read" },
  { what: "]] and ]> in text", xml: '<gpx><wpt lat="1" lon="2"><name>a ]] b ]> c</name></wpt></gpx>', wellFormed: true, before: "read" },
  {
    what: "CDATA holding markup characters",
    xml: '<gpx><wpt lat="1" lon="2"><name><![CDATA[A & B <c> ]] ]]></name></wpt></gpx>',
    wellFormed: true,
    before: "read",
  },
  {
    what: "an empty CDATA section",
    xml: '<gpx><wpt lat="1" lon="2"><name><![CDATA[]]></name></wpt></gpx>',
    wellFormed: true,
    before: "read",
  },
  {
    what: "prefixed elements with their prefix declared",
    xml: '<g:gpx xmlns:g="urn:g"><g:wpt lat="1" lon="2"/></g:gpx>',
    wellFormed: true,
    before: "read",
  },
  {
    what: "a prefix declared on the element that uses it",
    xml: '<gpx><x:a xmlns:x="urn:x" x:b="1"/></gpx>',
    wellFormed: true,
    before: "read",
  },
  { what: "the xml prefix, which needs no declaration", xml: '<gpx xml:lang="en"/>', wellFormed: true, before: "read" },
  { what: "a default namespace taken away again", xml: '<gpx xmlns="urn:g"><a xmlns=""/></gpx>', wellFormed: true, before: "read" },
  { what: "names beyond ASCII", xml: "<gpx><n\u00e4me>Z\u00fcrich</n\u00e4me><\u540d\u524d/></gpx>", wellFormed: true, before: "read" },
  { what: "names with digits, dots, dashes and underscores", xml: "<gpx><_a-b.c1/></gpx>", wellFormed: true, before: "read" },
  { what: "carriage returns", xml: "<gpx>\r\n<a>x\ry</a>\r\n</gpx>\r\n", wellFormed: true, before: "read" },
  {
    what: "a tab, and characters beyond the basic plane",
    xml: "<gpx><a>\t\ud83d\ude00 \ud87e\udc1a</a></gpx>",
    wellFormed: true,
    before: "read",
  },
  { what: "an empty comment", xml: "<gpx><!----></gpx>", wellFormed: true, before: "read" },
  { what: "a processing instruction with nothing after its name", xml: "<gpx><?app?></gpx>", wellFormed: true, before: "read" },
  { what: "a closing tag with white space before its end", xml: "<gpx><a></a ></gpx >", wellFormed: true, before: "read" },
  { what: "nothing at all", xml: "", wellFormed: false, before: "refused" },
  { what: "only white space", xml: "  \n ", wellFormed: false, before: "refused" },
  { what: "words, not XML", xml: "just some notes about a walk", wellFormed: false, before: "refused" },
  { what: "white space before the XML declaration", xml: ' <?xml version="1.0"?><gpx/>', wellFormed: false, before: "refused" },
  { what: "a comment before the XML declaration", xml: '<!-- c --><?xml version="1.0"?><gpx/>', wellFormed: false, before: "refused" },
  { what: "an XML declaration inside the document", xml: '<gpx><?xml version="1.0"?></gpx>', wellFormed: false, before: "refused" },
  { what: "an XML declaration without a version", xml: '<?xml encoding="UTF-8"?><gpx/>', wellFormed: false, before: "refused" },
  { what: "a processing instruction called XML", xml: "<gpx><?XML x?></gpx>", wellFormed: false, before: "refused" },
  { what: "a processing instruction without a name", xml: "<gpx><? x?></gpx>", wellFormed: false, before: "refused" },
  { what: "a processing instruction that never ends", xml: "<gpx><?app </gpx>", wellFormed: false, before: "refused" },
  { what: "an element that is never closed", xml: "<gpx><wpt lat='1' lon='2'>", wellFormed: false, before: "refused" },
  { what: "only an opening tag", xml: "<gpx>", wellFormed: false, before: "refused" },
  { what: "closing tags in the wrong order", xml: "<gpx><a><b></a></b></gpx>", wellFormed: false, before: "refused" },
  { what: "a closing tag that differs in case", xml: "<gpx><a></A></gpx>", wellFormed: false, before: "refused" },
  { what: "a closing tag with nothing open", xml: "<gpx/></gpx>", wellFormed: false, before: "read" },
  { what: "a closing tag with an attribute", xml: '<gpx></gpx a="1">', wellFormed: false, before: "refused" },
  { what: "two root elements", xml: "<gpx/><gpx/>", wellFormed: false, before: "refused" },
  { what: "text after the root", xml: "<gpx/>trailing", wellFormed: false, before: "refused" },
  { what: "text before the root", xml: "x<gpx/>", wellFormed: false, before: "refused" },
  { what: "CDATA outside the root", xml: "<![CDATA[x]]><gpx/>", wellFormed: false, before: "refused" },
  { what: "a space after <", xml: "< gpx/>", wellFormed: false, before: "refused" },
  { what: "a name that starts with a digit", xml: "<gpx><1a/></gpx>", wellFormed: false, before: "refused" },
  { what: "a name that starts with a dash", xml: "<gpx><-a/></gpx>", wellFormed: false, before: "refused" },
  { what: "< in text", xml: '<gpx><wpt lat="1" lon="2"><name>a < b</name></wpt></gpx>', wellFormed: false, before: "refused" },
  { what: "< in an attribute", xml: '<gpx a="<"/>', wellFormed: false, before: "refused" },
  {
    what: "& on its own in text",
    xml: '<gpx><wpt lat="1" lon="2"><name>Fish & chips</name></wpt></gpx>',
    wellFormed: false,
    before: "read",
  },
  { what: "& on its own in an attribute", xml: '<gpx a="a & b"/>', wellFormed: false, before: "read" },
  {
    what: "an entity without its semicolon",
    xml: '<gpx><wpt lat="1" lon="2"><name>a &amp b</name></wpt></gpx>',
    wellFormed: false,
    before: "refused",
  },
  {
    what: "an entity XML does not define",
    xml: '<gpx><wpt lat="1" lon="2"><name>a&nbsp;b</name></wpt></gpx>',
    wellFormed: false,
    before: "refused",
  },
  { what: "an unknown entity in an attribute", xml: '<gpx a="&nope;"/>', wellFormed: false, before: "refused" },
  { what: "character number zero", xml: '<gpx><wpt lat="1" lon="2"><name>&#0;</name></wpt></gpx>', wellFormed: false, before: "read" },
  {
    what: "a control character by number",
    xml: '<gpx><wpt lat="1" lon="2"><name>&#8;</name></wpt></gpx>',
    wellFormed: false,
    before: "read",
  },
  {
    what: "half a character by number",
    xml: '<gpx><wpt lat="1" lon="2"><name>&#xD800;</name></wpt></gpx>',
    wellFormed: false,
    before: "read",
  },
  {
    what: "a character number past the end of Unicode",
    xml: '<gpx><wpt lat="1" lon="2"><name>&#x110000;</name></wpt></gpx>',
    wellFormed: false,
    before: "read",
  },
  { what: "an empty character number", xml: '<gpx><wpt lat="1" lon="2"><name>&#;</name></wpt></gpx>', wellFormed: false, before: "read" },
  { what: "a control character", xml: '<gpx><wpt lat="1" lon="2"><name>a\u0001b</name></wpt></gpx>', wellFormed: false, before: "read" },
  { what: "a NUL", xml: '<gpx><wpt lat="1" lon="2"><name>a\u0000b</name></wpt></gpx>', wellFormed: false, before: "read" },
  {
    what: "a character XML does not allow (U+FFFE)",
    xml: '<gpx><wpt lat="1" lon="2"><name>a\ufffeb</name></wpt></gpx>',
    wellFormed: false,
    before: "read",
  },
  { what: "]]> in text", xml: '<gpx><wpt lat="1" lon="2"><name>a ]]> b</name></wpt></gpx>', wellFormed: false, before: "read" },
  {
    what: "a CDATA section that never ends",
    xml: '<gpx><wpt lat="1" lon="2"><name><![CDATA[A</name></wpt></gpx>',
    wellFormed: false,
    before: "refused",
  },
  { what: "a comment that never ends", xml: "<gpx><!-- </gpx>", wellFormed: false, before: "refused" },
  { what: "-- inside a comment", xml: "<gpx><!-- a -- b --></gpx>", wellFormed: false, before: "refused" },
  { what: "a comment ending in --->", xml: "<gpx><!-- a ---></gpx>", wellFormed: false, before: "refused" },
  { what: "a declaration that is not a comment or CDATA", xml: "<gpx><!foo></gpx>", wellFormed: false, before: "refused" },
  { what: "an attribute given twice", xml: '<gpx><wpt lat="1" lat="3" lon="2"/></gpx>', wellFormed: false, before: "refused" },
  { what: "attributes with no space between them", xml: '<gpx><wpt lat="1"lon="2"/></gpx>', wellFormed: false, before: "read" },
  { what: "an attribute value without quotes", xml: "<gpx><wpt lat=1 lon=2/></gpx>", wellFormed: false, before: "read" },
  { what: "an attribute without a value", xml: '<gpx><wpt lat="1" lon="2" hidden/></gpx>', wellFormed: false, before: "read" },
  { what: "an attribute value that never ends", xml: '<gpx a="1/>', wellFormed: false, before: "refused" },
  { what: "a space between / and >", xml: '<gpx><wpt lat="1" lon="2" / ></gpx>', wellFormed: false, before: "read" },
  {
    what: "an element prefix that was never declared",
    xml: "<gpx><extensions><foo:bar>1</foo:bar></extensions></gpx>",
    wellFormed: false,
    before: "refused",
  },
  { what: "an attribute prefix that was never declared", xml: '<gpx xsi:schemaLocation="a b"/>', wellFormed: false, before: "refused" },
  {
    what: "a prefix used outside the element that declared it",
    xml: '<gpx><a xmlns:x="urn:x"/><x:b/></gpx>',
    wellFormed: false,
    before: "refused",
  },
  { what: "a name with two colons", xml: "<gpx><a:b:c/></gpx>", wellFormed: false, before: "refused" },
  { what: "a name that starts with a colon", xml: "<gpx><:a/></gpx>", wellFormed: false, before: "refused" },
  { what: "a name that ends with a colon", xml: "<gpx><a:/></gpx>", wellFormed: false, before: "refused" },
  { what: "a prefix declared as nothing", xml: '<gpx xmlns:a=""/>', wellFormed: false, before: "read" },
  { what: "the prefix xmlns declared", xml: '<gpx xmlns:xmlns="urn:x"/>', wellFormed: false, before: "read" },
  { what: "the xml prefix declared as something else", xml: '<gpx xmlns:xml="urn:x"/>', wellFormed: false, before: "read" },
  {
    what: "the same attribute twice under two prefixes for one namespace",
    xml: '<gpx xmlns:a="urn:x" xmlns:b="urn:x" a:k="1" b:k="2"/>',
    wellFormed: false,
    before: "read",
  },
];
