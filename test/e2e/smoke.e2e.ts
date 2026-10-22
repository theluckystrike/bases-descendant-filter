import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { lastNotice, pluginId, reloadPlugin } from './load';
const note = (parents: string[], kind = 'leaf') => `---\nkind: ${kind}\nparents: ${JSON.stringify(parents.map(p => '[[' + p + ']]'))}\nstatus: Ready\n---\nBody`;
const base = `filters:\n  and:\n    - file.inFolder("DescendantInputs")\n    - kind == "leaf"\nviews:\n  - type: bases-descendant-filter\n    name: Results\n    descendantRoot: DescendantInputs/Root.md\n    descendantParent: note.parents\n    order:\n      - file.name\n      - note.status\n    sort:\n      - property: file.name\n        direction: ASC\n`;
async function paths(): Promise<string[]> {
 return browser.execute(() => Array.from(document.querySelectorAll('.workspace-leaf.mod-active .bases-descendant-filter tbody tr')).map(e => (e as HTMLElement).dataset.path!));
}
async function waitPaths(expected: string[]): Promise<void> {
 await browser.waitUntil(async () => JSON.stringify(await paths()) === JSON.stringify(expected), { timeout: 15000, timeoutMsg: `Expected descendants ${expected.join(', ')}` });
}
describe(`${pluginId} real parent traversal`, function () {
 it('loads and reloads without captured errors', async () => { expect(await reloadPlugin(pluginId)).toEqual({ enabled: true, reloaded: true, errors: [] }); });
 it('finds grandchildren and second-parent links without using body mentions', async () => {
  await obsidianPage.write('DescendantInputs/Root.md', note([], 'root'));
  await obsidianPage.write('DescendantInputs/Other.md', note([], 'root'));
  await obsidianPage.write('DescendantInputs/Bridge.md', note(['Root'], 'stage'));
  await obsidianPage.write('DescendantInputs/Leaf.md', note(['Bridge']));
  await obsidianPage.write('DescendantInputs/Shared.md', note(['Other', 'Bridge']));
  await obsidianPage.write('DescendantInputs/Mention.md', note([]) + '\n[[Root]] in the body only.');
  await obsidianPage.write('Descendants.base', base); await obsidianPage.openFile('Descendants.base');
  await waitPaths(['DescendantInputs/Leaf.md', 'DescendantInputs/Shared.md']);
  expect(await browser.$('.workspace-leaf.mod-active tbody tr td:nth-child(2)').getText()).toBe('2');
 });
 it('updates when a parent outside the query changes', async () => {
  await obsidianPage.write('DescendantInputs/Bridge.md', note(['Other'], 'stage')); await waitPaths([]);
  await obsidianPage.write('DescendantInputs/Bridge.md', note(['Root'], 'stage')); await waitPaths(['DescendantInputs/Leaf.md', 'DescendantInputs/Shared.md']);
 });
 it('handles a cycle without repeating output rows', async () => {
  await obsidianPage.write('DescendantInputs/Root.md', note(['Leaf'], 'root'));
  await waitPaths(['DescendantInputs/Leaf.md', 'DescendantInputs/Shared.md']);
 });
 it('guards the route button while signed out', async () => {
  await browser.executeObsidian(({ app }) => {
   (app as unknown as { plugins: { plugins: Record<string, { pro: { signOut(): void } }> } }).plugins.plugins['bases-descendant-filter']!.pro.signOut();
  });
  await browser.$('.workspace-leaf.mod-active .bases-descendant-filter tbody button').click();
  await browser.waitUntil(async () => (await lastNotice()).includes('Pro is needed to explain a route'), { timeout: 5000 });
  expect(await browser.$('.bdf-route').isExisting()).toBe(false);
 });
 it('shows a Pro route through the hidden intermediate and opens its source', async () => {
  await browser.executeObsidian(async ({ app }) => {
   interface TestPro { opts: { http: () => Promise<unknown> }; refreshNow(): Promise<void> }
   const p = (app as unknown as { plugins: { plugins: Record<string, { pro: TestPro }> } }).plugins.plugins['bases-descendant-filter']!;
   p.pro.opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'test-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
   app.secretStorage.setSecret('bases-descendant-filter-github-token', 'gho_' + '0'.repeat(36)); await p.pro.refreshNow();
  });
  await browser.$('.workspace-leaf.mod-active .bases-descendant-filter tbody button').click(); await browser.$('.bdf-route').waitForExist({ timeout: 5000 });
  const links = await browser.$$('.bdf-route li a'); expect(await links.map(link => link.getText())).toEqual(['DescendantInputs/Root.md', 'DescendantInputs/Bridge.md', 'DescendantInputs/Leaf.md']);
  await links[1]!.click();
  await browser.waitUntil(async () => browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path === 'DescendantInputs/Bridge.md'), { timeout: 10000 });
  await browser.keys('Escape');
 });
 it('removes the custom view when the plugin is disabled',async()=>{
  await obsidianPage.openFile('Descendants.base');
  await browser.$('.workspace-leaf.mod-active .bases-descendant-filter').waitForExist({timeout:10000});
  await browser.executeObsidian(async({app})=>{const plugins=(app as unknown as{plugins:{disablePlugin(id:string):Promise<void>}}).plugins;await plugins.disablePlugin('bases-descendant-filter');});
  await browser.waitUntil(async()=>browser.execute(()=>document.querySelectorAll('.bases-descendant-filter').length===0),{timeout:5000});
  expect(await browser.execute(()=>document.querySelectorAll('.bases-descendant-filter').length)).toBe(0);
 });

});

const formulaBase = `filters:\n  and:\n    - file.inFolder("FormulaInputs")\nviews:\n  - type: bases-descendant-filter\n    name: Results\n    descendantRoot: FormulaInputs/Project A.md\n    descendantRootFormula: this.file\n    descendantParent: note.parents\n    order:\n      - file.name\n    sort:\n      - property: file.name\n        direction: ASC\n`;
async function formulaRows(host: string): Promise<string[]> {
 return browser.execute((name: string) => Array.from(document.querySelectorAll(`[data-formula-host="${name}"] .bases-descendant-filter tbody tr`)).map(row => `${(row as HTMLElement).dataset.path}:${row.children[1]?.textContent}`), host);
}
async function waitFormulaRows(host: string, expected: string[], timeout = 15000): Promise<void> {
 try {
  await browser.waitUntil(async () => JSON.stringify(await formulaRows(host)) === JSON.stringify(expected), { timeout, interval: 50, timeoutMsg: `Expected ${host} descendants ${expected.join(', ')}` });
 } catch (error) {
  const state = await browser.execute(() => Array.from(document.querySelectorAll('.bases-descendant-filter')).map(el => ({ host: el.closest('[data-formula-host]')?.getAttribute('data-formula-host'), text: el.textContent })));
  throw new Error(`${String(error)}; views=${JSON.stringify(state)}`);
 }
}
describe(`${pluginId} contextual root formulas`, function () {
 it('renders Project A descendants at depths one and two in an embed', async () => {
  expect(await reloadPlugin(pluginId)).toEqual({ enabled: false, reloaded: true, errors: [] });
  await obsidianPage.write('FormulaInputs/Project A.md', '# Project A\n\n![[FormulaDescendants.base]]');
  await obsidianPage.write('FormulaInputs/Project B.md', '# Project B\n\n![[FormulaDescendants.base]]');
  await obsidianPage.write('FormulaInputs/Design.md', note(['Project A']));
  await obsidianPage.write('FormulaInputs/Detail.md', note(['Design']));
  await obsidianPage.write('FormulaInputs/B task.md', note(['Project B']));
  await obsidianPage.write('FormulaDescendants.base', formulaBase);
  await browser.executeObsidian(async ({ app }) => {
   const leaf = app.workspace.getLeaf(false);
   await leaf.openFile(app.vault.getFileByPath('FormulaInputs/Project A.md')!, { active: true });
   await leaf.setViewState({ type: 'markdown', state: { file: 'FormulaInputs/Project A.md', mode: 'preview' } });
   leaf.view.containerEl.dataset.formulaHost = 'A';
  });
  await waitFormulaRows('A', ['FormulaInputs/Design.md:1', 'FormulaInputs/Detail.md:2']);
 });
 it('keeps simultaneous embeds of the same base independent', async () => {
  await browser.executeObsidian(async ({ app }) => {
   const leaf = app.workspace.getLeaf('split');
   await leaf.openFile(app.vault.getFileByPath('FormulaInputs/Project B.md')!, { active: true });
   await leaf.setViewState({ type: 'markdown', state: { file: 'FormulaInputs/Project B.md', mode: 'preview' } });
   leaf.view.containerEl.dataset.formulaHost = 'B';
  });
  await waitFormulaRows('B', ['FormulaInputs/B task.md:1']);
  await waitFormulaRows('A', ['FormulaInputs/Design.md:1', 'FormulaInputs/Detail.md:2']);
 });
 it('explains the route from the embedding note with Pro', async () => {
  await browser.executeObsidian(async ({ app }) => {
   interface TestPro { opts: { http: () => Promise<unknown> }; refreshNow(): Promise<void> }
   const p = (app as unknown as { plugins: { plugins: Record<string, { pro: TestPro }> } }).plugins.plugins['bases-descendant-filter']!;
   p.pro.opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'test-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
   app.secretStorage.setSecret('bases-descendant-filter-github-token', 'gho_' + '0'.repeat(36)); await p.pro.refreshNow();
  });
  await browser.$('[data-formula-host="A"] tr[data-path="FormulaInputs/Detail.md"] button').click();
  await browser.$('.bdf-route').waitForExist({ timeout: 5000 });
  expect(await browser.$$('.bdf-route li a').map(link => link.getText())).toEqual(['FormulaInputs/Project A.md', 'FormulaInputs/Design.md', 'FormulaInputs/Detail.md']);
  await browser.keys('Escape');
 });
 it('shows the explicit empty state in a standalone base instead of the fixed fallback', async () => {
  await obsidianPage.openFile('FormulaDescendants.base');
  const view = browser.$('.workspace-leaf.mod-active .bases-descendant-filter');
  await browser.waitUntil(async () => (await view.getText()).includes('The root formula gives no Markdown note here. Embed the base in a note, or use Root note.'), { timeout: 15000 });
  expect(await view.$('table').isExisting()).toBe(false);
 });
 it('follows the active note in a sidebar within one second', async () => {
  await browser.executeObsidian(async ({ app }) => {
   const main = app.workspace.getLeaf(false);
   const side = app.workspace.getRightLeaf(false)!;
   await side.openFile(app.vault.getFileByPath('FormulaDescendants.base')!, { active: false });
   await app.workspace.revealLeaf(side);
   side.view.containerEl.dataset.formulaHost = 'sidebar';
   await main.openFile(app.vault.getFileByPath('FormulaInputs/Project A.md')!, { active: true });
   app.workspace.setActiveLeaf(main, { focus: true });
  });
  await waitFormulaRows('sidebar', ['FormulaInputs/Design.md:1', 'FormulaInputs/Detail.md:2']);
  await obsidianPage.openFile('FormulaInputs/Project B.md');
  await waitFormulaRows('sidebar', ['FormulaInputs/B task.md:1'], 1000);
 });
 it('retains the fixed root with an empty formula', async () => {
  await obsidianPage.write('FormulaFixed.base', formulaBase.replace('descendantRootFormula: this.file', 'descendantRootFormula: ""'));
  await obsidianPage.openFile('FormulaFixed.base');
  await waitPaths(['FormulaInputs/Design.md', 'FormulaInputs/Detail.md']);
  expect(await browser.$('.workspace-leaf.mod-active .bdf-title').getText()).toBe('Project A · 2 matching notes');
 });
});
