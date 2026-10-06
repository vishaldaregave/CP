/**
 * Minimal Chrome Extension Manifest V3 typing declarations.
 */
declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      tab?: {
        id?: number;
        url?: string;
        title?: string;
      };
      frameId?: number;
      id?: string;
      url?: string;
    }

    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };

    const onStartup: {
      addListener(callback: () => void): void;
    };

    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: MessageSender,
          sendResponse: (response?: any) => void,
        ) => boolean | void,
      ): void;
    };

    function sendMessage(message: any, responseCallback?: (response: any) => void): Promise<any>;
    function getURL(path: string): string;
  }

  namespace sidePanel {
    interface PanelBehavior {
      openPanelOnActionClick?: boolean;
    }
    function setPanelBehavior(behavior: PanelBehavior): Promise<void>;
    function setOptions(options: { path?: string; enabled?: boolean; tabId?: number }): Promise<void>;
    function open(options: { windowId?: number; tabId?: number }): Promise<void>;
  }

  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>;
      set(items: Record<string, any>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }
    const local: StorageArea;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      active?: boolean;
    }

    interface TabChangeInfo {
      status?: string;
      url?: string;
      title?: string;
    }

    const onUpdated: {
      addListener(callback: (tabId: number, changeInfo: TabChangeInfo, tab: Tab) => void): void;
    };

    const onActivated: {
      addListener(callback: (activeInfo: { tabId: number; windowId: number }) => void): void;
    };

    function query(queryInfo: { active?: boolean; currentWindow?: boolean; url?: string | string[] }): Promise<Tab[]>;
    function sendMessage(tabId: number, message: any): Promise<any>;
  }

  namespace action {
    const onClicked: {
      addListener(callback: (tab: tabs.Tab) => void): void;
    };
  }
}
