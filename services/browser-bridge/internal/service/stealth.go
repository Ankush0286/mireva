package service

import (
	"os"
	"path/filepath"
)

const StealthInitScript = `
(() => {
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
    });

    window.chrome = {
        app: { isInstalled: false },
        runtime: {},
        loadTimes: () => ({}),
        csi: () => ({})
    };

    Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
        configurable: true
    });

    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
        configurable: true
    });

    if (window.navigator.permissions && window.navigator.permissions.query) {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(parameters)
        );
    }
})();
`

func CleanStaleProfileLocks(userDataDir string) {
	lockNames := []string{
		"SingletonLock",
		"SingletonSocket",
		"SingletonCookie",
		"lockfile",
	}
	for _, name := range lockNames {
		lockPath := filepath.Join(userDataDir, name)
		_ = os.Remove(lockPath)
	}
}
