const DEBUG = false;

// constants, or settings
const CTRL = 17; // keycode to stop
const MAXCOMLEN = 150; // trim comments
const POPUPDELAY = 800; // 1000 = 1 sec
const MAXWIDTHR = 0.5; // ratio to screen
const MAXHEIGHTR = 0.7;
const OFFSETX = 10; // position of popup
const OFFSETY = 10; // relative to cursor
const PARAMS = new URLSearchParams({
	maxResults: 10, // default 20 is too many
	order: "relevance", // or "time"
	//moderationStatus: "published", // "heldForReview" or "likelySpam"
	//searchTerms: "",
	part: "snippet",
	textFormat: "plaintext" // cannot trim "html" safely
});
const TIPSTYLE = {
	visibility: "hidden", // to be made visible later
	display: "block", // "none" prevents size calculation
	position: "fixed",
	left: 0, // will be placed near the cursor later
	top: 0,
	zIndex: 9999999,
	backgroundColor: "black",
	color: "white",
	boxShadow: "0 0 5px 2px rgba(255,255,255,0.5)"
};

// global variables
const cache = {};
let timeout = undefined;
let cause = undefined;
let pressed = false;
let mouseX = 0;
let mouseY = 0;

// returns a promise
function fetchComments(videoId, apiKey) {
	const url = 'https://www.googleapis.com/youtube/v3/commentThreads'
			+ '?' + PARAMS + '&videoId=' + videoId + '&key=' + apiKey;
	return fetch(url).then(response => {
		if(!response.ok) // includes disabled cases
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
	// don't catch errors here because the caller does
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
	if (anchor.role == "button") // e.g. next button on player
		return;

	const vid = getVideoId(anchor.href);
	if (!vid)
		return;
	if (vid == getVideoId(location.href)) // current video
		return;
	if (DEBUG == true)
		console.log("mouseenter: ", vid);

	if (cache[vid]) {
		if (pressed)
			return;
		const tooltips = anchor.getElementsByTagName("tooltip");
		if (tooltips.length) {
			// already has a tooltip
			// so reuse it by simulating createPopup()
			hideTips();
			timeout = setTimeout(function(tooltips){
				for (let tip of tooltips) {
					showTip(tip);
					break;
				}
			}, POPUPDELAY, tooltips);
			cause = anchor;
		} else {
			// this is an anchor without tooltip
			// but the comments have been cached before
			createPopup(anchor, cache[vid]);
		}
		return;
	}
	try {
		chrome.storage.local.get("api_key", storage => {
			const apiKey = storage.api_key;
			if (!apiKey) {
				alert("No API key is set.");
				return;
			}
			fetchComments(vid, apiKey).then(comments => {
				if (pressed)	// return after fetching 
					return;	// even when pressed
				createPopup(anchor, comments);
			}).catch(error => {
				hideTips();
				console.log(error);
			});
		});
	} catch(error) {
		hideTips();
		console.log(error);
	}
}

function createPopup(anchor, comments) {
	anchor.title = ""; // disable tooltips
	anchor.querySelectorAll('*').forEach(child => {
		child.title = ""; // even spans can have titles
	});

	const popup = document.createElement("tooltip");
	popup.innerHTML = comments;
	Object.assign(popup.style, TIPSTYLE);
	const fullW = document.documentElement.clientWidth;
	const fullH = document.documentElement.clientHeight;
	popup.style.maxWidth = (fullW * MAXWIDTHR) + 'px';
	popup.style.maxHeight = (fullH * MAXHEIGHTR) + 'px';

	popup.onclick = function(){hideTips();};
	hideTips();
	anchor.appendChild(popup);
	cause = anchor;

	timeout = setTimeout(function(popup){
		showTip(popup);
	}, POPUPDELAY, popup);
}

function showTip(popup) {
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

// the only event reliable enough to hide popups
// others are not useful when mouse moves fast
function mouseMoveListener(event) {
	const elem = document.elementFromPoint(event.clientX, event.clientY);
	if (cause && !cause.contains(elem)) // elem can be null
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

// set {useCapture: true} to detect all anchors with the single listener
document.addEventListener("mouseenter", mouseEnterListener, true);
document.addEventListener("mousemove", mouseMoveListener);
document.addEventListener("keydown", keyDownListener);
document.addEventListener("keyup", keyUpListener);
