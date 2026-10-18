import { Notice, Plugin, type QueryController } from 'obsidian';
import { createGitHubSponsors } from './license/github-obsidian';
import type { SponsorsManager } from './license/index';
import { SPONSORS } from './pro';
import { BasesDescendantFilterSettingTab } from './settings';
import { DescendantView, VIEW_ID, viewOptions } from './view';
import { RouteModal } from './route';
export default class BasesDescendantFilterPlugin extends Plugin {
 pro: SponsorsManager | null = null;
 private modal: RouteModal | null = null;
 private disposed = false;
 private views = new Set<DescendantView>();
 createView(controller: QueryController, container: HTMLElement): DescendantView {
  const view = new DescendantView(controller, container, this); this.views.add(view);
  view.register(() => this.views.delete(view)); return view;
 }
 onload(): void {
  this.disposed = false;
  const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this); pro.init(); this.pro = pro;
  const tab = new BasesDescendantFilterSettingTab(this.app, this); this.addSettingTab(tab);
  this.register(pro.onChange(() => { tab.update(); if (!pro.isPro()) this.modal?.close(); }));
  this.registerBasesView(VIEW_ID, { name: 'Descendants', icon: 'git-branch', factory: (controller, container) => this.createView(controller, container), options: viewOptions });
  this.app.workspace.onLayoutReady(() => {
   if (this.disposed) return;
   void pro.refresh(); this.registerInterval(window.setInterval(() => void pro.refresh(), 6 * 60 * 60 * 1000));
  });
 }
 onunload(): void { this.disposed = true; for (const view of this.views) view.unload(); this.views.clear(); this.modal?.close(); this.modal = null; }
 showRoute(paths: string[]): boolean {
  if (this.disposed) return false;
  if (!this.pro?.isPro()) { new Notice('Pro is needed to explain a route. Sign in from the plugin settings.'); return false; }
  if (!paths.length) { new Notice('This route is no longer available.'); return false; }
  this.modal?.close(); this.modal = new RouteModal(this.app, paths); this.modal.open(); return true;
 }
}
