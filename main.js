// constants, or settings
const CTRL = 17; // keycode to stop
const MAXCOMLEN = 150; // trim comments
const DELAY = 300; // 1000 = 1 sec
const MAXWIDTHR = 0.5; // ratio to screen
const MAXHEIGHTR = 0.7;
const OFFSETX = 10; // position of tooltip
const OFFSETY = 10; // relative to cursor
const PARAMS = {
	maxResults: 10, // default is 20
	order: "relevance", // or "time"
	//moderationStatus: "published", // "heldForReview" or "likelySpam"
	//searchTerms: "",
	part: "snippet",
	textFormat: "plaintext", // cannot trim "html" safely
};
const TIPSTYLE = {
	visibility: "hidden", // to be made visible later
	display: "block", // "none" prevents size calculation
	position: "fixed",
	left: 0, // will be placed near the cursor later
	top: 0,
	zIndex: 9999999,
	backgroundColor: "black",
	color: "white",
	boxShadow: "0 0 5px 2px rgba(255,255,255,0.5)",
	padding: "3px",
};

// global variables
const cache = {};
let timeout = undefined;
let cause = undefined;
let pressed = false;
let mouseX = 0;
let mouseY = 0;

// loggers
let d, dE, dM;
chrome.storage.local.get(
	{
		log_level: 1, // default
	},
	(storage) => {
		setLoggers(storage.log_level);
	}
);

function setLoggers(logLevel) {
	const devnull = {
		log: () => { },
		groupCollapsed: () => { },
		groupEnd: () => { },
	};
	d = logLevel > 0 ? console : devnull;
	dE = logLevel > 1 ? console : devnull;
	dM = logLevel > 2 ? console : devnull;
}

// returns a promise
function fetchComments(videoId, apiKey) {
	const apiParams = new URLSearchParams({
		...PARAMS,
		videoId: videoId,
		key: apiKey,
	});
	const url = apiKey.match(/^https:\/\//)
		? apiKey + videoId
		: "https://www.googleapis.com/youtube/v3/commentThreads?" + apiParams;
	d.log("url fetched", url);
	return fetch(url)
		.then((response) => {
			if (!response.ok) {
				d.log("response not ok", response);
				if (response.status == 403) {
					// comments disabled for the video
					return { items: [] };
				}
				// otherwise don't cache it
				throw new Error("response status " + response.status);
			}
			return response.json();
		})
		.then((json) => {
			d.log("json fetched", json);
			let comments = "";
			for (let i = 0; i < json.items.length; i++) {
				const item = json.items[i];
				const comment = item.snippet.topLevelComment.snippet.textDisplay;
				d.log("comment", i, comment);
				comments += "<li>" + comment.substring(0, MAXCOMLEN) + "</li>";
			}
			if (comments === "") {
				comments = "<li>no comments</li>";
			}
			return (cache[videoId] = comments);
		});
	// don't catch errors here because the caller does
}

function getVideoId(url) {
	if (!url.match(/^https:\/\/www\.youtube\.com\/watch\?v=[^&]/)) {
		return;
	}
	return url.replace(
		/^https:\/\/www\.youtube\.com\/watch\?v=([^&]+)(&.*)?$/,
		"$1"
	);
}

function mouseEnterListener(event) {
	const anchor = event.target;
	dE.log("mouseenter", event, "target", anchor);
	if (anchor.tagName !== "A") return;
	if (anchor.role === "button") return; // e.g. next button on player

	const vid = getVideoId(anchor.href);
	if (!vid) return;
	if (vid === getVideoId(location.href)) return; // current video

	cutTitles(anchor);

	if (cache[vid]) {
		if (pressed) return;
		d.groupCollapsed("cached_" + vid);
		const tooltip = document.querySelector("tooltip.vid_" + vid);
		if (tooltip) {
			d.log("already has a tooltip", tooltip);
			// so reuse it by simulating createTooltip()
			const prefix = cutTitles(anchor);
			if (prefix && tooltip.children[0].tagName !== "H3") {
				tooltip.innerHTML = prefix + tooltip.innerHTML;
			}
			hideTips();
			timeout = setTimeout(
				(tooltip) => {
					showTip(tooltip);
				},
				DELAY,
				tooltip
			);
			cause = anchor;
		} else {
			console.warn("comments are cached but the tooltip is not found");
			createTooltip(anchor, cache[vid]);
		}
		d.groupEnd();
		return;
	}
	try {
		chrome.storage.local.get(
			{
				api_key: "",
				log_level: 1,
			},
			(storage) => {
				setLoggers(storage.log_level);
				const apiKey = storage.api_key;
				if (!apiKey) {
					console.warn("api key is not found");
					if (confirm("No API key is set.\nOpen options page?"))
						chrome.runtime.sendMessage({ action: "options" });
					return;
				}
				d.groupCollapsed("fetch_" + vid);
				fetchComments(vid, apiKey)
					.then((comments) => {
						// do a fetch even when pressed
						if (pressed) return;
						createTooltip(anchor, comments);
					})
					.catch((error) => {
						console.warn(error.message);
						hideTips();
					})
					.finally(() => {
						d.groupEnd();
					});
			}
		);
	} catch (error) {
		if (error.message === "Extension context invalidated.") {
			if (pressed) return;
			createTooltip(
				anchor,
				"<h1>Extension updated</h1>" +
				"<p>Please reload the page</p>"
			);
			return;
		}
		console.warn(error.message);
		hideTips();
	}
}

function cutTitle(elem) {
	if (elem.title && ![...elem.classList].some((c) => /^ytp-/.test(c))) {
		d.log("title found and removed", elem);
		const prefix = elem.title;
		elem.oldtitle = elem.title;
		elem.title = "";
		return "<h3>" + prefix + "</h3>";
	}
	if (elem.oldtitle) {
		return "<h3>" + elem.oldtitle + "</h3>";
	}
	return "";
}

function cutTitles(anchor) {
	let prefix = cutTitle(anchor); // disable anchor tooltips
	anchor.querySelectorAll("*").forEach((child) => {
		prefix += cutTitle(child); // even spans can have titles
	});
	return prefix;
}

function createTooltip(anchor, comments) {
	const prefix = cutTitles(anchor);
	const tooltip = document.createElement("tooltip");
	tooltip.className = "vid_" + getVideoId(anchor.href);
	tooltip.innerHTML = prefix + comments;
	Object.assign(tooltip.style, TIPSTYLE);
	const fullW = document.documentElement.clientWidth;
	const fullH = document.documentElement.clientHeight;
	tooltip.style.maxWidth = fullW * MAXWIDTHR + "px";
	tooltip.style.maxHeight = fullH * MAXHEIGHTR + "px";
	tooltip.onclick = () => {
		hideTips();
	};
	d.log("tooltip created", tooltip);

	hideTips();
	document.body.appendChild(tooltip);
	cause = anchor;

	timeout = setTimeout(
		(tooltip) => {
			showTip(tooltip);
		},
		DELAY,
		tooltip
	);
}

function showTip(tooltip) {
	const fullW = document.documentElement.clientWidth;
	const fullH = document.documentElement.clientHeight;
	const tipW = tooltip.offsetWidth;
	const tipH = tooltip.offsetHeight;
	tooltip.style.left =
		(mouseX + tipW > fullW ? fullW - tipW : mouseX < 0 ? 0 : mouseX) + "px";
	tooltip.style.top =
		(mouseY + tipH > fullH ? fullH - tipH : mouseY < 0 ? 0 : mouseY) + "px";
	tooltip.style.visibility = "visible";
	d.log("tooltip shown", tooltip.className);
}

function hideTips() {
	clearTimeout(timeout);
	timeout = undefined;
	cause = undefined;
	const existing = {};
	for (let tip of document.body.getElementsByTagName("tooltip")) {
		if (!existing[tip.className]) {
			if (tip.style.visibility === "visible") {
				d.log("tooltip hidden", tip.className);
				tip.style.visibility = "hidden";
			}
			existing[tip.className] = true;
		} else {
			d.log("duplicated tooltip removed", tip);
			tip.remove();
		}
	}
}

// the only event reliable enough to hide tooltips
// others are not useful when mouse moves fast
function mouseMoveListener(event) {
	const elem = document.elementFromPoint(event.clientX, event.clientY);
	dM.groupCollapsed("mousemove");
	dM.log(event, "element", elem);
	if (!elem) {
		dM.log("mouse pointer is out of browser");
		hideTips();
	} else if (!findAncestor(elem, "TOOLTIP")) {
		if (cause && !cause.contains(elem)) {
			const ancestorAnchor = findAncestor(elem, "A");
			if (!ancestorAnchor) {
				dM.log("mouse pointer is not on the tooltip or on an anchor");
				hideTips();
			} else {
				const eventVid = getVideoId(ancestorAnchor.href);
				const causeVid = getVideoId(cause.href);
				if (eventVid !== causeVid) {
					dM.log(
						"mouse pointer is on an anchor " +
						"whose href is different from tooltip"
					);
					hideTips();
				}
			}
		}
	}
	dM.groupEnd();

	mouseX = event.clientX + OFFSETX;
	mouseY = event.clientY + OFFSETY;
}

function findAncestor(elem, type) {
	if (elem.tagName === "BODY") return;
	if (elem.tagName === type) return elem;
	return findAncestor(elem.parentElement, type);
}

function keyDownListener(event) {
	if (event.keyCode == CTRL) {
		hideTips();
		pressed = true;
	}
}

function keyUpListener(event) {
	if (event.keyCode == CTRL) {
		pressed = false;
	}
}

// set {useCapture: true} to detect all anchors with the single listener
document.addEventListener("mouseenter", mouseEnterListener, true);
document.addEventListener("mousemove", mouseMoveListener);
document.addEventListener("keydown", keyDownListener);
document.addEventListener("keyup", keyUpListener);

// wipe tooltips every time href changes
/* // personally i don't need this feature
let prevHref = location.href;
window.addEventListener("load", () => {
	const observer = new MutationObserver((mutations) => {
		if (prevHref != location.href) {
			d.log("href changed from", prevHref, "to", location.href);
			hideTips();
			prevHref = location.href;
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
});
*/
