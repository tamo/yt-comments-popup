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
	overflow: "hidden",
	left: 0, // will be placed near the cursor later
	top: 0,
	zIndex: 9999999,
	backgroundColor: "rgba(0,0,0,0.8)",
	color: "white",
	boxShadow: "0 0 5px 2px rgba(255,255,255,0.5)",
	padding: "3px",
};
const FALLBACK_URL = undefined; // in a form of "https://example.com/?"

// global variables
const cache = {};
let timeout = undefined;
let cause = undefined;
let pressed = false;
let mouseX = 0;
let mouseY = 0;
let warned = false;
let hiding = undefined;

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

function fetchComments(videoId, apiKey, anchor) {
	const apiParams = new URLSearchParams({
		...PARAMS,
		videoId: videoId,
		key: apiKey,
	});
	const url = apiKey.match(/^https:\/\//)
		? apiKey + videoId
		: "https://www.googleapis.com/youtube/v3/commentThreads?" + apiParams;
	d.log("url to fetch", url);
	const startTime = Date.now();
	fetch(url)
		.then((response) => {
			if (!response.ok) {
				d.log("response not ok", response);
				return ["response status " + response.status];
			}
			return response.text();
		})
		.then((text) => {
			if (text.isArray) return text[0];
			d.log("response text", text);
			if (text.length < 2) return "json too short";
			let jsonstr = text;
			if (text[0] == "<") {
				jsonstr = text.replaceAll(/<[^>]*>/g, "");
			} else if (text[0] != "{") {
				return "parse error at the first char: " + text[0];
			}
			const json = JSON.parse(jsonstr);
			d.log("json parsed", json);
			if (json.error) {
				d.log("json has an item called error", json.error);
				return "response status " + json.error.code;
			}
			const comments = document.createElement("ul");
			for (const item of json.items) {
				const comment = item.snippet.topLevelComment.snippet.textDisplay;
				d.log("comment", comment);
				const commentElement = document.createElement("li");
				commentElement.textContent = comment.substring(0, MAXCOMLEN);
				comments.appendChild(commentElement);
			}
			if (!comments.hasChildNodes()) {
				d.log("no comments");
				return "no comments";
			}
			return comments;
		})
		.then((comments) => {
			if (comments instanceof Element) {
				return cache[videoId] = comments;
			} else {
				const ul = document.createElement("ul");
				const li = document.createElement("li");
				ul.appendChild(li);
				if (comments == "response status 403") {
					li.textContent = "comments disabled for the video";
					cache[videoId] = ul;
				} else {
					li.textContent = comments;
					// movies with no comments are often just too young
					// so don't cache them
					cache[videoId] = false;
				}
				return ul;
			}
		})
		.then((ul) => {
			if (pressed) return;
			if (anchor != cause) return; // mouse already left
			const deltaTime = Date.now() - startTime;
			setTooltip(anchor, ul, deltaTime);
		})
		.finally(() => {
			d.groupEnd();
		});
}

function getVideoId(url) {
	if (!url || !url.match(/^https:\/\/www\.youtube\.com\/watch\?v=[^&]/)) {
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
	if (vid === getVideoId(cause?.href)) return;
	if (cache[vid] == "fetching") return;

	hideTips();
	cutTitles(anchor);
	cause = anchor;

	if (cache[vid]) {
		if (pressed) return;
		d.groupCollapsed("cached_" + vid, cache[vid]);
		setTooltip(anchor, cache[vid]);
		d.groupEnd();
		return;
	}
	let storagePromise;
	try {
		storagePromise = chrome.storage.local.get(
			{ api_key: "", log_level: 1 }
		);
	} catch (error) {
		console.warn(error.message);
		if (pressed) return;
		const h1p = document.createElement("div");
		// chrome extension updated
		if (error.message === "Extension context invalidated.") {
			h1p.innerHTML = "<h1>Extension updated</h1><p>Please reload the page</p>";
		} else {
			h1p.innerHTML = "<h1>Error</h1><p>" + error.message + "</p>";
		}
		setTooltip(anchor, h1p);
		return;
	}
	storagePromise
		.then((storage) => {
			setLoggers(storage.log_level);
			return storage.api_key || (warned ? FALLBACK_URL : "");
		})
		.then((apiKey) => {
			if (!apiKey) {
				warned = true;
				console.warn("api key is not found");
					if (confirm("No API key is set.\nOpen options page?"))
						chrome.runtime.sendMessage({ action: "options" });
					return;
				}
				d.groupCollapsed("fetch_" + vid);
				cache[vid] = "fetching";
				// do a fetch even when pressed
				if (!pressed) {
					const ul = document.createElement("ul");
					const li = document.createElement("li");
					li.textContent = "⌛ waiting for comments... ⌛";
				ul.appendChild(li);
				setTooltip(anchor, ul);
			}
			fetchComments(vid, apiKey, anchor);
		});
}

function cutTitle(elem) {
	const h3 = document.createElement("h3");
	const title = elem.getAttribute("title");
	if (title && ![...elem.classList].some((c) => /^ytp-/.test(c))) {
		elem.setAttribute("oldtitle", title);
		elem.removeAttribute("title");
		d.log("title found and removed", elem);
	}
	h3.textContent = elem.getAttribute("oldtitle");
	return h3;
}

function cutTitles(anchor) {
	const prefix = cutTitle(anchor); // disable anchor tooltips
	anchor.querySelectorAll("*").forEach((child) => {
		prefix.textContent += cutTitle(child).textContent; // even spans can have titles
	});
	return prefix;
}

function setTooltip(anchor, comments, passed = 0) {
	clearTimeout(timeout);
	timeout = setTimeout(
		showTip.bind(null, anchor, comments),
		Math.max(0, DELAY - passed)
	);
}

function showTip(anchor, comments) {
	if (anchor && anchor !== cause) return;

	const fullW = document.documentElement.clientWidth;
	const fullH = document.documentElement.clientHeight;
	const maxW = fullW * MAXWIDTHR;
	const maxH = fullH * MAXHEIGHTR;

	const vid = "vid_" + getVideoId(anchor.href);
	const usedtip = document.querySelector("tooltip." + vid);
	// get values while it's visible
	const tipX = usedtip ? usedtip.offsetLeft : mouseX + OFFSETX;
	const tipY = usedtip ? usedtip.offsetTop : mouseY + OFFSETY;

	const tooltip = usedtip || document.createElement("tooltip");
	if (!usedtip) {
		tooltip.className = vid;
		tooltip.innerHTML = "";
		tooltip.appendChild(cutTitles(anchor));
	} else {
		for (let ul of tooltip.getElementsByTagName("ul")) {
			ul.remove();
		}
	}
	tooltip.appendChild(comments);
	Object.assign(tooltip.style, TIPSTYLE);
	tooltip.onclick = () => {
		hideTips();
		cause = anchor; // avoid showing the tip again
	};
	if (!usedtip) {
		d.log("tooltip created", tooltip);
		document.body.appendChild(tooltip);
	}

	// first, calculate maximum
	tooltip.style.left = Math.min(fullW - maxW, Math.max(tipX, 0)) + "px";
	tooltip.style.top = Math.min(fullH - maxH, Math.max(tipY, 0)) + "px";
	tooltip.style.maxWidth = maxW + "px";
	tooltip.style.maxHeight = maxH + "px";

	// second, calculate x and y from real w and h
	const tipW = tooltip.offsetWidth;
	const tipH = tooltip.offsetHeight;
	tooltip.style.left = Math.min(fullW - tipW, Math.max(tipX, 0)) + "px";
	tooltip.style.top = Math.min(fullH - tipH, Math.max(tipY, 0)) + "px";

	// last, make it visible
	tooltip.style.visibility = "visible";
	d.log("tooltip shown", tooltip.className, tooltip);
}

function hideTips() {
	clearTimeout(timeout);
	timeout = undefined;
	cause = undefined;
	if (hiding) return;
	hiding = setTimeout(() => {
		for (let tip of document.body.getElementsByTagName("tooltip")) {
			tip.remove();
		}
		hiding = undefined;
	}, 0);
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
	} else {
		if (!findAncestor(elem, "TOOLTIP") && cause && !cause.contains(elem)) {
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

	mouseX = event.clientX;
	mouseY = event.clientY;
}

function findAncestor(elem, type) {
	if (!elem) return;
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
