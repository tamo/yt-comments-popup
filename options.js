document.addEventListener("DOMContentLoaded", () => {
	const textbox = document.getElementById("api_key");
	chrome.storage.local.get(
		{
			api_key: "",
			log_level: 1,
		},
		(storage) => {
			textbox.value = storage.api_key;
			document.getElementById("log_" + storage.log_level).checked = true;
		}
	);
});

document.getElementById("save_button").addEventListener("click", () => {
	const debugForm = new FormData(document.getElementById("option_form"));
	chrome.storage.local.set(
		{
			api_key: document.getElementById("api_key").value,
			log_level: debugForm.get("log_level"),
		},
		() => { }
	);
});
