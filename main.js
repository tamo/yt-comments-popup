const DEBUG = false;
const CTRL = 17;
const MAXCOMLEN = 150;
const POPUPDELAY = 800;
const MAXWIDTHR = 0.5;
const MAXHEIGHTR = 0.7;

const PARAMS = new URLSearchParams({
	maxResults: 10,
	order: "relevance",
	part: "snippet",
	textFormat: "plaintext"
});
const TIPSTYLE = {
	visibility: "hidden",
	display: "block",
	position: "fixed",
	left: 0,
	top: 0,
	zIndex: 9999999,
	backgroundColor: "black",
	color: "white",
	boxShadow: "0 0 5px 2px rgba(255,255,255,0.5)"
};
const cache = {};
let timeout = undefined;
let pressed = false;
let mouseX = 0;
let mouseY = 0;

function fetchComments(videoId, apiKey) {
	if (cache[videoId]) {
		return new Promise((resolve, reject) => {
			resolve(cache[videoId]);
		});
	}
	const url = 'https://www.googleapis.com/youtube/v3/commentThreads'
			+ '?' + PARAMS + '&videoId=' + videoId + '&key=' + apiKey;
	return fetch(url).then(response => {
		if(!response.ok)
			return {items: []};
		return response.json();
	}).then(json => {
		if (DEBUG == true)
			console.log("json: ", json);
		let comments = "";
		for (let i = 0; i < json.items.length; i++) {
			const item = json.items[i];
			const comment = item.snippet.topLevelComment.snippet.textDisplay;
			comments += "<li>" + comment.substring(0, MAXCOMLEN) + "</li>";
		}
		if (comments == "")
			comments = "<p>no comments</p>";
		return cache[videoId] = comments;
	});
}

function getVideoId(url) {
	if (!url.match(/^https:\/\/www\.youtube\.com\/watch\?v=[^&]/))
		return;
	return url.replace(/^https:\/\/www\.youtube\.com\/watch\?v=([^&]+)(&.*)?$/, '$1');
}

function mouseEnterListener(event) {
	const anchor = event.target;
	if (anchor.tagName != "A")
		return;
	if (anchor.role == "button")
		return;
	const vid = getVideoId(anchor.href);
	if (!vid)
		return;
	if (vid == getVideoId(location.href))
		return;
	if (DEBUG == true)
		console.log("mouseenter: ", vid);

	chrome.storage.local.get("api_key", storage => {
		const apiKey = storage.api_key;
		if (!apiKey) {
			alert("No API key is set.");
			return;
		}
		fetchComments(vid, apiKey).then(comments => {
			if (timeout)
				clearTimeout(timeout);
			timeout = undefined;
			if (pressed)
				return;

			const popup = document.createElement("tooltip");
			popup.innerHTML = comments;
			Object.assign(popup.style, TIPSTYLE);
			const fullW = document.documentElement.clientWidth;
			const fullH = document.documentElement.clientHeight;
			popup.style.maxWidth = (fullW * MAXWIDTHR) + 'px';
			popup.style.maxHeight = (fullH * MAXHEIGHTR) + 'px';

			popup.onmouseleave = function(){this.remove();};
			popup.onclick = function(){this.remove();};
			//anchor.onmouseleave = function(){this.remove();}.bind(popup);

			removeTips();
			document.body.appendChild(popup);

			timeout = setTimeout(function(popup){
				const fullW = document.documentElement.clientWidth;
				const fullH = document.documentElement.clientHeight;
				const popW = popup.offsetWidth;
				const popH = popup.offsetHeight;
				popup.style.left = ((mouseX + popW > fullW) ? fullW - popW : mouseX) + 'px';
				popup.style.top = ((mouseY + popH > fullH) ? fullH - popH : mouseY) + 'px';
				popup.style.visibility = "visible";
			}, POPUPDELAY, popup);
			anchor.onmouseleave = function(){clearTimeout(timeout);};
		}).catch(error => {
			removeTips();
			if (DEBUG == true)
				console.log(error);
		});
	});
}

function removeTips() {
	for (let tip of document.body.getElementsByTagName("tooltip")) {
		tip.remove();
	}
}

function mouseMoveListener(event) {
	mouseX = event.clientX + 10;
	mouseY = event.clientY + 10;
}

function keyDownListener(event) {
	if (event.keyCode == CTRL) {
		removeTips();
		pressed = true;
	}
}

function keyUpListener(event) {
	if (event.keyCode == CTRL)
		pressed = false;
}

document.addEventListener("mouseenter", mouseEnterListener, true);
document.addEventListener("mousemove", mouseMoveListener);
document.addEventListener("keydown", keyDownListener);
document.addEventListener("keyup", keyUpListener);
