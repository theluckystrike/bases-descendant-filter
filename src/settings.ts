import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import type BasesDescendantFilterPlugin from './main';
import { PRO_UI } from './pro';
import { helloSettingItems } from './hello/settings';
export class BasesDescendantFilterSettingTab extends PluginSettingTab {
 declare plugin: BasesDescendantFilterPlugin;
 getSettingDefinitions(): SettingDefinitionItem[] {
 	// The product rows, then the "More from NoteMods" card (packages/hello).
 	return [...this.productSettingDefinitions(), ...helloSettingItems()];
 }

 productSettingDefinitions(): SettingDefinitionItem[] {
  return [
   { name: 'Descendant view', desc: 'Add a Descendant view to a base. Choose a root note and its parent-link property in the view options.' },
   ...sponsorsSettingItems(this.plugin.pro!, PRO_UI),
  ];
 }
}
