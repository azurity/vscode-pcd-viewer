import Color from 'colorjs.io';
import * as vscode from 'vscode';

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

class PcdDocument implements vscode.CustomDocument {

    static async create(
        uri: vscode.Uri,
        backupId: string | undefined
    ): Promise<PcdDocument | PromiseLike<PcdDocument>> {
        // If we have a backup, read that. Otherwise read the resource from the workspace
        const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
        const fileData = await PcdDocument.readFile(dataFile);
        return new PcdDocument(uri, fileData);
    }

    private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        if (uri.scheme === 'untitled') {
            return new Uint8Array();
        }
        let data = await vscode.workspace.fs.readFile(uri);
        return new Uint8Array((data as Buffer).buffer);
    }


    dispose(): void {
        // throw new Error('Method not implemented.');
    }

    private readonly _uri: vscode.Uri;
    private _documentData: Uint8Array;

    private constructor(
        uri: vscode.Uri,
        initialContent: Uint8Array
    ) {
        // super();
        this._uri = uri;
        this._documentData = initialContent;
    }

    public get uri() { return this._uri; }
    public get documentData(): Uint8Array { return this._documentData; }


    async save(cancellation: vscode.CancellationToken): Promise<void> {
        await this.saveAs(this.uri, cancellation);
    }

    async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
        await vscode.workspace.fs.writeFile(targetResource, this._documentData);
    }

    async backup(destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
        await this.saveAs(destination, cancellation);
        return {
            id: destination.toString(),
            delete: async () => {
                try {
                    await vscode.workspace.fs.delete(destination);
                } catch {
                    // noop
                }
            }
        };
    }
}

export class PcdEditorProvider implements vscode.CustomEditorProvider {

    private static readonly viewType = 'pcdViewer.pcdPreview';
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider(
            PcdEditorProvider.viewType,
            new PcdEditorProvider(context),
            {
                // For this demo extension, we enable `retainContextWhenHidden` which keeps the 
                // webview alive even when it is not visible. You should avoid using this setting
                // unless is absolutely required as it does have memory overhead.
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            });
    }

    constructor(
        private readonly _context: vscode.ExtensionContext
    ) {
        _context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
                if (!e.affectsConfiguration('pcdViewer.backgroundColor')) {
                    return;
                }
                const color = new Color(vscode.workspace.getConfiguration('pcdViewer').get('backgroundColor', '#000') as string);
                const front = (color.lch.l > 50) ? [0, 0, 0] : [255, 255, 255];
                this.webviews.forEach((webviewPanel) => {
                    this.postMessage(webviewPanel, 'background', {
                        value: [[color.r, color.g, color.b], front]
                    });
                });
            })
        );
    }

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<PcdDocument>>();
    public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    private readonly webviews = new WebviewCollection();

    saveCustomDocument(document: PcdDocument, cancellation: vscode.CancellationToken): Thenable<void> {
        return document.save(cancellation);
    }
    saveCustomDocumentAs(document: PcdDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
        return document.saveAs(destination, cancellation);
    }
    revertCustomDocument(document: PcdDocument, cancellation: vscode.CancellationToken): Thenable<void> {
        return Promise.resolve();
    }
    backupCustomDocument(document: PcdDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
        return document.backup(context.destination, cancellation);
    }
    async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<PcdDocument> {
        const document: PcdDocument = await PcdDocument.create(uri, openContext.backupId);
        return document;
    }
    async resolveCustomEditor(
        document: PcdDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Add the webview to our internal set of active webviews
        this.webviews.add(document.uri, webviewPanel);

        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        // webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(document, e));

        // Wait for the webview to be properly ready before we init
        webviewPanel.webview.onDidReceiveMessage(e => {
            if (e.type === 'ready') {
                const color = new Color(vscode.workspace.getConfiguration('pcdViewer').get('backgroundColor', '#000') as string);
                const front = (color.lch.l > 50) ? [0, 0, 0] : [255, 255, 255];
                this.postMessage(webviewPanel, 'background', {
                    value: [[color.r, color.g, color.b], front]
                });
                this.postMessage(webviewPanel, 'init', {
                    value: document.documentData
                });
                // if (document.uri.scheme === 'untitled') {
                //     this.postMessage(webviewPanel, 'init', {
                //         untitled: true,
                //         editable: true,
                //     });
                // } else {
                //     const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);

                //     this.postMessage(webviewPanel, 'init', {
                //         value: document.documentData,
                //         editable,
                //     });
                // }
            }
        });
    }

    private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
        panel.webview.postMessage({ type, body });
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'index.css'));
        const threeJsUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'js', 'three.js'));
        const orbitControlsUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'js', 'OrbitControls.js'));
        //
        const colorscale_rainbowUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'colormap', 'colorscale_rainbow.jpg'));
        const colorscale_boneUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'colormap', 'colorscale_bone.jpg'));
        const colorscale_coolUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'colormap', 'colorscale_cool.jpg'));
        const colorscale_hotUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'colormap', 'colorscale_hot.jpg'));
        const colorscale_hsvUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'colormap', 'colorscale_hsv.jpg'));
        const colorscale_jetUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'colormap', 'colorscale_jet.jpg'));
        const colorscale_oceanUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'colormap', 'colorscale_ocean.jpg'));
        const colorscale_parulaUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'colormap', 'colorscale_parula.jpg'));
        //
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'static', 'js', 'main.js'));

        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'media', 'reset.css'));


        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(
            this._context.extensionUri, 'media', 'pawDraw.css'));

        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();


        // <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        return /* html */`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PCD viewer</title>
                <link rel="stylesheet" type="text/css"href="${styleVSCodeUri}">
            </head>
            <body>
                <script nonce="${nonce}" src="${threeJsUri}"></script>
                <script nonce="${nonce}" src="${orbitControlsUri}"></script>
                <div id="menu-list"></div>
                <div id="orbit-list"></div>
                <div id="colormap-list" style="display: none;">
                    <div><img src="${colorscale_rainbowUri}"></div>
                    <div><img src="${colorscale_boneUri}"></div>
                    <div><img src="${colorscale_coolUri}"></div>
                    <div><img src="${colorscale_hotUri}"></div>
                    <div><img src="${colorscale_hsvUri}"></div>
                    <div><img src="${colorscale_jetUri}"></div>
                    <div><img src="${colorscale_oceanUri}"></div>
                    <div><img src="${colorscale_parulaUri}"></div>
                </div>
                <div id="colormap-current"><canvas id="colormap" width="256px" height="10px"></canvas></div>
                <div id="color-fields"></div>
                <div id="selection-panel">
                    <div class="panel-header">Selection</div>
                    <div class="panel-body empty">No point selected</div>
                </div>
                <script nonce="${nonce}" src="${scriptUri}" type="module"></script>
            </body>
            </html>`;
    }
}

class WebviewCollection {

    private readonly _webviews = new Set<{
        readonly resource: string;
        readonly webviewPanel: vscode.WebviewPanel;
    }>();

    /**
     * Get all known webviews for a given uri.
     */
    public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
        const key = uri.toString();
        for (const entry of this._webviews) {
            if (entry.resource === key) {
                yield entry.webviewPanel;
            }
        }
    }

    /**
     * Add a new webview to the collection.
     */
    public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
        const entry = { resource: uri.toString(), webviewPanel };
        this._webviews.add(entry);

        webviewPanel.onDidDispose(() => {
            this._webviews.delete(entry);
        });
    }

    public forEach(fn: (webviewPanel: vscode.WebviewPanel) => void) {
        for (let it of this._webviews) {
            fn(it.webviewPanel);
        }
    }
}
