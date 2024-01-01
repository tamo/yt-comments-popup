document.addEventListener("DOMContentLoaded", () => {
	chrome.storage.local.get(
		{
			log_level: 1,
		},
		(storage) => {
			document.getElementById("log_" + storage.log_level).checked = true;
		}
	);
});

document.getElementById("save_button").addEventListener("click", () => {
	const debugForm = new FormData(document.getElementById("option_form"));
	chrome.storage.local.set(
		{
			log_level: debugForm.get("log_level"),
		},
		() => { }
	);
});
