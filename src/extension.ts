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

    private cache: { [key: string]: FileNode[] } = {};

    constructor(private workspaceRoot: string) { }

    refresh(): void {
        this.cache = {}; // Clear cache
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FileNode): Promise<FileNode[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No workspace folder open');
            return [];
        }

        const dir = element ? element.resourceUri.fsPath : this.workspaceRoot;

        if (this.cache[dir]) {
            return this.cache[dir];
        } else {
            const files = await this.getFiles(dir);
            this.cache[dir] = files;
            return files;
        }
    }

    private async getFiles(dir: string): Promise<FileNode[]> {
        if (!fs.existsSync(dir)) {
            return [];
        }

        const files = await fs.promises.readdir(dir);
        const nodes: FileNode[] = await Promise.all(files.map(async file => {
            const filePath = path.join(dir, file);
            const stat = await fs.promises.stat(filePath);
            const node = new FileNode(vscode.Uri.file(filePath), stat.isDirectory(), stat.mtime);

            if (node.isDirectory) {
                node.modifiedTime = await this.getLatestModifiedTime(filePath);
            }

            return node;
        }));

        // Sort by last modified date
        nodes.sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime());
        return nodes;
    }

    private async getLatestModifiedTime(dir: string): Promise<Date> {
        const subFiles = await fs.promises.readdir(dir);
        const subFileStats = await Promise.all(subFiles.map(async subFile => {
            const subFilePath = path.join(dir, subFile);
            const stat = await fs.promises.stat(subFilePath);
            return stat.isDirectory() ? await this.getLatestModifiedTime(subFilePath) : stat.mtime;
        }));

        return subFileStats.reduce((latest, current) => {
            return latest > current ? latest : current;
        }, new Date(0));
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
        this.command = isDirectory ? undefined : {
            command: 'fileExplorer.openFile',
            title: 'Open File',
            arguments: [this.resourceUri]
        };
    }
}
