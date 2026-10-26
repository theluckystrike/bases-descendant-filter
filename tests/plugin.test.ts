import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, BasesViewConfig, StringValue, Modal, FileValue, LinkValue, ListValue, NullValue, NumberValue } from 'obsidian-test-mocks/obsidian';
import { findDescendants, descendantRoute, parentLinkTexts } from '../src/core/index';
import vectors from './vectors/bases-descendant-filter.json';
import { formulaRoot } from '../src/root';
import { DescendantView, KEY, viewOptions } from '../src/view';
import BasesDescendantFilterPlugin from '../src/main';
import manifest from '../manifest.json';
import whatsNew from '../src/whats-new.json';
const views: DescendantView[] = [];
const plugins: BasesDescendantFilterPlugin[] = [];
afterEach(() => { for (const v of views.splice(0)) v.unload(); for (const p of plugins.splice(0)) p.onunload(); document.body.empty(); vi.restoreAllMocks(); });
const files = {
 'Root.md': '# Root',
 'Bridge.md': '---\nparents: "[[Root]]"\n---\nBridge',
 'Leaf.md': '---\nparents: "[[Bridge]]"\nstatus: Ready\n---\nLeaf',
 'Shared.md': '---\nparents:\n  - "[[Other]]"\n  - "[[Bridge]]"\nstatus: Next\n---\nShared',
 'Other.md': '# Other',
 'Mention.md': '# Mention\n\n[[Root]] in the body does not make a parent.',
};
function setup(query = ['Leaf.md', 'Shared.md', 'Mention.md'], fixtures: Record<string, string> = files) {
 const app = App.createConfigured__({ files: fixtures }); const plugin = new BasesDescendantFilterPlugin(app as never, manifest as never);
 plugin.pro = { isPro: () => false, getState: () => ({ status: 'signed-out', lastAttemptAt: 0 }), hasToken: () => false, config: { sponsorLogin: 'theluckystrike' }, onChange: () => () => undefined } as never; plugins.push(plugin);
 const view = plugin.createView({} as never, document.body.createDiv()); view.app = app as never; view.load(); views.push(view);
 const config = BasesViewConfig.create__('', 'bases-descendant-filter', 'Descendants'); config.set(KEY.root, 'Root.md'); config.setOrder(['file.name', 'note.status']); view.config = config as never;
 const entries = query.map(path => ({ file: app.vault.getFileByPath(path)!, getValue: () => new StringValue('Ready') }));
 view.data = { data: entries, groupedData: [{ hasKey: () => false, entries }] } as never; view.onDataUpdated();
 return { app, plugin, view, config, entries };
}
describe('traversal contracts', () => {
 for (const c of vectors.cases) it(c.name, () => expect(findDescendants(c.args[0] as string, c.args[1] as never)).toEqual(c.expected));
 it('parses list links and ignores aliases while retaining a heading target', () => {
  expect(parentLinkTexts(['[[Root#Heading|Alias]]', '[[Other]]', '[[Other]]', 12, 'body text'])).toEqual({ links: ['Root#Heading', 'Other'], invalid: 2 });
  expect(parentLinkTexts(null)).toEqual({ links: [], invalid: 0 });
  expect(parentLinkTexts({ bad: '[[Root]]' })).toEqual({ links: [], invalid: 1 });
 });
 it('uses predecessor pointers on a long chain without storing one full route per note', () => {
  const found = findDescendants('0', Array.from({ length: 5000 }, (_, i) => ({ path: String(i + 1), parents: [String(i)] })));
  expect(found).toHaveLength(5001); expect(found[5000]).toEqual({ path: '5000', depth: 5000, via: '4999' });
  expect(descendantRoute('0', '5000', found)).toHaveLength(5001);
 });
 it('refuses an absent or corrupt route', () => {
  expect(descendantRoute('Root', 'Missing', [])).toEqual([]);
  expect(descendantRoute('Root', 'A', [{ path: 'A', depth: 1, via: 'B' }, { path: 'B', depth: 2, via: 'A' }])).toEqual([]);
 });
});
describe('flat query view', () => {
 it('finds a grandchild through an intermediate outside the query', () => {
  const { view } = setup(); expect(view.matches.map(e => e.file.path)).toEqual(['Leaf.md', 'Shared.md']);
  expect(view.containerEl.querySelectorAll('tbody tr')).toHaveLength(2); expect(view.containerEl.textContent).toContain('2 matching notes');
  expect(view.found.find(n => n.path === 'Leaf.md')?.depth).toBe(2);
 });
 it('follows the second parent and ignores a mention in the note body', () => {
  const { view } = setup(); expect(view.matches.some(e => e.file.path === 'Shared.md')).toBe(true); expect(view.matches.some(e => e.file.path === 'Mention.md')).toBe(false);
 });
 it('keeps visible query order and excludes hidden groups', () => {
  const { view, entries } = setup(['Shared.md', 'Leaf.md']);
  expect(view.matches.map(e => e.file.path)).toEqual(['Shared.md', 'Leaf.md']);
  view.data = { data: entries, groupedData: [{ hasKey: () => true, entries: entries.slice(1) }] } as never; view.onDataUpdated();
  expect(view.matches.map(e => e.file.path)).toEqual(['Leaf.md']);
 });
 it('includes the root only when requested and present in the query', () => {
  const { view, config } = setup(['Root.md', 'Leaf.md']); expect(view.matches).toHaveLength(1);
  config.set(KEY.includeRoot, true); view.onDataUpdated(); expect(view.matches.map(e => e.file.path)).toEqual(['Root.md', 'Leaf.md']);
 });
 it('shows an empty and a configuration state without changing files', () => {
  const { view, config, app } = setup([]); expect(view.containerEl.textContent).toContain('No descendants match');
  config.set(KEY.root, 'Missing.md'); view.onDataUpdated(); expect(view.containerEl.textContent).toContain('Choose a root note'); expect(app.vault.getMarkdownFiles()).toHaveLength(6);
 });
 it('refreshes when a bridge property changes', async () => {
  const { view, app } = setup();
  await app.vault.modify(app.vault.getFileByPath('Bridge.md')!, '---\nparents: "[[Other]]"\n---\nBridge'); view.onDataUpdated();
  expect(view.matches).toHaveLength(0);
 });
 it('guards a route at the paid method boundary and opens the paid path as source links', () => {
  let modal: Modal | undefined;
  vi.spyOn(Modal.prototype, 'constructor__').mockImplementation(function (this: Modal) { modal = this; });
  const { view, plugin } = setup(); const paths = descendantRoute('Root.md', 'Leaf.md', view.found);
  expect(paths).toEqual(['Root.md', 'Bridge.md', 'Leaf.md']); expect(plugin.showRoute(paths)).toBe(false);
  plugin.pro = { isPro: () => true } as never; expect(plugin.showRoute(paths)).toBe(true);
  expect(Array.from(modal!.contentEl.querySelectorAll('a')).map(e => e.textContent)).toEqual(paths);
  const close = vi.spyOn(modal!, 'close'); plugin.onunload(); expect(close).toHaveBeenCalled(); expect(modal!.contentEl.textContent).toBe('');
 });
 it('reports unresolved links, invalid values and pending metadata', () => {
  const { view, app } = setup(undefined, { ...files, 'Bad.md': '---\nparents: ["[[Missing]]", "plain text", false]\n---\nBad' });
  expect(view.containerEl.textContent).toContain('1 unresolved links · 2 invalid values');
  const read = app.metadataCache.getFileCache.bind(app.metadataCache);
  vi.spyOn(app.metadataCache, 'getFileCache').mockImplementation(file => file.path === 'Bridge.md' ? null : read(file));
  view.onDataUpdated(); expect(view.containerEl.textContent).toContain('1 notes waiting for metadata'); expect(view.matches).toHaveLength(0);
 });
 it('paginates display rows without truncating traversal or matches', () => {
  const query = Array.from({ length: 201 }, (_, i) => `R${i}.md`);
  const fixtures = Object.fromEntries(query.map(path => [path, '---\nparents: "[[Root]]"\n---\nNote']));
  const { view } = setup(query, { 'Root.md': '# Root', ...fixtures });
  expect(view.matches).toHaveLength(201); expect(view.containerEl.querySelectorAll('tbody tr')).toHaveLength(100);
  const next = Array.from(view.containerEl.querySelectorAll('button')).find(b => b.textContent === 'Next notes')!; next.click();
  expect(view.containerEl.querySelector('tbody tr')?.getAttribute('data-path')).toBe('R100.md'); expect(view.matches).toHaveLength(201);
 });
 it('does not schedule a later render after the view unloads', () => {
  const { view } = setup(); view.unload(); view.onDataUpdated(); expect(view.containerEl.isConnected).toBe(false);
 });
});

describe('plugin view ownership',()=>{
 it('unloads an open view when the plugin stops',()=>{const{view,plugin}=setup();expect(view.containerEl.isConnected).toBe(true);plugin.onunload();expect(view.containerEl.isConnected).toBe(false);});
});


describe('formula roots', () => {
 it('ships the update text for this release', () => {
  expect(whatsNew.version).toBe(manifest.version);
  expect(whatsNew.changes).toContain('The Pro notice for route explanations now has a Sponsor on GitHub button.');
 });
 it('does not rescan a fixed-root view on workspace navigation', () => {
  vi.useFakeTimers();
  try {
   const { app, config } = setup();
   const scan = vi.spyOn(app.vault, 'getMarkdownFiles');
   for (const formula of [undefined, '', '   ']) {
    config.set(KEY.rootFormula, formula);
    app.workspace.trigger('active-leaf-change', null); app.workspace.trigger('file-open', null);
    vi.advanceTimersByTime(200);
   }
   expect(scan).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
 });
 it('offers an opt-in formula without a default', () => {
  expect(viewOptions().find(o => 'key' in o && o.key === KEY.rootFormula)).toEqual({ type: 'formula', key: KEY.rootFormula, displayName: 'Root formula', placeholder: 'this.file' });
 });
 it('accepts file, link, string and single-item list values', () => {
  const { app } = setup(); const file = app.vault.getFileByPath('Root.md')!;
  const values = [FileValue.create__(app, file), LinkValue.parseFromString(app, '[[Root]]', ''), new StringValue('Root'), new ListValue([new StringValue('Root')])];
  for (const value of values) expect(formulaRoot(app as never, value as never, 'Descendants.base')?.path).toBe('Root.md');
 });
 it('rejects empty, ambiguous, numeric and non-Markdown results', () => {
  const { app } = setup([], { ...files, 'Descendants.base': 'views: []' });
  for (const value of [null, NullValue.value, new StringValue(''), new StringValue(' '), new ListValue([]), new ListValue(['Root', 'Other']), new NumberValue(42), new StringValue('[[Descendants.base]]'), FileValue.create__(app, app.vault.getFileByPath('Descendants.base')!)]) {
   expect(formulaRoot(app as never, value as never, 'Descendants.base')).toBeNull();
  }
 });
 it('resolves link text relative to the base file and removes aliases and headings', () => {
  const { app } = setup(); const resolve = vi.spyOn(app.metadataCache, 'getFirstLinkpathDest');
  formulaRoot(app as never, new StringValue('[[Root#Heading|Name]]') as never, 'Folder/Descendants.base');
  expect(resolve).toHaveBeenCalledWith('Root', 'Folder/Descendants.base');
 });
 it('uses the formula for depth, include-root and Pro route without writing files', () => {
  const { app, view, plugin, config } = setup(['Bridge.md', 'Leaf.md']);
  config.set(KEY.rootFormula, 'this.file'); config.set(KEY.includeRoot, true);
  const evaluate = vi.spyOn(config, 'getEvaluatedFormula').mockReturnValue(FileValue.create__(app, app.vault.getFileByPath('Bridge.md')!));
  const modify = vi.spyOn(app.vault, 'modify'), create = vi.spyOn(app.vault, 'create'), process = vi.spyOn(app.vault, 'process'), frontmatter = vi.spyOn(app.fileManager, 'processFrontMatter');
  view.onDataUpdated();
  expect(evaluate).toHaveBeenCalledWith(view, KEY.rootFormula);
  expect(view.found.find(n => n.path === 'Leaf.md')?.depth).toBe(1);
  expect(view.matches.map(e => e.file.path)).toEqual(['Bridge.md', 'Leaf.md']);
  expect(view.containerEl.textContent).toContain('Bridge · from root formula · 2 matching notes');
  const route = vi.spyOn(plugin, 'showRoute').mockReturnValue(true);
  view.containerEl.querySelectorAll('tbody button')[1]!.dispatchEvent(new MouseEvent('click'));
  expect(route).toHaveBeenCalledWith(['Bridge.md', 'Leaf.md']);
  for (const spy of [modify, create, process, frontmatter]) expect(spy).not.toHaveBeenCalled();
 });
 it('does not fall back for an invalid formula and retains fixed-root behavior for blank formulas', () => {
  const { view, config } = setup(); config.set(KEY.rootFormula, 'this.file');
  const evaluate = vi.spyOn(config, 'getEvaluatedFormula').mockReturnValue(NullValue.value);
  view.onDataUpdated(); expect(view.containerEl.textContent).toContain('The root formula gives no Markdown note here.'); expect(view.containerEl.querySelector('table')).toBeNull();
  config.set(KEY.rootFormula, '  '); evaluate.mockClear(); view.onDataUpdated();
  expect(evaluate).not.toHaveBeenCalled(); expect(view.matches.map(e => e.file.path)).toEqual(['Leaf.md', 'Shared.md']);
 });
 it('keeps evaluated roots separate across instances and refreshes workspace events after 150 ms', () => {
  vi.useFakeTimers();
  try {
   const first = setup(), second = setup();
   first.config.set(KEY.rootFormula, 'this.file'); second.config.set(KEY.rootFormula, 'this.file');
   const a = vi.spyOn(first.config, 'getEvaluatedFormula').mockReturnValue(new StringValue('Root'));
   vi.spyOn(second.config, 'getEvaluatedFormula').mockReturnValue(new StringValue('Other'));
   first.view.onDataUpdated(); second.view.onDataUpdated();
   expect(first.view.matches).toHaveLength(2); expect(second.view.matches.map(e => e.file.path)).toEqual(['Shared.md']);
   a.mockReturnValue(new StringValue('Other'));
   first.app.workspace.trigger('active-leaf-change', null); first.app.workspace.trigger('file-open', null);
   vi.advanceTimersByTime(149); expect(first.view.matches).toHaveLength(2);
   vi.advanceTimersByTime(1); expect(first.view.matches.map(e => e.file.path)).toEqual(['Shared.md']);
   first.view.unload(); a.mockClear(); first.app.workspace.trigger('file-open', null); vi.advanceTimersByTime(150); expect(a).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
 });
 it('resets pagination when the evaluated root changes', () => {
  const query = Array.from({ length: 201 }, (_, i) => `R${i}.md`);
  const fixtures = Object.fromEntries(query.map(path => [path, '---\nparents: ["[[Root]]", "[[Other]]"]\n---\nNote']));
  const { view, config } = setup(query, { 'Root.md': '# Root', 'Other.md': '# Other', ...fixtures });
  config.set(KEY.rootFormula, 'this.file');
  const evaluate = vi.spyOn(config, 'getEvaluatedFormula').mockReturnValue(new StringValue('Root')); view.onDataUpdated();
  Array.from(view.containerEl.querySelectorAll('button')).find(b => b.textContent === 'Next notes')!.click();
  expect(view.containerEl.querySelector('tbody tr')?.getAttribute('data-path')).toBe('R100.md');
  evaluate.mockReturnValue(new StringValue('Other')); view.onDataUpdated();
  expect(view.containerEl.querySelector('tbody tr')?.getAttribute('data-path')).toBe('R0.md');
 });
});
