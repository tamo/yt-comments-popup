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
			console.log('json: ', json);
		let comments = '';
		for (let i = 0; i < json.items.length; i++) {
			const item = json.items[i];
			const comment = item.snippet.topLevelComment.snippet.textDisplay;
			comments += '<li>' + comment.substring(0, MAXCOMLEN) + '</li>';
		}
		if (comments == '')
			comments = '<li>no comments</li>';
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
	if (anchor.tagName != 'A')
		return;
	if (anchor.role == 'button') // e.g. next button on player
		return;

	const vid = getVideoId(anchor.href);
	if (!vid)
		return;
	if (vid == getVideoId(location.href)) // current video
		return;
	if (DEBUG == true)
		console.log('mouseenter: ', vid);

	if (cache[vid]) {
		if (pressed)
			return;
		const tooltip = document.querySelector('tooltip.vid_' + vid);
		if (tooltip) {
			// already has a tooltip
			// so reuse it by simulating createPopup()
			const prefix = cutTitles(anchor);
			if (prefix && tooltip.children[0].tagName != "P")
				tooltip.innerHTML = prefix + tooltip.innerHTML;
			hideTips();
			timeout = setTimeout(tooltip => {
				showTip(tooltip);
			}, POPUPDELAY, tooltip);
			cause = anchor;
		} else {
			if (DEBUG == true)
				console.log('inconsistency between cache and dom', cache, vid);
			createPopup(anchor, cache[vid]);
		}
		return;
	}
	try {
		chrome.storage.local.get('api_key', storage => {
			const apiKey = storage.api_key;
			if (!apiKey) {
				alert('No API key is set.');
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

function cutTitle(elem) {
	if (elem.title) {
		const prefix = '<p>' + elem.title + '</p>';
		elem.oldtitle = elem.title;
		elem.title = '';
		return prefix;
	}
	if (elem.oldtitle) {
		return '<p>' + elem.oldtitle + '</p>';
	}
	return '';
}

function cutTitles(anchor) {
	let prefix = cutTitle(anchor); // disable anchor tooltips
	anchor.querySelectorAll('*').forEach(child => {
		prefix += cutTitle(child); // even spans can have titles
	});
	return prefix;
}

function createPopup(anchor, comments) {
	const prefix = cutTitles(anchor);
	const popup = document.createElement('tooltip');
	popup.className = 'vid_' + getVideoId(anchor.href);
	popup.innerHTML = prefix + comments;
	Object.assign(popup.style, TIPSTYLE);
	const fullW = document.documentElement.clientWidth;
	const fullH = document.documentElement.clientHeight;
	popup.style.maxWidth = (fullW * MAXWIDTHR) + 'px';
	popup.style.maxHeight = (fullH * MAXHEIGHTR) + 'px';

	popup.onclick = () => {hideTips();};
	hideTips();
	document.body.appendChild(popup);
	cause = anchor;

	timeout = setTimeout(popup => {
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
	popup.style.visibility = 'visible';
}

function hideTips() {
	clearTimeout(timeout);
	timeout = undefined;
	cause = undefined;
	const classNames = {};
	for (let tip of document.body.getElementsByTagName('tooltip')) {
		if (classNames[tip.className]) // duplicated
			tip.remove();
		else {
			tip.style.visibility = 'hidden';
			classNames[tip.className] = true;
		}
	}
}

// the only event reliable enough to hide popups
// others are not useful when mouse moves fast
function mouseMoveListener(event) {
	const elem = document.elementFromPoint(event.clientX, event.clientY);
	if (!elem || // mouse pointer is out of browser
		(elem.tagName != 'TOOLTIP' &&
			(!elem.parentNode || elem.parentNode.tagName != 'TOOLTIP')
		) && cause && !cause.contains(elem)
	)
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
document.addEventListener('mouseenter', mouseEnterListener, true);
document.addEventListener('mousemove', mouseMoveListener);
document.addEventListener('keydown', keyDownListener);
document.addEventListener('keyup', keyUpListener);
