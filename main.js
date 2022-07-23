const DEBUG = false;
const CTRL = 17;
const MAXCOMLEN = 150;
const POPUPDELAY = 800;
const MAXWIDTHR = 0.5;
const MAXHEIGHTR = 0.7;
const OFFSETX = 10;
const OFFSETY = 10;
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
let cause = undefined;
let pressed = false;
let mouseX = 0;
let mouseY = 0;

function fetchComments(videoId, apiKey) {
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

	if (cache[vid]) {
		if (pressed)
			return;
		const tooltips = anchor.getElementsByTagName("tooltip");
		if (tooltips.length) {
			hideTips();
			timeout = setTimeout(function(tooltips){
				for (let tip of tooltips) {
					showTips(tip);
				}
			}, POPUPDELAY, tooltips);
			cause = anchor;
		} else {
			createPopup(anchor, cache[vid]);
		}
		return;
	}
	chrome.storage.local.get("api_key", storage => {
		const apiKey = storage.api_key;
		if (!apiKey) {
			alert("No API key is set.");
			return;
		}
		fetchComments(vid, apiKey).then(comments => {
			if (pressed)
				return;
			createPopup(anchor, comments);
		}).catch(error => {
			hideTips();
			if (DEBUG == true)
				console.log(error);
		});
	});
}

function createPopup(anchor, comments) {
	anchor.title = "";
	anchor.querySelectorAll('*').forEach(child => {
		child.title = "";
	});
	const popup = document.createElement("tooltip");
	popup.innerHTML = comments;
	Object.assign(popup.style, TIPSTYLE);
	const fullW = document.documentElement.clientWidth;
	const fullH = document.documentElement.clientHeight;
	popup.style.maxWidth = (fullW * MAXWIDTHR) + 'px';
	popup.style.maxHeight = (fullH * MAXHEIGHTR) + 'px';

	//popup.onmouseleave = function(){hideTips();};
	popup.onclick = function(){hideTips();};
	hideTips();
	anchor.appendChild(popup);
	//anchor.onmouseleave = function(){hideTips();};
	cause = anchor;

	timeout = setTimeout(function(popup){
		showTips(popup);
	}, POPUPDELAY, popup);
}

function showTips(popup) {
	const fullW = document.documentElement.clientWidth;
	const fullH = document.documentElement.clientHeight;
	const popW = popup.offsetWidth;
	const popH = popup.offsetHeight;
	popup.style.left = ((mouseX + popW > fullW) ? fullW - popW
		: (mouseX < 0 ? 0 : mouseX)) + 'px';
	popup.style.top = ((mouseY + popH > fullH) ? fullH - popH
		: (mouseY < 0 ? 0 : mouseY)) + 'px';
	popup.style.visibility = "visible";
}

function hideTips() {
	clearTimeout(timeout);
	timeout = undefined;
	cause = undefined;
	for (let tip of document.body.getElementsByTagName("tooltip")) {
		tip.style.visibility = "hidden";
	}
}

function mouseMoveListener(event) {
	const elem = document.elementFromPoint(event.clientX, event.clientY);
	if (cause && !cause.contains(elem))
		hideTips();
	mouseX = event.clientX + OFFSETX;
	mouseY = event.clientY + OFFSETY;
}

function keyDownListener(event) {
	if (event.keyCode == CTRL) {
		hideTips();
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
