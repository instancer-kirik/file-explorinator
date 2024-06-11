import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    const workspaceRoot = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : '';
    const fileExplorerProvider = new FileExplorerProvider(workspaceRoot);

    vscode.window.registerTreeDataProvider('fileExplorer', fileExplorerProvider);

    const refreshCommand = vscode.commands.registerCommand('fileExplorer.refresh', () => fileExplorerProvider.refresh());
    const openFileCommand = vscode.commands.registerCommand('fileExplorer.openFile', (resource) => fileExplorerProvider.openResource(resource));

    context.subscriptions.push(refreshCommand);
    context.subscriptions.push(openFileCommand);
}

export function deactivate() {
    // Clean up resources here if needed
}

class FileExplorerProvider implements vscode.TreeDataProvider<FileNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileNode | undefined | null | void> = new vscode.EventEmitter<FileNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileNode | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private workspaceRoot: string) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FileNode): Thenable<FileNode[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No workspace folder open');
            return Promise.resolve([]);
        }

        if (element) {
            return Promise.resolve(this.getFiles(element.resourceUri.fsPath));
        } else {
            return Promise.resolve(this.getFiles(this.workspaceRoot));
        }
    }

    private getFiles(dir: string): FileNode[] {
        if (!fs.existsSync(dir)) {
            return [];
        }

        const files = fs.readdirSync(dir);
        const nodes: FileNode[] = files.map(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            const node = new FileNode(vscode.Uri.file(filePath), stat.isDirectory(), stat.mtime);

            if (node.isDirectory) {
                const subFiles = this.getFiles(filePath);
                if (subFiles.length > 0) {
                    const latestSubFile = subFiles.reduce((latest, current) => {
                        return latest.modifiedTime > current.modifiedTime ? latest : current;
                    });
                    node.modifiedTime = latestSubFile.modifiedTime > node.modifiedTime ? latestSubFile.modifiedTime : node.modifiedTime;
                }
            }

            return node;
        });

        // Sort by last modified date
        nodes.sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime());
        return nodes;
    }

    openResource(resource: vscode.Uri): void {
        vscode.window.showTextDocument(resource);
    }
}

class FileNode extends vscode.TreeItem {
    constructor(
        public readonly resourceUri: vscode.Uri,
        public readonly isDirectory: boolean,
        public modifiedTime: Date
    ) {
        super(resourceUri, isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${this.resourceUri.fsPath} - Last Modified: ${this.modifiedTime.toLocaleString()}`;
        this.description = this.modifiedTime.toLocaleString();
        this.contextValue = isDirectory ? 'folder' : 'file';
    }
}
