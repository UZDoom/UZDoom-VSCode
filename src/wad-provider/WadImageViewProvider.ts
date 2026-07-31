import * as vscode from 'vscode';
import * as path from 'path';
import { WadFileSystemProvider } from './WadFileSystemProvider';
import DoomGfxDocument from '../doom-wad/Documents/DoomGfx';



function toBase64(content: string | ArrayBuffer): string {
    if (typeof content === 'string') {
        return `${btoa(content)}`;
    }
    return `${btoa(String.fromCharCode(...new Uint8Array(content)))}`;
}

const EMBEDDED_CSS = `/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This CSS stylesheet defines the rules to be applied to any ImageDocuments,
 * including those in frames.
*/

body {
  /* To give the image access to our document's full viewport, we need to
     override the margin that the html.css UA stylesheet would otherwise apply
     to our body. */
  margin: 0;
}

@media not print {
  .fullZoomOut {
    cursor: zoom-out;
  }

  .fullZoomIn {
    cursor: zoom-in;
  }

  .shrinkToFit {
    cursor: zoom-in;
  }

  .overflowingVertical,
  .overflowingHorizontalOnly {
    cursor: zoom-out;
  }
}

.isInObjectOrEmbed {
  width: 100%;
  height: 100vh;
}

img {
  display: block;
}
`

const EMBEDDED_CSS_2 = `
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
  This CSS stylesheet defines the rules to be applied to ImageDocuments that
  are top level (e.g. not iframes).
*/

@media not print {
  :root {
    /* The font color here was chosen to be readable over the corresponding
       backgrounds. This is important in case this ImageDocument is for an
       image that happens to be corrupt, in which case we'll display a textual
       error message over the background, instead of the image itself. */
    color: #eee;
    /* The background-attachment is fixed to stop an ugly white gutter
       from appearing when the document is overscrolled. */
    background: url("chrome://global/skin/media/imagedoc-darknoise.png") fixed;
  }

  img.transparent {
    color: #222;
    background: hsl(0, 0%, 90%) url("chrome://global/skin/media/imagedoc-lightnoise.png");
  }

  img {
    text-align: center;
    position: absolute;
    inset: 0;
    margin: auto;
  }

  img.overflowingVertical {
    /* If we're overflowing vertically, we need to set margin-top to
       0.  Otherwise we'll end up trying to vertically center, and end
       up cutting off the top part of the image. */
    margin-top: 0;
  }

  .completeRotation {
    transition: transform 0.3s ease 0s;
  }
}

img {
  image-orientation: from-image;
}

`

const HTML_TEMPLATE = `
<html>
    <meta name="viewport" content="width=device-width; height=device-height;">
    <link rel="stylesheet" href="data:text/css;base64,${toBase64(EMBEDDED_CSS)}">
    <link rel="stylesheet" href="data:text/css;base64,${toBase64(EMBEDDED_CSS_2)}">
  <body>
    <img src="<DATA_URI>" class="transparent shrinkToFit" width="<WIDTH>" height="<HEIGHT>">
  </body>
</html>
`;

export default class WadImageViewProvider implements vscode.CustomReadonlyEditorProvider {

    private fsProvider: WadFileSystemProvider;

    constructor(fsProvider: WadFileSystemProvider) {
        this.fsProvider = fsProvider;
    }

    getHTML(panel: vscode.WebviewPanel, data: ArrayBuffer, width: number, height: number) {
        let html = HTML_TEMPLATE;

        // Replace all asset references with webview URIs
        html = html.replace("<DATA_URI>", `data:image/png;base64,${toBase64(data)}`);
        html = html.replace("<WIDTH>", width.toString());
        html = html.replace("<HEIGHT>", height.toString());
        return html;
    }

    async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<vscode.CustomDocument> {
        let lump = await this.fsProvider.getEntry(uri);
        if (lump.documentType !== 'DoomGfx') {
            throw new Error('Invalid WAD entry type');
        }
        return lump.getDisplayDocument(uri) as vscode.CustomDocument;
    }

    async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken) {
        console.log('Resolving custom editor for:', document.uri.toString());

        if (!(document instanceof DoomGfxDocument)) {
            throw new Error('Invalid document type');
        }
        const doomGfxDocument = document as DoomGfxDocument;

        // const modelUri = webviewPanel.webview.asWebviewUri(doomGfxDocument.uri);
        // const modelUriString = modelUri.toString();

        let options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(__dirname, 'public', 'webview')),
                vscode.Uri.file(path.dirname(document.uri.fsPath))
            ],
            enableFindWidget: true,
            retainContextWhenHidden: true
        };
        webviewPanel.webview.options = options;

        webviewPanel.webview.html = this.getHTML(webviewPanel, await doomGfxDocument.getDisplayContent(), doomGfxDocument.width, doomGfxDocument.height);

        // Listen for messages from the WebView
        webviewPanel.webview.onDidReceiveMessage(message => {
            if (message.type === 'ready') {
                // console.log('WebView is ready');
                // webviewPanel.webview.postMessage({
                //     type: 'updateConfig',
                //     config: vscode.workspace.getConfiguration('glbViewer')
                // });

                // webviewPanel.webview.postMessage({
                //     type: 'setWebViewPath',
                //     webview_path: ''//webviewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'public', 'webview'))).toString()
                // });

                // webviewPanel.webview.postMessage({
                //     type: 'showOpenOnBlenderButton'
                // });

                // console.log('Sending modelUri to WebView:', modelUriString);

                // if (modelUriString.includes('git')) {
                //     sendModelAsBase64(webviewPanel, document.uri);
                // }
                // else {
                //     // Get file size for URI-based loading
                //     vscode.workspace.fs.stat(document.uri).then(stats => {
                //         webviewPanel.webview.postMessage({
                //             type: 'loadModelFromUri',
                //             dataUri: modelUriString,
                //             fileSize: stats.size
                //         });
                //     }).catch(_err => {
                //         // If stat fails, send without file size
                //         webviewPanel.webview.postMessage({
                //             type: 'loadModelFromUri',
                //             dataUri: modelUriString
                //         });
                //     });
                // }
            }
            // if (message.type === 'openJson') {
            //     const jsonContent = JSON.stringify(message.payload, null, 2);

            //     vscode.workspace.openTextDocument({
            //         content: jsonContent,
            //         language: 'json'
            //     }).then(doc => {
            //         vscode.window.showTextDocument(doc, vscode.ViewColumn.Active, true);
            //     });
            // }

            // if (message.type === 'openAsText') {
            //     vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
            // }

            // if (message.type === 'openInBlender') {
            //     console.log('opening in blender', document.uri.fsPath);

            //     const filePath = document.uri.fsPath;

            //     // Path to Blender executable (customize this!)
            //     const blenderPath = getBlenderPath();

            //     const command = `"${blenderPath}" --python-expr "import bpy; bpy.ops.import_scene.gltf(filepath='${filePath.replace(/\\/g, '\\\\')}')"`; // escape backslashes on Windows

            //     console.log('RUNNING', command);

            //     exec(command, (error, stdout, stderr) => {
            //         if (error) {
            //             vscode.window.showErrorMessage(`Error launching Blender. Make sure to set the executable path in settings. \n\n${error.message}`);
            //             return;
            //         }
            //         console.log(stdout || stderr);
            //     });
            // }
        });

        // webviewPanel.onDidChangeViewState(e =>
        // {
        //   console.log('onDidChangeViewState', e.webviewPanel.title);

        //   if (e.webviewPanel.visible)
        //   {
        //     console.log('WebView is now visible');

        //     webviewPanel.webview.postMessage({
        //       type: 'startRenderLoop'
        //     });
        //   }
        //   else
        //   {
        //     webviewPanel.webview.postMessage({
        //       type: 'stopRenderLoop'
        //     });
        //   }
        // });

        // webviewPanel.onDidDispose(() => disposePanel(webviewPanel), null, _disposables);

        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('glbViewer.relevant3dObjectKeys')) {
                webviewPanel.webview.postMessage({
                    type: 'updateConfig',
                    config: vscode.workspace.getConfiguration('glbViewer')
                });
            }
            if (event.affectsConfiguration('glbViewer.prettifyPropertyLabels')) {
                webviewPanel.webview.postMessage({
                    type: 'updateConfig',
                    config: vscode.workspace.getConfiguration('glbViewer')
                });
            }
        });
    }
};
