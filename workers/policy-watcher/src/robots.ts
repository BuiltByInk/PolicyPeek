// F5: robots.txt parsing. Group for our product token, else '*'. Longest
// matching rule wins; Allow wins a tie. Supports '*' and '$'.
export const UA_TOKEN = "policypeek-policywatch";

interface Group { agents: string[]; rules: { allow: boolean; path: string }[] }

export function parseRobots(txt: string): Group[] {
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === "disallow" && val === "") continue; // empty Disallow = allow all
      cur.rules.push({ allow: key === "allow", path: val });
    } else lastWasAgent = false;
  }
  return groups;
}

function ruleRegex(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path).split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function isAllowed(robotsTxt: string, pathAndQuery: string, uaToken = UA_TOKEN): boolean {
  const groups = parseRobots(robotsTxt);
  const ua = uaToken.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && ua.startsWith(a)));
  const applicable = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of applicable)
    for (const r of g.rules) {
      if (!ruleRegex(r.path).test(pathAndQuery)) continue;
      const len = r.path.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
    }
  return best ? best.allow : true;
}
