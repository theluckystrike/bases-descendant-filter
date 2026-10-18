import { Modal, type App } from 'obsidian';
export class RouteModal extends Modal {
 constructor(app: App, private paths: string[]) { super(app); }
 onOpen(): void {
  this.titleEl.setText('Route through parent links'); this.contentEl.empty(); this.modalEl.addClass('bdf-route');
  this.contentEl.createEl('p', { text: 'One shortest route through the selected parent property. Other routes can exist.' });
  const list = this.contentEl.createEl('ol');
  for (const path of this.paths) {
   const link = list.createEl('li').createEl('a', { text: path, href: path, cls: 'internal-link' });
   link.addEventListener('click', (event) => { event.preventDefault(); void this.app.workspace.openLinkText(path, '', event.ctrlKey || event.metaKey); });
  }
 }
 onClose(): void { this.contentEl.empty(); }
}
