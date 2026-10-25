// Local parsing only. Short share links (e.tb.cn / m.tb.cn) are resolved by the
// server in api/services/taobao-link.ts, which fetches only those fixed hosts.

const itemHosts = [".taobao.com", ".tmall.com", ".tmall.hk"];
const shortHosts = ["e.tb.cn", "m.tb.cn", "s.tb.cn", "tb.cn"];

/** First link in a pasted text — Taobao «Поделиться» copies a whole sentence. */
function firstLink(value: string): string {
  const input = value.trim();
  const m = input.match(/https?:\/\/[^\s「」【】<>"'，。、）)]+/i);
  if (m) return m[0];
  const bare = input.match(/(?:^|\s)((?:[a-z]\.)?tb\.cn\/h\.[A-Za-z0-9]+[^\s「」]*)/i);
  return bare ? "https://" + bare[1] : input;
}

function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

/** Item id from a full Taobao / Tmall link (or a legacy stored numeric id). */
export function taobaoItemId(value: string): string | null {
  const input = value.trim();
  if (/^\d{1,30}$/.test(input)) return input;
  const url = safeUrl(firstLink(input));
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (!itemHosts.some((h) => host === h.slice(1) || host.endsWith(h)))
    return null;
  const ids = url.searchParams.getAll("id");
  if (ids.length > 1) return null;
  if (ids.length === 1) return /^\d{1,30}$/.test(ids[0]!) ? ids[0]! : null;
  const path = url.pathname.match(/\/(?:item\/|i)(\d{5,30})\.htm/);
  return path ? path[1]! : null;
}

/** Short share link that the server has to open to find the item. */
export function taobaoShortLink(value: string): string | null {
  const url = safeUrl(firstLink(value));
  if (!url || !shortHosts.includes(url.hostname.toLowerCase())) return null;
  return /^\/h\.[A-Za-z0-9]+/.test(url.pathname) ? url.toString() : null;
}

/** Accepted by the editor before saving (short links are checked on save). */
export const taobaoLinkAccepted = (value: string) =>
  !!(taobaoItemId(value) || taobaoShortLink(value));

export const taobaoUrl = (id: string) =>
  `https://item.taobao.com/item.htm?id=${id}`;

/** What the moderator sees in the field: a link, never a bare id. */
export const taobaoDisplay = (value: string) =>
  /^\d{1,30}$/.test(value.trim()) ? taobaoUrl(value.trim()) : value;

export const taobaoInputHelp =
  "Вставьте ссылку на товар Taobao или Tmall — можно прямо из «Поделиться» в приложении Taobao.";
