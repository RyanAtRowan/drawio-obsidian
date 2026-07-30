import { mxCell, mxEventObject, mxPopupMenu } from "mxgraph";
import {
  ActionMessage,
  ActionMessageActions,
  DrawioLoadActionMessage,
  EventMessageEvents,
  VaultFilePickerResultActionMessage,
  VaultFilePickerResultFile,
} from "src/Messages";
import { FrameMessenger } from "../../FrameMessenger";
import { patch } from "../patch";
import { FontManager } from "./FontManager";
import { MANROPE_FONT_FACE_CSS } from "../ManropeFont";

export default class Plugin {
  app: App;
  frameMessenger: FrameMessenger;
  fontManager: FontManager;
  fileFormat: string;

  public static plugin(app: App) {
    // Add the app instance to global scope for debugging
    Object.defineProperty(window, "drawioApp", { value: app });

    // This makes debugging easier because the dev tools exposes the [[TargetFunction]]
    mxUtils.bind = (thisArg: any, fn: Function) => {
      return fn.bind(thisArg);
    };

    // Create an instance of our plugin
    new Plugin(app);
  }

  private constructor(app: App) {
    this.app = app;
    this.fontManager = new FontManager();
    this.frameMessenger = new FrameMessenger(
      () => window.parent,
      this.handleMessages.bind(this)
    );

    // Update the file when the diagram changes
    app.editor.graph.model.addListener(
      "change",
      this.handleGraphChange.bind(this)
    );

    // TODO: Make it easy to link the selected cell to a note
    app.editor.graph.addListener("click", this.handleGraphClick.bind(this));

    // Change the drawio app user interface
    this.modifyUi(app);
  }

  handleMessages(message: ActionMessage) {
    if ("action" in message) {
      switch (message.action) {
        case "load":
          this.handleLoadActionMessage(message);
          break;
      }
    }
  }

  handleLoadActionMessage(message: DrawioLoadActionMessage) {
    // Derive the file format from file data
    this.fileFormat = /\<svg[\>\s]/.test(message.xml) ? "svg" : "xml";
  }

  handleGraphClick(_sender: any, eventObj: mxEventObject) {
    // TODO: Make it easy to link the selected cell to a note
    // const cell = eventObj.getProperty("cell");
  }

  async handleGraphChange() {
    const currentFile = this.app.getCurrentFile();
    if (!currentFile || !this.fileFormat) {
      //"No current file or format yet
      return;
    }

    if (this.fileFormat === "svg") {
      // Update svg format
      const svg = await this.getSvg(this.app.editor);
      this.frameMessenger.sendMessage({
        event: EventMessageEvents.Change,
        data: svg,
      });
    } else {
      // Update drawio format
      const xml = await this.getXml(this.app.editor);
      this.frameMessenger.sendMessage({
        event: EventMessageEvents.Change,
        data: xml,
      });
    }
  }

  private xmlToString(xml: Node) {
    return new XMLSerializer().serializeToString(xml);
  }

  private modifyUi(app: App) {
    // TODO: Manage dark mode switching
    // patch(
    //   EditorUi.prototype,
    //   "setDarkMode",
    //   (fn) =>
    //     function (dark: boolean) {
    //       console.log("set dark Mode", dark);
    //     }
    // );

    // Hide page view
    app.setPageVisible(false);

    // Collapse the format panel
    app.toggleFormatPanel(false);

    // Stop Save and exit buttons being created when a new file is loaded
    this.removeMenubars(app);

    // Hide menu items that aren't relevant
    this.removeMenus();

    // Keep the "General" shapes palette expanded. Depending on how drawio
    // resolves its (disabled) persisted UI settings on startup, this section
    // can end up collapsed by default, which is confusing since it's the
    // only shape palette we show.
    this.expandGeneralShapesPalette(app);

    // Add a "Choose vault file..." button to the Edit Link dialog, so
    // links can target a note/canvas/diagram elsewhere in the vault
    // instead of only external URLs or in-diagram pages.
    this.addVaultFileLinkPicker();
  }

  private addVaultFileLinkPicker() {
    const plugin = this;
    patch(
      EditorUi.prototype,
      "showLinkDialog",
      (fn) =>
        function (...args: any[]) {
          const result = fn.apply(this, args);
          plugin.repurposePageSelectForVaultFiles(this as App);
          return result;
        }
    );
  }

  // The Edit Link dialog's bottom radio + dropdown normally lets you link
  // to another page within the same diagram (drawio's multi-page feature,
  // which this plugin doesn't otherwise expose). We repurpose that slot to
  // link to a file elsewhere in the vault instead: whatever value ends up
  // selected in the <select> is exactly what drawio's own OK-button submit
  // logic reads when that radio is checked, so setting it there (rather
  // than trying to fake the URL field + a radio switch) means it's always
  // whatever actually gets submitted, with no separate state to fall out
  // of sync.
  private repurposePageSelectForVaultFiles(app: App) {
    const container = app.dialog && app.dialog.container;
    if (!container) {
      return;
    }
    const select = container.querySelector("select") as HTMLSelectElement;
    const radios = container.querySelectorAll(
      "input[type=radio]"
    ) as NodeListOf<HTMLInputElement>;
    const [urlRadio, vaultRadio] = Array.from(radios);
    if (!select || !urlRadio || !vaultRadio) {
      return;
    }

    select.innerHTML = "";
    const option = document.createElement("option");
    option.textContent = "Choose a vault file...";
    option.value = "";
    select.appendChild(option);

    const openPicker = (evt: Event) => {
      evt.preventDefault();
      this.requestVaultFileLink().then((file) => {
        if (!file) {
          return;
        }
        option.textContent = file.path;
        option.value = file.uri;
        select.value = file.uri;
        urlRadio.checked = false;
        vaultRadio.checked = true;
      });
    };

    // mousedown (not click) + preventDefault stops the native dropdown
    // from opening, so clicking this always opens our picker instead.
    select.addEventListener("mousedown", openPicker);
    vaultRadio.addEventListener("click", openPicker);
  }

  // Asks Obsidian (outside the iframe) to show a file picker, and resolves
  // with the chosen file's info, or null if the picker was cancelled.
  private requestVaultFileLink(): Promise<VaultFilePickerResultFile | null> {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return this.frameMessenger
      .sendMessageAndWait(
        {
          event: EventMessageEvents.RequestVaultFilePicker,
          requestId,
        },
        (message: any) =>
          message.action === ActionMessageActions.VaultFilePickerResult &&
          message.requestId === requestId,
        // Generous timeout - the user may take a while to search and pick.
        10 * 60 * 1000
      )
      .then((message: VaultFilePickerResultActionMessage) => message.file)
      .catch(() => null);
  }

  private expandGeneralShapesPalette(app: App) {
    const sidebar = app.sidebar;
    if (!sidebar) {
      return;
    }

    // this.palettes[id] is [titleElement, outerElement], where outerElement
    // wraps the actual collapsible content div (outer.appendChild(div) in
    // Sidebar.prototype.addPalette). That inner div is what really gets
    // display:none when collapsed.
    const [title, outer] = sidebar.palettes["general"] || [];
    const content = outer && (outer.firstChild as HTMLElement);
    if (!title || !content) {
      return;
    }

    if (content.style.display === "none") {
      // Simulate a real click on the fold title so drawio's own toggle
      // handler runs, keeping the content visibility and fold arrow icon
      // in sync exactly the way a manual click would.
      title.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }

  private removeMenubars(app: App) {
    patch(EditorUi.prototype, "addEmbedButtons", (fn) => function () {});

    // Remove the status elements because this plugin manages saving the diagram
    app.statusContainer.remove();
    app.statusContainer = null;
    if (
      app.menubarContainer.parentElement.firstChild === app.menubarContainer &&
      app.menubarContainer.parentElement.childElementCount === 1
    ) {
      // Move the format window up
      const formatWindow = app.formatWindow.window;
      formatWindow.setLocation(formatWindow.getX(), 10);
      // Hide the empty menubar
      app.menubarContainer.parentElement.remove();
      app.menubarContainer.remove();
    }
  }

  private removeMenus() {
    const ignoredMenus: string[] = [
      "print",
      "saveAndExit",
      "plugins",
      "exit",
      "about",
    ];
    const ignoredSubMenus: string[] = ["exportAs", "importFrom", "help"];
    patch(
      Menus.prototype,
      "addMenuItem",
      (fn) =>
        function (menu: mxPopupMenu, name: string, ...args: any[]) {
          if (ignoredMenus.includes(name)) {
            return;
          } else {
            return fn.call(this, menu, name, ...args);
          }
        }
    );
    patch(
      Menus.prototype,
      "addSubmenu",
      (fn) =>
        function (name: string, menu: mxPopupMenu, ...args: any[]) {
          if (ignoredSubMenus.includes(name)) {
            return;
          } else {
            return fn.call(this, name, menu, ...args);
          }
        }
    );
  }

  // Get XML data for saving
  async getXml(editor: Editor) {
    const graphXml = editor.getGraphXml();
    return this.xmlToString(graphXml);
  }

  // Get SVG data for saving
  async getSvg(editor: Editor): Promise<string> {
    const svgNamespaceUri = "http://www.w3.org/2000/svg";
    const svgDocument = document.createElementNS(svgNamespaceUri, "svg");

    const graph = editor.graph;
    const view = graph.getView();
    const { x, y, height, width } = view.graphBounds;
    const viewScale = view.scale;
    svgDocument.setAttribute("version", "1.1");
    svgDocument.setAttribute("height", `${height / viewScale}px`);
    svgDocument.setAttribute("width", `${width / viewScale}px`);
    svgDocument.setAttribute(
      "viewBox",
      `0 0 ${width / viewScale} ${height / viewScale}`
    );

    const svgCanvas = new mxSvgCanvas2D(svgDocument);
    svgCanvas.translate(-x / viewScale, -y / viewScale);
    svgCanvas.scale(1 / viewScale);

    const imageExport = new mxImageExport();
    const graphCellState = view.getState(graph.model.root);

    imageExport.getLinkForCellState = function (state, canvas) {
      const cell = state.cell;
      if (cell.value != null && typeof cell.value == "object") {
        return cell.value.getAttribute("link");
      }
      return null;
    };

    imageExport.drawState(graphCellState, svgCanvas);

    await this.embedGraphInSvg(editor, svgDocument);

    await this.embedFontsInSvg(editor, svgDocument);

    // Add margin to SVG
    this.addViewBoxMarginToSvg(svgDocument);

    const xml = this.xmlToString(svgDocument);

    return xml;
  }

  private embedGraphInSvg(editor: Editor, svg: SVGElement) {
    const graphXml = editor.getGraphXml();
    const graphXmlContent = this.xmlToString(graphXml);
    svg.setAttribute("content", graphXmlContent);
  }

  private async embedFontsInSvg(editor: Editor, svg: SVGElement) {
    const customFonts = editor.graph.getCustomFonts();
    // Always embed Manrope (the plugin's default font) so exported SVGs
    // render correctly even when opened somewhere without it installed.
    // No fontSource is set on the default styles, so getCustomFonts()
    // won't pick this up on its own.
    const fontCssRules: string[] = [MANROPE_FONT_FACE_CSS];
    for (const customFont of customFonts) {
      try {
        const fontCssRule = await this.fontManager.getFontCssForUrl(
          customFont.name,
          customFont.url
        );
        fontCssRules.push(fontCssRule);
      } catch (err) {
        console.warn("Couldn't embed font data", err);
      }
    }
    const svgDoc = svg.ownerDocument;
    const style = svgDoc.createElementNS("http://www.w3.org/2000/svg", "style");
    style.setAttribute("type", "text/css");
    style.appendChild(svgDoc.createTextNode(fontCssRules.join("\r\n")));
    svg.insertBefore(style, svg.firstChild);
  }

  private addViewBoxMarginToSvg(svg: SVGElement) {
    const margin = 10;
    const viewBox = svg.getAttribute("viewBox");
    const [a, b, c, d] = viewBox
      .split(" ")
      .map((x: string) => Number.parseFloat(x));
    svg.setAttribute(
      "viewBox",
      [a - margin, b - margin, c + margin * 2, d + margin * 2].join(" ")
    );
  }
}

// Draw.loadPlugin((ui) => {
//   sendEvent({ event: "pluginLoaded", pluginId: "linkSelectedNodeWithData" });

// 	let nodeSelectionEnabled = false;
// 	const graph = ui.editor.graph;
// 	const highlight = new mxCellHighlight(graph, "#00ff00", 8);

// 	const model = graph.model;
// 	let activeCell: DrawioCell | undefined = undefined;

// 	graph.addListener(mxEvent.DOUBLE_CLICK, function (sender: any, evt: any) {
//     if (!nodeSelectionEnabled) {
//       return;
// 		}

// 		var cell: any | null = evt.getProperty("cell");
// 		if (cell != null) {
//       const data = getLinkedData(cell);
// 			const label = getLabelTextOfCell(cell);

// 			if (!data && !label.match(/#([a-zA-Z0-9_]+)/)) {
//         return;
// 			}

// 			sendEvent({ event: "nodeSelected", label, linkedData: data });
// 			evt.consume();
// 		}
// 	});

// 	function getLabelTextOfCell(cell: any): string {
//     const labelHtml = graph.getLabel(cell);
// 		const el = document.createElement("html");
// 		el.innerHTML = labelHtml; // label can be html
// 		return el.innerText;
// 	}

// 	const selectionModel = graph.getSelectionModel();
// 	selectionModel.addListener(mxEvent.CHANGE, (sender: any, evt: any) => {
//     // selection has changed
// 		const cells = selectionModel.cells;
// 		if (cells.length >= 1) {
//       const selectedCell = cells[0];
// 			activeCell = selectedCell;
// 			(window as any).hediet_Cell = selectedCell;
// 		} else {
//       activeCell = undefined;
// 		}
// 	});

// 	const prefix = "hedietLinkedDataV1";
// 	const flattener = new FlattenToDictionary({
//     parser: new ConservativeFlattenedEntryParser({
//       prefix,
// 			separator: "_",
// 		}),
// 	});

// 	function getLinkedData(cell: { value: unknown }) {
//     if (!mxUtils.isNode(cell.value)) {
//       return undefined;
// 		}
// 		const kvs = [...(cell.value.attributes as any)]
//     .filter((a) => a.name.startsWith(prefix))
//     .map((a) => [a.name, a.value]);
// 		if (kvs.length === 0) {
//       return undefined;
// 		}

// 		const r: Record<string, string> = {};
// 		for (const [k, v] of kvs) {
//       r[k] = v;
// 		}
// 		return flattener.unflatten(r);
// 	}

// 	function setLinkedData(cell: any, linkedData: JSONValue) {
//     let newNode: HTMLElement;
// 		if (!mxUtils.isNode(cell.value)) {
//       const doc = mxUtils.createXmlDocument();
// 			const obj = doc.createElement("object");
// 			obj.setAttribute("label", cell.value || "");
// 			newNode = obj;
// 		} else {
//       newNode = cell.value.cloneNode(true);
// 		}

// 		for (const a of [
//       ...((newNode.attributes as any) as { name: string }[]),
// 		]) {
//       if (a.name.startsWith(prefix)) {
//         newNode.attributes.removeNamedItem(a.name);
// 			}
// 		}

// 		const kvp = flattener.flatten(linkedData);
// 		for (const [k, v] of Object.entries(kvp)) {
//       newNode.setAttribute(k, v);
// 		}

// 		// don't use cell.setValue as it does not trigger a change
// 		model.setValue(cell, newNode);
// 	}

// 	window.addEventListener("message", (evt) => {
//     if (evt.source !== window.opener) {
//       return;
// 		}

// 		console.log(evt);
// 		const data = JSON.parse(evt.data) as CustomDrawioAction;

// 		switch (data.action) {
//       case "setNodeSelectionEnabled": {
//         nodeSelectionEnabled = data.enabled;
// 				break;
// 			}
// 			case "linkSelectedNodeWithData": {
//         if (activeCell !== undefined) {
//           log("Set linkedData to " + data.linkedData);
// 					graph.model.beginUpdate();
// 					try {
//             setLinkedData(activeCell, data.linkedData);
// 					} finally {
//             graph.model.endUpdate();
// 					}
// 					highlight.highlight(graph.view.getState(activeCell));
// 					setTimeout(() => {
//             highlight.highlight(null);
// 					}, 500);
// 				}
// 				break;
// 			}
// 			case "getVertices": {
//         const vertices = Object.values(graph.model.cells)
//         .filter((c) => graph.model.isVertex(c))
//         .map((c: any) => ({ id: c.id, label: graph.getLabel(c) }));
// 				sendEvent({
// 					event: "getVertices",
// 					message: data,
// 					vertices: vertices,
// 				});
// 				break;
// 			}
// 			case "updateVertices": {
//         const vertices = data.verticesToUpdate;

// 				graph.model.beginUpdate();
// 				try {
//           for (const v of vertices) {
//             const c = graph.model.cells[v.id];
// 						if (!c) {
//               log(`Unknown cell "${v.id}"!`);
// 							continue;
// 						}
// 						if (graph.getLabel(c) !== v.label) {
//               graph.model.setValue(c, v.label);
// 						}
// 					}
// 				} finally {
//           graph.model.endUpdate();
// 				}
// 				break;
// 			}
// 			case "addVertices": {
// 				// why is this called twice?
// 				log("add vertices is being called");
// 				const vertices = data.vertices;

// 				graph.model.beginUpdate();
// 				try {
//           let i = 0;
// 					for (const v of vertices) {
//             graph.insertVertex(
//               undefined,
// 							null,
// 							v.label,
// 							i * 120,
// 							0,
// 							100,
// 							50,
// 							"rectangle"
// 						);
// 						i++;
// 					}
// 				} finally {
//           graph.model.endUpdate();
// 				}
// 				break;
// 			}
// 			default: {
//         return;
// 			}
// 		}

// 		evt.preventDefault();
// 		evt.stopPropagation();
// 	});
// });
