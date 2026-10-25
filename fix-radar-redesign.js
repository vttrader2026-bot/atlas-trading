const fs = require('fs');
const path = require('path');

// ---------- 1. lib/i18n.tsx - add new filter label keys ----------
const i18nPath = path.join(__dirname, 'lib', 'i18n.tsx');
let i18n = fs.readFileSync(i18nPath, 'utf8');

function insertIntoRadar(src, dictMarker, block) {
  const idxDict = src.indexOf(dictMarker);
  if (idxDict === -1) throw new Error('dict marker not found: ' + dictMarker);
  const idxRadar = src.indexOf('  radar: {', idxDict);
  if (idxRadar === -1) throw new Error('radar block not found for ' + dictMarker);
  const idxTag = src.indexOf('    tag: {', idxRadar);
  if (idxTag === -1) throw new Error('radar.tag not found for ' + dictMarker);
  return src.slice(0, idxTag) + block + src.slice(idxTag);
}

const enFilterKeys = '    filterAtSupport: "At Support",\n    filterRelativeStrength: "Relative Strength",\n    filterRelativeWeakness: "Relative Weakness",\n';
const arFilterKeys = '    filterAtSupport: "عند الدعم",\n    filterRelativeStrength: "قوة نسبية",\n    filterRelativeWeakness: "ضعف نسبي",\n';
const frFilterKeys = '    filterAtSupport: "Au support",\n    filterRelativeStrength: "Force relative",\n    filterRelativeWeakness: "Faiblesse relative",\n';

i18n = insertIntoRadar(i18n, 'const en: Dict = {', enFilterKeys);
i18n = insertIntoRadar(i18n, 'const ar: Dict = {', arFilterKeys);
i18n = insertIntoRadar(i18n, 'const fr: Dict = {', frFilterKeys);

fs.writeFileSync(i18nPath, i18n, 'utf8');
console.log('Patched lib/i18n.tsx - added radar.filterAtSupport / filterRelativeStrength / filterRelativeWeakness');

// ---------- 2. app/radar/page.tsx - new FILTERS array + premium market list ----------
// NOTE: lib/radar.ts (the stablecoin exclusion list) is intentionally left
// untouched per instruction - no stablecoins added or removed.
const pagePath = path.join(__dirname, 'app', 'radar', 'page.tsx');
let page = fs.readFileSync(pagePath, 'utf8');

// 2a. Replace the FILTERS array
const filtersRe = /const FILTERS: \{[\s\S]*?\];/;
const newFilters = [
  'const FILTERS: { key: RadarTag | "all"; labelKey: string }[] = [',
  '  { key: "all", labelKey: "radar.filterAll" },',
  '  { key: "breakout", labelKey: "radar.filterBreakout" },',
  '  { key: "pullback", labelKey: "radar.filterPullback" },',
  '  { key: "nearLow", labelKey: "radar.filterAtSupport" },',
  '  { key: "outperformBtc", labelKey: "radar.filterRelativeStrength" },',
  '  { key: "underperformBtc", labelKey: "radar.filterRelativeWeakness" },',
  '];',
].join('\n');

if (!filtersRe.test(page)) {
  console.log('WARNING - FILTERS array not found in app/radar/page.tsx, skipped.');
} else {
  page = page.replace(filtersRe, newFilters);
  console.log('Patched app/radar/page.tsx - simplified FILTERS to the 6 spec filters');
}

// 2b. Replace the market-list table block with a premium desktop table +
// compact stacked mobile list, both using a shared RadarLogo component.
const tableRe = /\s*<div className="mt-4 card overflow-hidden">[\s\S]*?<\/table>\s*<\/div>\s*<\/div>/;

const newTableSection = [
  '',
  '            <div className="mt-4 card overflow-hidden">',
  '              {/* Desktop / tablet: compact terminal-style table */}',
  '              <div className="hidden sm:block overflow-x-auto">',
  '                <table className="w-full text-sm min-w-[640px]">',
  '                  <thead className="bg-surface-raised/40 text-text-muted">',
  '                    <tr>',
  '                      <th className="text-left px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.pair")}</th>',
  '                      <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.price")}</th>',
  '                      <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.change24h")}</th>',
  '                      <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.volume")}</th>',
  '                      <th className="text-left px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.conditionHeader")}</th>',
  '                      <th className="text-left px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.setupHeader")}</th>',
  '                      <th className="px-3 py-3" aria-hidden="true" />',
  '                    </tr>',
  '                  </thead>',
  '                  <tbody>',
  '                    {filtered.length === 0 && (',
  '                      <tr>',
  '                        <td colSpan={7} className="text-center py-10 text-text-muted">',
  '                          {t("radar.empty")}',
  '                        </td>',
  '                      </tr>',
  '                    )}',
  '                    {filtered.map((row) => {',
  '                      const positive = row.change >= 0;',
  '                      const base = row.ticker.symbol.replace("USDT", "");',
  '                      return (',
  '                        <tr',
  '                          key={row.ticker.symbol}',
  '                          className="group border-t border-line hover:bg-surface-raised/40 transition-colors"',
  '                        >',
  '                          <td className="px-4 py-3">',
  '                            <Link',
  '                              href={`/analyzer?pair=${encodeURIComponent(row.ticker.symbol.replace("USDT", "/USDT"))}`}',
  '                              className="flex items-center gap-2.5 group-hover:text-gold transition-colors"',
  '                            >',
  '                              <RadarLogo base={base} />',
  '                              <span className="font-data font-medium">{row.ticker.symbol.replace("USDT", "/USDT")}</span>',
  '                            </Link>',
  '                          </td>',
  '                          <td className="px-4 py-3 font-data text-right">',
  '                            ${formatPrice(row.ticker.lastPrice)}',
  '                          </td>',
  '                          <td',
  '                            className={`px-4 py-3 font-data text-right ${',
  '                              positive ? "text-bull" : "text-bear"',
  '                            }`}',
  '                          >',
  '                            {positive ? "+" : ""}',
  '                            {row.change.toFixed(2)}%',
  '                          </td>',
  '                          <td className="px-4 py-3 font-data text-right text-text-muted">',
  '                            ${formatCompact(row.volume)}',
  '                          </td>',
  '                          <td className="px-4 py-3">',
  '                            <ConditionBadge condition={row.condition} label={t(`radar.condition.${row.condition}`)} />',
  '                          </td>',
  '                          <td className="px-4 py-3 text-text-muted">{t(`radar.setup.${row.setup}`)}</td>',
  '                          <td className="px-3 py-3 text-right">',
  '                            <span',
  '                              className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"',
  '                              aria-hidden="true"',
  '                            >',
  '                              {"\\u2192"}',
  '                            </span>',
  '                          </td>',
  '                        </tr>',
  '                      );',
  '                    })}',
  '                  </tbody>',
  '                </table>',
  '              </div>',
  '',
  '              {/* Mobile: compact stacked rows, no horizontal scroll */}',
  '              <div className="sm:hidden divide-y divide-line">',
  '                {filtered.length === 0 && (',
  '                  <div className="text-center py-10 text-sm text-text-muted">{t("radar.empty")}</div>',
  '                )}',
  '                {filtered.map((row) => {',
  '                  const positive = row.change >= 0;',
  '                  const base = row.ticker.symbol.replace("USDT", "");',
  '                  return (',
  '                    <Link',
  '                      key={row.ticker.symbol}',
  '                      href={`/analyzer?pair=${encodeURIComponent(row.ticker.symbol.replace("USDT", "/USDT"))}`}',
  '                      className="flex items-center gap-3 px-4 py-3 active:bg-surface-raised/40 transition-colors"',
  '                    >',
  '                      <RadarLogo base={base} />',
  '                      <div className="min-w-0 flex-1">',
  '                        <div className="flex items-center justify-between gap-2">',
  '                          <span className="font-data text-sm font-medium truncate">',
  '                            {row.ticker.symbol.replace("USDT", "/USDT")}',
  '                          </span>',
  '                          <span className="font-data text-sm">${formatPrice(row.ticker.lastPrice)}</span>',
  '                        </div>',
  '                        <div className="mt-1 flex items-center justify-between gap-2">',
  '                          <div className="flex items-center gap-1.5 min-w-0">',
  '                            <ConditionBadge condition={row.condition} label={t(`radar.condition.${row.condition}`)} />',
  '                            <span className="text-[11px] text-text-muted truncate">{t(`radar.setup.${row.setup}`)}</span>',
  '                          </div>',
  '                          <span',
  '                            className={`font-data text-xs shrink-0 ${positive ? "text-bull" : "text-bear"}`}',
  '                          >',
  '                            {positive ? "+" : ""}',
  '                            {row.change.toFixed(2)}%',
  '                          </span>',
  '                        </div>',
  '                      </div>',
  '                    </Link>',
  '                  );',
  '                })}',
  '              </div>',
  '            </div>',
].join('\n');

if (!tableRe.test(page)) {
  console.log('WARNING - market list table block not found in app/radar/page.tsx, skipped.');
} else {
  page = page.replace(tableRe, newTableSection);
  console.log('Patched app/radar/page.tsx - premium market list (desktop table + mobile stacked rows) with coin logos');
}

// 2c. Append the RadarLogo component at the end of the file
const radarLogoComponent = [
  '',
  'function RadarLogo({ base }: { base: string }) {',
  '  const [imgFailed, setImgFailed] = useState(false);',
  '  if (imgFailed) {',
  '    return (',
  '      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0 font-data bg-surface-raised border border-line">',
  '        {base.slice(0, 3)}',
  '      </span>',
  '    );',
  '  }',
  '  return (',
  '    // eslint-disable-next-line @next/next/no-img-element',
  '    <img',
  '      src={`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`}',
  '      alt={base}',
  '      className="w-7 h-7 rounded-full shrink-0 bg-white object-contain p-0.5"',
  '      onError={() => setImgFailed(true)}',
  '    />',
  '  );',
  '}',
  '',
].join('\n');

if (page.includes('function RadarLogo(')) {
  console.log('RadarLogo component already present, skipped append.');
} else {
  page = page.replace(/\n$/, '') + '\n' + radarLogoComponent;
  console.log('Appended RadarLogo component to app/radar/page.tsx');
}

fs.writeFileSync(pagePath, page, 'utf8');
console.log('Wrote app/radar/page.tsx');
