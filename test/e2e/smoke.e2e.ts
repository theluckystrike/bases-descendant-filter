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
