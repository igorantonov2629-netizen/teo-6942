import {
  taobaoInputHelp,
  taobaoItemId,
  taobaoShortLink,
} from "../../shared/taobao";

export class TaobaoLinkProblem extends Error {}

const expired =
  "Короткая ссылка не открылась или устарела. Скопируйте ссылку на товар ещё раз через «Поделиться».";
const notItem =
  "Это ссылка не на товар (например, на магазин). Откройте сам товар и скопируйте ссылку на него.";

/** Where a share page points: a redirect or the page's `var url = '…'`. */
async function target(link: string): Promise<string> {
  const res = await fetch(link, {
    redirect: "manual",
    signal: AbortSignal.timeout(6000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    },
  });
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location)
    return new URL(location, link).toString();
  if (!res.ok) return "";
  const html = (await res.text()).slice(0, 300000);
  return html.match(/var\s+url\s*=\s*'([^']*)'/)?.[1] ?? "";
}

/**
 * Taobao item id from anything a moderator pastes: a full link, the whole
 * «Поделиться» text, or a short e.tb.cn / m.tb.cn link (opened server-side;
 * only those fixed hosts are fetched, redirects are not followed blindly).
 */
export async function resolveTaobaoInput(value: string): Promise<string> {
  const input = value.trim();
  if (!input) return "";
  const local = taobaoItemId(input);
  if (local) return local;
  let link = taobaoShortLink(input);
  if (!link) throw new TaobaoLinkProblem(taobaoInputHelp);
  for (let hop = 0; hop < 3 && link; hop++) {
    let next = "";
    try {
      next = await target(link);
    } catch {
      throw new TaobaoLinkProblem(expired);
    }
    if (!next) throw new TaobaoLinkProblem(expired);
    const id = taobaoItemId(next);
    if (id) return id;
    link = taobaoShortLink(next);
    if (!link) throw new TaobaoLinkProblem(notItem);
  }
  throw new TaobaoLinkProblem(expired);
}
