import { App, FuzzySuggestModal, TFile } from "obsidian";

/**
 * Lets the user search and pick any file in the vault (notes, canvases,
 * diagrams, images, etc.), used to link a diagram shape to something else
 * in the vault via the Edit Link dialog.
 */
export class VaultFileSuggestModal extends FuzzySuggestModal<TFile> {
  private chosen: boolean;
  private readonly onPick: (file: TFile | null) => void;

  constructor(app: App, onPick: (file: TFile | null) => void) {
    super(app);
    this.onPick = onPick;
    this.chosen = false;
    this.setPlaceholder("Search vault files to link to...");
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.chosen = true;
    this.onPick(file);
  }

  onClose() {
    super.onClose();
    // Empirically, Obsidian's SuggestModal fires onClose() before it
    // finishes calling onChooseItem() for the item that was picked - not
    // after, despite what "onClose" implies. Deferring this check lets
    // onChooseItem set `chosen` first if a pick is actually in flight, so
    // we don't send a spurious "cancelled" result ahead of the real one.
    setTimeout(() => {
      if (!this.chosen) {
        this.onPick(null);
      }
    }, 50);
  }
}
