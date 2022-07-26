chrome.runtime.onMessage.addListener((message) => {
	if (message.action === "options") {
		chrome.runtime
			.openOptionsPage()
			.then(() => {
				console.log("options page opened");
			})
			.catch((error) => {
				console.error("failed to open the options page", error);
			});
	}
});
