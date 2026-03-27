export {};

declare global {
  interface Window {
    roleRoverDesktop?: {
      isDesktop: boolean;
      getAppInfo?: () => Promise<{ name: string; version: string }>;
      secureSettings?: {
        get?: (key: string) => string | null | Promise<string | null>;
        set?: (key: string, value: string) => void | Promise<void>;
        delete?: (key: string) => void | Promise<void>;
      };
    };
  }
}
