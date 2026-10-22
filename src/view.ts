import { BasesView, normalizePath, parseLinktext, parsePropertyId, type BasesAllOptions, type BasesEntry, type QueryController } from 'obsidian';
import { descendantRoute, findDescendants, parentLinkTexts, type ParentNode, type ReachableNote } from './core/index';
import { formulaRoot, baseSourcePath } from './root';
import type BasesDescendantFilterPlugin from './main';
const ROOT_NOTE_LABEL = 'Root note';
export const VIEW_ID = 'bases-descendant-filter';
export const KEY = { rootFormula: 'descendantRootFormula', root: 'descendantRoot', parent: 'descendantParent', includeRoot: 'descendantIncludeRoot' };
export function viewOptions(): BasesAllOptions[] {
 return [
  { type: 'formula', key: KEY.rootFormula, displayName: 'Root formula', placeholder: 'this.file' },
  { type: 'file', key: KEY.root, displayName: ROOT_NOTE_LABEL, placeholder: 'Choose a Markdown note', filter: (file) => file.extension === 'md' },
  { type: 'property', key: KEY.parent, displayName: 'Parent property', default: 'note.parents', filter: (property) => property.startsWith('note.') },
  { type: 'toggle', key: KEY.includeRoot, displayName: 'Include the root if it matches the query', default: false },
 ];
}
export class DescendantView extends BasesView {
 type = VIEW_ID;
 readonly containerEl: HTMLElement;
 found: ReachableNote[] = [];
 matches: BasesEntry[] = [];
 private root = '';
 private page = 0;
 private disposed = false;
 private timer: number | null = null;
 constructor(controller: QueryController, container: HTMLElement, private plugin: BasesDescendantFilterPlugin) {
  super(controller); this.containerEl = container.createDiv({ cls: 'bases-descendant-filter' });
  const refresh = () => {
   if (this.timer !== null) window.clearTimeout(this.timer);
   this.timer = window.setTimeout(() => { this.timer = null; this.onDataUpdated(); }, 150);
  };
  this.registerEvent(plugin.app.metadataCache.on('changed', refresh));
  this.registerEvent(plugin.app.metadataCache.on('resolved', refresh));
  this.registerEvent(plugin.app.metadataCache.on('deleted', refresh));
  this.registerEvent(plugin.app.vault.on('rename', refresh));
  const refreshFormula = () => {
   const formula = this.config?.get(KEY.rootFormula);
   if (typeof formula === 'string' && formula.trim()) refresh();
  };
  this.registerEvent(plugin.app.workspace.on('active-leaf-change', refreshFormula));
  this.registerEvent(plugin.app.workspace.on('file-open', refreshFormula));
  this.register(() => { this.disposed = true; if (this.timer !== null) window.clearTimeout(this.timer); this.containerEl.remove(); });
  if (plugin.pro) this.register(plugin.pro.onChange(() => this.onDataUpdated()));
 }
 onDataUpdated(): void {
  if (this.disposed || !this.data) return;
  this.containerEl.empty(); this.matches = []; this.found = [];
  const rawRoot = this.config.get(KEY.root);
  const formula = this.config.get(KEY.rootFormula);
  const fromFormula = typeof formula === 'string' && formula.trim().length > 0;
  const file = fromFormula
   ? formulaRoot(this.app, this.config.getEvaluatedFormula(this, KEY.rootFormula), baseSourcePath(this.app, this.containerEl))
   : typeof rawRoot === 'string' && rawRoot.trim() ? this.app.vault.getFileByPath(normalizePath(rawRoot)) ?? this.app.metadataCache.getFirstLinkpathDest(rawRoot, '') : null;
  const rootPath = file?.extension === 'md' ? file.path : '';
  if (rootPath !== this.root) this.page = 0;
  this.root = rootPath;
  if (fromFormula && !rootPath) {
   this.containerEl.createEl('p', { text: `The root formula gives no Markdown note here. Embed the base in a note, or use ${ROOT_NOTE_LABEL}.` }); return;
  }
  const property = this.config.getAsPropertyId(KEY.parent) ?? (this.config.get(KEY.parent) == null ? 'note.parents' : null);
  if (!file || file.extension !== 'md' || !property || !property.startsWith('note.')) {
   this.containerEl.createEl('p', { text: 'Choose a root note and a note parent property in the view options.' }); return;
  }
  this.root = file.path;
  const key = parsePropertyId(property).name, nodes: ParentNode[] = [];
  let unresolved = 0, invalid = 0, pending = 0;
  for (const note of this.app.vault.getMarkdownFiles()) {
   const cache = this.app.metadataCache.getFileCache(note);
   if (!cache) { pending++; continue; }
   const raw: unknown = cache.frontmatter?.[key]; const parsed = parentLinkTexts(raw); invalid += parsed.invalid;
   const parents: string[] = [];
   for (const link of parsed.links) {
    const path = parseLinktext(link).path;
    const parent = path ? this.app.metadataCache.getFirstLinkpathDest(path, note.path) : null;
    if (parent?.extension === 'md') parents.push(parent.path); else unresolved++;
   }
   nodes.push({ path: note.path, parents });
  }
  this.found = findDescendants(this.root, nodes);
  const reachable = new Map(this.found.map((note) => [note.path, note]));
  const seen = new Set<string>();
  for (const group of this.data.groupedData) for (const entry of group.entries) {
   const path = entry.file.path;
   if (!seen.has(path) && reachable.has(path) && (path !== this.root || this.config.get(KEY.includeRoot) === true)) { seen.add(path); this.matches.push(entry); }
  }
  this.page = Math.min(this.page, Math.max(0, Math.ceil(this.matches.length / 100) - 1));
  const toolbar = this.containerEl.createDiv({ cls: 'bdf-toolbar' });
  toolbar.createSpan({ cls: 'bdf-title', text: `${file.basename} · ${fromFormula ? 'from root formula · ' : ''}${this.matches.length} matching notes` });
  this.containerEl.createEl('p', { cls: 'bdf-scope', text: `Parent property: ${key}. Notes can have more than one parent. Body links do not define a parent.` });
  this.containerEl.createEl('p', { cls: 'bdf-scope', text: 'Bases query order stays in the output. Routes can pass through notes outside that query.' });
  if (unresolved || invalid || pending) this.containerEl.createEl('p', { cls: 'bdf-warning', text: `Vault parent scan: ${unresolved} unresolved links · ${invalid} invalid values · ${pending} notes waiting for metadata. Unresolved links and invalid values cannot form an edge.` });
  if (!this.matches.length) { this.containerEl.createEl('p', { text: 'No descendants match the visible query.' }); return; }
  if (this.matches.length > 100) {
   const previous = toolbar.createEl('button', { text: 'Previous notes' }); previous.disabled = this.page === 0;
   previous.addEventListener('click', () => { this.page--; this.onDataUpdated(); });
   toolbar.createSpan({ text: `${this.page * 100 + 1}–${Math.min((this.page + 1) * 100, this.matches.length)} of ${this.matches.length}` });
   const next = toolbar.createEl('button', { text: 'Next notes' }); next.disabled = (this.page + 1) * 100 >= this.matches.length;
   next.addEventListener('click', () => { this.page++; this.onDataUpdated(); });
  }
  const order = this.config.getOrder().filter((prop) => prop !== 'file.name');
  const table = this.containerEl.createEl('table'), header = table.createEl('thead').createEl('tr');
  for (const name of ['Note', 'Depth', ...order.map((prop) => this.config.getDisplayName(prop)), 'Route']) header.createEl('th', { text: name, attr: { scope: 'col' } });
  const body = table.createEl('tbody');
  for (const entry of this.matches.slice(this.page * 100, (this.page + 1) * 100)) {
   const path = entry.file.path, tr = body.createEl('tr'); tr.dataset.path = path;
   const link = tr.createEl('td').createEl('a', { text: entry.file.basename, href: path, cls: 'internal-link' });
   link.addEventListener('click', (event) => { event.preventDefault(); void this.app.workspace.openLinkText(path, '', event.ctrlKey || event.metaKey); });
   tr.createEl('td', { text: String(reachable.get(path)!.depth) });
   for (const prop of order) tr.createEl('td', { text: entry.getValue(prop)?.toString() ?? '' });
   tr.createEl('td').createEl('button', { text: this.plugin.pro?.isPro() ? 'Explain route' : 'Explain route (Pro)' }).addEventListener('click', () => this.plugin.showRoute(descendantRoute(this.root, path, this.found)));
  }
 }
}
