import { FileValue, FileView, ListValue, StringValue, normalizePath, parseLinktext, type App, type TFile, type Value } from 'obsidian';

/** Resolve only a single Markdown note, never coerce other formula values into paths. */
export function formulaRoot(app: App, result: Value | null, sourcePath: string): TFile | null {
 const value = result instanceof ListValue ? (result.length() === 1 ? result.get(0) : null) : result;
 if (value instanceof FileValue) {
  const file = app.vault.getFileByPath(normalizePath(value.toString()));
  return file?.extension === 'md' ? file : null;
 }
 // LinkValue inherits StringValue. Its public toString preserves wiki-link syntax.
 if (!(value instanceof StringValue)) return null;
 const text = value.toString().trim();
 const link = text.startsWith('[[') && text.endsWith(']]') ? text.slice(2, -2).split('|')[0]!.trim() : text;
 const path = parseLinktext(link).path;
 const file = path ? app.metadataCache.getFirstLinkpathDest(path, sourcePath) : null;
 return file?.extension === 'md' ? file : null;
}

/** Find the base's path without using the active leaf (another embed may be active). */
export function baseSourcePath(app: App, container: HTMLElement): string {
 let host = '';
 app.workspace.iterateAllLeaves(leaf => {
  if (leaf.view instanceof FileView && leaf.view.containerEl.contains(container)) host = leaf.view.file?.path ?? '';
 });
 // Embedded bases expose their link target on the embedding element, including a view fragment.
 const target = container.closest('.internal-embed[src]')?.getAttribute('src');
 if (target) return app.metadataCache.getFirstLinkpathDest(parseLinktext(target).path, host)?.path ?? host;
 return host;
}
