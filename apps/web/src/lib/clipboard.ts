/**
 * Copies text and says whether it worked. Outpost is often reached over plain HTTP on a
 * home network, where browsers do not offer the clipboard API, so there is an older,
 * selection-based way as well. A caller that is told it failed leaves the text where it
 * can be selected and copied by hand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older way.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
