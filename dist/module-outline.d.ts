export declare const DEFAULT_MAX_FILES = 30;
export declare const MAX_FILES_LIMIT = 500;
export interface OutlineOptions {
    recursive: boolean;
    maxFiles: number;
}
export declare function resolveOutlineOptions(recursive: boolean | undefined, maxFiles: number | undefined): OutlineOptions;
export declare function buildModuleOutline(dirPath: string, options: OutlineOptions): Promise<string>;
export declare function outlineSource(filePath: string, code: string): string;
