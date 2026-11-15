/**
 * The parts of tesseract.js-core (Tesseract compiled to WebAssembly) that Outpost
 * calls. The package ships no types of its own.
 */
declare module "tesseract.js-core/*" {
  export interface TessBaseAPI {
    /** Returns 0 when the language data loaded. */
    Init(dataPath: string, languages: string, engineMode: number): number;
    SetVariable(name: string, value: string): boolean;
    /** Reads the picture at `/input` in the module's own file system. Returns 1 on failure. */
    SetImageFile(exifOrientation: number, angle: number): number;
    SetSourceResolution(dpi: number): void;
    Recognize(monitor: null): number;
    GetUTF8Text(): string | null;
    MeanTextConf(): number;
    Clear(): void;
    End(): void;
  }

  export interface TesseractModule {
    TessBaseAPI: new () => TessBaseAPI;
    FS: {
      mkdir(path: string): void;
      writeFile(path: string, data: Uint8Array): void;
      unlink(path: string): void;
    };
  }

  export interface TesseractModuleOptions {
    /** Called by the engine with 0 to 100 while it recognises a picture. */
    TesseractProgress?(percent: number): void;
    print?(text: string): void;
    printErr?(text: string): void;
  }

  const createModule: (options?: TesseractModuleOptions) => Promise<TesseractModule>;
  export default createModule;
}
