// the inline CSS of the report page, light and dark, with the muted row style

// the stylesheet text placed inside the page's style element
export const pageStyle = `
:root {
  color-scheme: light dark;
  --background: #ffffff;
  --text: #1c2128;
  --muted-text: #59636e;
  --border: #d1d9e0;
  --surface: #f6f8fa;
  --link: #0969da;
  --critical: #a40e26;
  --high: #c2410c;
  --medium: #9a6700;
  --low: #1a7f37;
  --info: #57606a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0d1117;
    --text: #e6edf3;
    --muted-text: #9198a1;
    --border: #3d444d;
    --surface: #151b23;
    --link: #4493f8;
    --critical: #ff7b72;
    --high: #ffa657;
    --medium: #e3b341;
    --low: #56d364;
    --info: #9198a1;
  }
}
[hidden] { display: none !important; }
body {
  margin: 0;
  padding: 16px;
  background: var(--background);
  color: var(--text);
  font: 14px/1.5 system-ui, sans-serif;
}
a { color: var(--link); }
code { font: 12px ui-monospace, monospace; word-break: break-all; }
h1 { margin: 0 0 12px; font-size: 20px; }
.run-details {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 16px;
  margin: 0 0 12px;
}
.run-details dt { color: var(--muted-text); }
.run-details dd { margin: 0; }
.counts { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 8px; }
.counts ul { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; padding: 0; list-style: none; }
.counts strong { font-size: 18px; }
.counts .severity-critical strong { color: var(--critical); }
.counts .severity-high strong { color: var(--high); }
.counts .severity-medium strong { color: var(--medium); }
.counts .severity-low strong { color: var(--low); }
.origin-line { margin: 0 0 16px; color: var(--muted-text); }
.filters { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.filter { border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
.filter summary { padding: 4px 10px; cursor: pointer; user-select: none; }
.filter-values { display: flex; flex-direction: column; padding: 4px 10px 8px; }
.row-count { margin: 6px 0 0 auto; color: var(--muted-text); }
.table-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 6px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 6px 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
th { background: var(--surface); white-space: nowrap; }
th button { padding: 0; border: 0; background: none; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
th[aria-sort="ascending"] button::after { content: " \\25B2"; }
th[aria-sort="descending"] button::after { content: " \\25BC"; }
tr.finding { cursor: pointer; }
tr.finding:hover { background: var(--surface); }
tr.finding.muted { opacity: 0.55; }
td.empty { color: var(--muted-text); }
.badge { padding: 1px 8px; border: 1px solid currentColor; border-radius: 999px; font-size: 12px; }
.badge.severity-critical { color: var(--critical); }
.badge.severity-high { color: var(--high); }
.badge.severity-medium { color: var(--medium); }
.badge.severity-low { color: var(--low); }
.badge.severity-info { color: var(--info); }
tr.detail td { background: var(--surface); }
.detail-list { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
.detail-list dt { color: var(--muted-text); }
.detail-list dd { margin: 0; }
.detail-list ol, .detail-list ul { margin: 0; padding-left: 20px; }
`
