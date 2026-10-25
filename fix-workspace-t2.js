const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'app', 'page.tsx');
let page = fs.readFileSync(pagePath, 'utf8');

// Use a regex instead of an exact string match so CRLF vs LF line endings
// (classic Windows issue) can't cause a silent no-op.
const re = /(function WorkspaceToolPreview\(\{[\s\S]*?\}\) \{\r?\n)(  return \()/;

if (!re.test(page)) {
  console.log('WARNING - WorkspaceToolPreview function header not found, nothing changed.');
} else {
  page = page.replace(re, '$1  const { t } = useLanguage();\n$2');
  fs.writeFileSync(pagePath, page, 'utf8');
  console.log('Patched app/page.tsx - added useLanguage() to WorkspaceToolPreview');
}
