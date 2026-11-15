// PHASE-3C: atomic save of the investor document. The old save read the revision, compared, then wrote: two requests could both
// pass the comparison. `user:{id}:investor:rev` now holds the revision (missing = taken from the stored document once), and ONE
// Lua step compares it and writes, so exactly one of two requests with the same baseRevision succeeds. Document format and key unchanged.
export const investorKey = (userId: string) => `user:${userId}:investor`;
export const investorRevKey = (userId: string) => `user:${userId}:investor:rev`;

/** KEYS: doc, rev. ARGV: expected revision, new document JSON. Returns 1 written, 0 someone else saved first. */
export const INVESTOR_WRITE_SCRIPT = `
local rev = redis.call('GET', KEYS[2])
if rev then
  rev = tonumber(rev)
else
  rev = 0
  local raw = redis.call('GET', KEYS[1])
  if raw then
    local ok, d = pcall(cjson.decode, raw)
    if ok and type(d) == 'table' and type(d.revision) == 'number' then rev = d.revision end
  end
end
if rev ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(rev + 1))
return 1
`;

export type InvestorRedis = { eval: (script: string, keys: string[], args: string[]) => Promise<unknown> };

/** Writes `next` only if the stored revision is still `expectedRevision`. */
export async function writeInvestor(redis: InvestorRedis, userId: string, next: { revision: number }, expectedRevision: number): Promise<boolean> {
  return Number(await redis.eval(INVESTOR_WRITE_SCRIPT, [investorKey(userId), investorRevKey(userId)], [String(expectedRevision), JSON.stringify(next)])) === 1;
}
