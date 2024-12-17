(function(appName) {
	function getRuntimeUrl(aName) {
		const scriptSelector = `script[src*="bootstrap-${aName}.js"]`;
		const scriptElement = document.querySelector(scriptSelector);

		if (scriptElement) {
			const scriptSrc = scriptElement.src;
			// Check if the URL is relative
			if (!/^(http:|https:|\/\/)/i.test(scriptSrc)) {
				// Resolve the relative URL using the document's location
				const parentUrl = window.location.href;
				const parentBasePath = parentUrl.substring(0, parentUrl.lastIndexOf('/') + 1);
				return new URL(scriptSrc, parentBasePath).href;
			}
			// If the URL is absolute, extract the base path
			const basePath = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);
			return basePath;
		}
		// Fallback path if the script element is not found
		return '/ng-bundle/';
	}

	function getWebComponentConfig() {
		const currentScript = document.currentScript;
		let artifactsUrl = getRuntimeUrl(appName);
		if (currentScript) {
			let apiUrl = currentScript.getAttribute('data-api-url');
			if(!apiUrl) {
				apiUrl = artifactsUrl;
			}
			return {
				apiUrl: apiUrl,
				artifactsUrl: artifactsUrl
			};
		}
	}

	// Dynamic script loader utility
	function loadScript(src, isModule) {
		return new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.src = src;
			if(isModule) {
				script.type = 'module';
			}
			script.src = src;
			script.onload = resolve;
			script.onerror = reject;
			document.body.appendChild(script);
		});
	}

	function initializeWebComponent() {
		window.WM_APPS_META = window.WM_APPS_META || {};
		window.WM_APPS_META[appName] = getWebComponentConfig();
		let baseUrl = window.WM_APPS_META[`${appName}`]['artifactsUrl'];
		let wmElementScriptUrl  = `${baseUrl}/wm-element.js`;
		let webComponentScriptUrl  = `${baseUrl}/wm-${appName}.js`;

		// Load scripts sequentially
		loadScript(wmElementScriptUrl, false)
			.then(() => loadScript(webComponentScriptUrl, true))
			.catch(error => {
				console.error('Failed to load WebComponent scripts:', error);
			});
	}

	initializeWebComponent();
})('{{appName}}');