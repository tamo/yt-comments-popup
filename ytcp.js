(() => {
	// constants, or settings
	const CTRL = 17; // keycode to stop
	const MAXCOMLEN = 150; // trim comments
	const DELAY = 300; // 1000 = 1 sec
	const LOWERTAG = "ytcptooltip";
	const UPPERTAG = LOWERTAG.toUpperCase();
	const CLASSPREFIX = "ytcp_vid_";
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
	let shown = undefined;
	let pressed = false;
	let mouseX = 0;
	let mouseY = 0;
	let warned = false;

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

	async function fetchComments(videoId, apiKey, anchor) {
		const apiParams = new URLSearchParams({
			...PARAMS,
			videoId: videoId,
			key: apiKey,
		});
		const url = apiKey.match(/^https:\/\//)
			? apiKey + videoId
			: "https://www.googleapis.com/youtube/v3/commentThreads?" + apiParams;

		let result;
		const startTime = Date.now();
		try {
			d.groupCollapsed("fetch_" + videoId);
			d.log("url to fetch", url);

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error("response status " + response.status);
			}

			const text = await response.text();
			d.log("response text", text);
			if (text.length < 2) {
				throw new Error("json too short");
			}
			let jsonstr = text;
			if (text[0] == "<") {
				jsonstr = text.replaceAll(/<[^>]*>/g, "");
			} else if (text[0] != "{") {
				throw new Error("parse error at the first char: " + text[0]);
			}

			const json = JSON.parse(jsonstr);
			d.log("json parsed", json);
			if (json.error) {
				d.log("json has an item called error", json.error);
				throw new Error("response status " + json.error.code);
			}

			const ul = commentList();
			for (const item of json.items) {
				const comment = item.snippet.topLevelComment.snippet.textDisplay;
				d.log("comment", comment);
				ul.appendChild(singleComment(comment.substring(0, MAXCOMLEN)));
			}
			if (!ul.hasChildNodes()) {
				throw new Error("no comments");
			}
			result = cache[videoId] = ul;
		} catch (e) {
			if (e.message == "response status 403") {
				result = cache[videoId] = commentList("comments disabled for the video");
			} else {
				// movies with no comments are often just too young
				// so don't cache them
				cache[videoId] = false;
				result = commentList(e.message);
			}
		} finally {
			d.groupEnd();
		}
		if (anchor != shown) return; // mouse already left
		setTooltip(anchor, result, Date.now() - startTime);
	}

	function getVideoId(url) {
		const matchArray = url?.match(/^https:\/\/www\.youtube\.com\/watch\?v=([^&]+)(&.*)?$/);
		return matchArray && matchArray[1];
	}

	function mouseEnterListener(event) {
		const anchor = event.target;
		if (!anchor) return;
		dE.log("mouseenter", event, "target", anchor);
		if (anchor.tagName !== "A") return;
		if (anchor.role === "button") return; // e.g. next button on player
		if (findAncestor(anchor, UPPERTAG)) return;

		const vid = getVideoId(anchor.href);
		if (!vid) return;
		if (vid === getVideoId(location.href)) return; // current video
		if (vid === getVideoId(shown?.href)) return;
		if (cache[vid] == "fetching") return;

		hideTips(); // this does "shown = undefined"
		shown = anchor;
		cutTitles(anchor);

		if (cache[vid]) {
			d.log("cached_" + vid, cache[vid]);
			setTooltip(anchor, cache[vid]);
			return;
		}
		let storagePromise;
		try {
			storagePromise = chrome.storage.local.get({
				api_key: "",
				log_level: 1,
			});
		} catch (error) {
			console.warn(error.message);
			const h1p = document.createElement("div");
			h1p.appendChild(document.createElement("h1"))
				.innerText = "Error";
			h1p.appendChild(document.createElement("p"))
				.innerText = error.message;
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
					if (confirm("No API key is set.\nOpen options page?")) {
						chrome.runtime.sendMessage({ action: "options" });
					}
					return;
				}
				cache[vid] = "fetching";
				setTooltip(anchor, commentList("⌛ waiting for comments... ⌛"));
				// do a fetch even when pressed
				fetchComments(vid, apiKey, anchor);
			});
	}

	// disable title tooltips
	function cutTitles(elem) {
		const title = elem.getAttribute("title");
		// elem.classList.contains() doesn't accept regex or glob
		// ytp-* are player UIs
		if (title && ![...elem.classList].some((c) => /^ytp-/.test(c))) {
			elem.setAttribute("oldtitle", title);
			elem.removeAttribute("title");
			d.log("title attribute found and renamed to oldtitle", elem);
		}
		const prefix = document.createElement("h3");
		prefix.textContent = elem.getAttribute("oldtitle");

		[...elem.children].forEach((child) => {
			prefix.textContent += cutTitles(child).textContent; // even spans can have titles
		});
		return prefix;
	}

	function setTooltip(anchor, comments, passed = 0) {
		clearTimeout(timeout);
		if (pressed) return;

		timeout = setTimeout(
			showTip.bind(null, anchor, comments),
			Math.max(0, DELAY - passed)
		);
	}

	function showTip(anchor, comments) {
		if (anchor && anchor !== shown) return;

		const cname = CLASSPREFIX + getVideoId(anchor.href);
		const usedtip = document.querySelector(`${LOWERTAG}.${cname}`);
		while (usedtip?.firstChild) usedtip.removeChild(usedtip.firstChild);
		// get values while it's visible
		const tipX = Math.max(0, usedtip ? usedtip.offsetLeft : mouseX + OFFSETX);
		const tipY = Math.max(0, usedtip ? usedtip.offsetTop : mouseY + OFFSETY);

		const tooltip = usedtip || document.createElement(LOWERTAG);
		tooltip.appendChild(cutTitles(anchor));
		tooltip.appendChild(comments);
		Object.assign(tooltip, {
			className: cname,
			onclick: () => {
				hideTips();
				shown = anchor; // avoid showing the tip again
			},
		});
		if (!usedtip) {
			document.body.appendChild(tooltip);
		}

		const fullW = document.documentElement.clientWidth;
		const fullH = document.documentElement.clientHeight;
		const maxW = fullW * MAXWIDTHR;
		const maxH = fullH * MAXHEIGHTR;
		Object.assign(tooltip.style, {
			...TIPSTYLE,
			// first, calculate maximum
			left: Math.min(fullW - maxW, tipX) + "px",
			top: Math.min(fullH - maxH, tipY) + "px",
			maxWidth: maxW + "px",
			maxHeight: maxH + "px",
		});
		// second, calculate x and y from real w and h
		Object.assign(tooltip.style, {
			left: Math.min(fullW - tooltip.offsetWidth, tipX) + "px",
			top: Math.min(fullH - tooltip.offsetHeight, tipY) + "px",
			visibility: "visible",
		});

		d.log("tooltip shown", tooltip.className, tooltip);
	}

	function hideTips() {
		clearTimeout(timeout);
		timeout = undefined;
		shown = undefined;
		for (let tip of document.body.getElementsByTagName(LOWERTAG)) {
			tip.remove();
		}
	}

	function commentList(text) {
		const ul = document.createElement("ul");
		if (text) {
			ul.appendChild(singleComment(text));
		}
		return ul;
	}

	function singleComment(text) {
		const li = document.createElement("li");
		li.textContent = text;
		return li;
	}

	// the only event reliable enough to hide tooltips
	// others are not useful when mouse moves fast
	function mouseMoveListener(event) {
		mouseX = event.clientX;
		mouseY = event.clientY;

		const elem = document.elementFromPoint(mouseX, mouseY);
		dM.groupCollapsed("mousemove");
		dM.log(event, "element", elem);
		if (!elem) {
			dM.log("mouse pointer is out of browser");
		} else if (!findAncestor(elem, UPPERTAG)) {
			const ancestorAnchor = findAncestor(elem, "A");
			if (shown && (!ancestorAnchor || ancestorAnchor.href !== shown.href)) {
				dM.log("mouse pointer is not on the tooltip or on the sho anchor");
				hideTips();
			} else if (!shown && ancestorAnchor) {
				dM.log("maybe a dropped mouseEnter, do it now");
				mouseEnterListener({ target: ancestorAnchor });
			}
		}
		dM.groupEnd();
	}

	function findAncestor(elem, type) {
		if (!elem || elem.tagName === "BODY") return;
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
	function loadListener(event) {
		new MutationObserver((mutations) => {
			if (prevHref != location.href) {
				d.log("href changed from", prevHref, "to", location.href);
				hideTips();
				prevHref = location.href;
			}
		}).observe(document.body, { childList: true, subtree: true });
	}
	window.addEventListener("load", loadListener);
	*/
})();
