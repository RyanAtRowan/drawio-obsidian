declare module "drawio" {
  import { mxWindow } from "mxgraph";

  export interface DrawioFile {}

  export interface Graph {
    model: any;
    connectionHandler: any;
    addListener(
      eventName: string,
      listener: EventListenerOrEventListenerObject
    ): void;
    getView(): any;
    getCustomFonts(): Array<{ name: string; url: string }>;
    getCellStyle(cell: any): any;
    setConnectionConstraint(
      edge: any,
      terminal: any,
      source: boolean,
      constraint: any
    ): void;
  }

  global {
    class Menus {
      defaultMenuItems: Array<string>;
    }
    class Editor {
      graph: Graph;
      getGraphXml(): XMLDocument;
    }
    class EditorUi {}
    class Sidebar {
      palettes: { [key: string]: HTMLElement[] };
    }
    class App {
      editor: Editor;
      menubarContainer: HTMLElement;
      statusContainer: HTMLElement;
      formatWindow: { window: mxWindow };
      sidebar: Sidebar;
      dialog: { container: HTMLElement };
      getCurrentFile(): DrawioFile;
      toggleFormatPanel(visible: boolean): void;
      setPageVisible(visible: boolean): void;
      static main(callback?: (app: App) => void, createUi?: () => void): void;
    }
  }
}
