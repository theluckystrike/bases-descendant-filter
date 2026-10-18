import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, BasesViewConfig, StringValue, Modal } from 'obsidian-test-mocks/obsidian';
import { findDescendants, descendantRoute, parentLinkTexts } from '../src/core/index';
import vectors from './vectors/bases-descendant-filter.json';
import { DescendantView, KEY } from '../src/view';
import BasesDescendantFilterPlugin from '../src/main';
import manifest from '../manifest.json';
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
 plugin.pro = { isPro: () => false, onChange: () => () => undefined } as never; plugins.push(plugin);
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
