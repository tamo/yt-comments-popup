document.addEventListener("DOMContentLoaded", function(ev) {
	const textbox = document.getElementById("api_key");
	textbox.style.width = "25em";
	chrome.storage.local.get([
		"api_key"
	], storage => {
		const apiKey = storage.api_key;
		if (apiKey)
			textbox.value = apiKey;
	});
});
document.getElementById("save_api_key").addEventListener("click", function(ev) {
	chrome.storage.local.set({
		"api_key": document.getElementById("api_key").value
	}, function(){});
});