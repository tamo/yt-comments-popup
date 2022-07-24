document.addEventListener("DOMContentLoaded", function(ev) {
	const textbox = document.getElementById("api_key");
	textbox.style.width = "25em";
	chrome.storage.local.get([
		"api_key",
		"log_level"
	], storage => {
		const apiKey = storage.api_key;
		if (apiKey)
			textbox.value = apiKey;

		const logLevel = storage.log_level;
		if (typeof logLevel !== "number")
			logLevel = 1;
		document.getElementById("log_" + logLevel).checked = true;
	});
});
document.getElementById("save_button").addEventListener("click", function(ev) {
	const debugForm = new FormData(document.getElementById("option_form"));
	chrome.storage.local.set({
		"api_key": document.getElementById("api_key").value,
		"log_level": debugForm.get("log_level")
	}, function(){});
});