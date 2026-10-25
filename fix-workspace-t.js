const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'app', 'page.tsx');
let page = fs.readFileSync(pagePath, 'utf8');

const oldFn = `function WorkspaceToolPreview({
  icon,
  title,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (`;

const newFn = `function WorkspaceToolPreview({
  icon,
  title,
  href,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (`;

if (!page.includes(oldFn)) {
  console.log('WARNING - WorkspaceToolPreview anchor not found, nothing changed.');
} else {
  page = page.split(oldFn).join(newFn);
  fs.writeFileSync(pagePath, page, 'utf8');
  console.log('Patched app/page.tsx - added useLanguage() to WorkspaceToolPreview');
}
