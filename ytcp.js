(() => {
	// constants, or settings
	const CTRL = 17; // keycode to stop
	const DELAY = 300; // 1000 = 1 sec
	const LOWERTAG = "ytcptooltip";
	const UPPERTAG = LOWERTAG.toUpperCase();
	const CLASSPREFIX = "ytcp_vid_";
	const MAXWIDTHR = 0.5; // ratio to screen
	const MAXHEIGHTR = 0.7;
	const OFFSETX = 10; // position of tooltip
	const OFFSETY = 10; // relative to cursor
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

	// global variables
	const cache = {};
	let timeout = undefined;
	let shown = undefined;
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

	async function fetchComments(anchor) {
		const url = anchor.href;
		let uncachedResult;
		const startTime = Date.now();
		try {
			d.groupCollapsed("fetch", url);

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error("response status " + response.status);
			}

			const text = await response.text();
			const dom = new DOMParser().parseFromString(text, "text/html");
			const div = dom.querySelector("div.is-active.bookmarks-sort-panel");
			d.log("div", div);
			cache[url] = div;
		} catch (e) {
			// movies with no comments are often just too young
			// so don't cache them
			cache[url] = false;
			uncachedResult = commentList(e.message);
		} finally {
			d.groupEnd();
		}
		if (pressed) return;
		if (anchor != shown) return; // mouse already left
		const deltaTime = Date.now() - startTime;
		setTooltip(anchor, cache[url] || uncachedResult, deltaTime);
	}

	function enc(url) {
		if (url?.match(/^https?:\/\/b\.hatena\.ne\.jp\/entry\//)) {
			return btoa(url)
				.replace(/=/g, "")
				.replace(/\+/g, "-")
				.replace(/\//g, "_");
		}
	}

	function mouseEnterListener(event) {
		if (!chrome.runtime?.id) { // for chrome
			alert("HBCP updated.");
			return;
		}
		const anchor = event.target;
		dE.log("mouseenter", event, "target", anchor);
		if (anchor.tagName !== "A") return;

		const url = anchor.href;
		if (!enc(url)) return;
		if (url === location.href) return; // current page
		if (url === shown?.href) return;
		if (findAncestor(anchor, UPPERTAG)) return;
		if (cache[url] == "fetching") return;

		hideTips(); // this does "shown = undefined"
		shown = anchor;
		cutTitles(anchor);

		if (cache[url]) {
			if (pressed) return;
			d.log("cached_" + url, cache[url]);
			setTooltip(anchor, cache[url]);
			return;
		}
		let storagePromise;
		try {
			storagePromise = chrome.storage.local.get({
				log_level: 1,
			});
		} catch (error) {
			console.warn(error.message);
			if (pressed) return;
			const h1p = document.createElement("div");
			const h1 = document.createElement("h1");
			const p = document.createElement("p");
			h1p.appendChild(h1);
			h1p.appendChild(p);
			h1.innerText = "Error";
			p.innerText = error.message;
			setTooltip(anchor, h1p);
			return;
		}
		storagePromise
			.then((storage) => {
				setLoggers(storage.log_level);
			})
			.then(() => {
				cache[url] = "fetching";
				// do a fetch even when pressed
				if (!pressed) {
					setTooltip(anchor, commentList("⌛ waiting for comments... ⌛"));
				}
				fetchComments(anchor);
			});
	}

	function cutTitles(elem) {
		// disable anchor tooltips
		const title = elem.getAttribute("title");
		// elem.classList.contains() doesn't accept regex or glob
		if (title) {
			elem.setAttribute("oldtitle", title);
			elem.removeAttribute("title");
			d.log("title attribute found and renamed to oldtitle", elem);
		}
		[...elem.children].forEach((child) => {
			cutTitles(child); // even spans can have titles
		});
	}

	function setTooltip(anchor, comments, passed = 0) {
		clearTimeout(timeout);
		timeout = setTimeout(
			showTip.bind(null, anchor, comments),
			Math.max(0, DELAY - passed)
		);
	}

	function showTip(anchor, comments) {
		if (anchor && anchor !== shown) return;

		const fullW = document.documentElement.clientWidth;
		const fullH = document.documentElement.clientHeight;
		const maxW = fullW * MAXWIDTHR;
		const maxH = fullH * MAXHEIGHTR;

		const cname = CLASSPREFIX + enc(anchor.href);
		const usedtip = document.querySelector(`${LOWERTAG}.${cname}`);
		// get values while it's visible
		const tipX = usedtip ? usedtip.offsetLeft : mouseX + OFFSETX;
		const tipY = usedtip ? usedtip.offsetTop : mouseY + OFFSETY;

		const tooltip = usedtip || document.createElement(LOWERTAG);
		if (!usedtip) {
			tooltip.className = cname;
		}
		tooltip.innerHTML = "";
		tooltip.appendChild(comments);
		Object.assign(tooltip.style, TIPSTYLE);
		tooltip.onclick = () => {
			hideTips();
			shown = anchor; // avoid showing the tip again
		};
		if (!usedtip) {
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
		shown = undefined;
		for (let tip of document.body.getElementsByTagName(LOWERTAG)) {
			tip.remove();
		}
	}

	function commentList(text) {
		const div = document.createElement("div");
		if (text) {
			div.appendChild(singleComment(text));
		}
		return div;
	}

	function singleComment(text) {
		const p = document.createElement("p");
		p.textContent = text;
		return p;
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
		} else if (!findAncestor(elem, UPPERTAG)) {
			const ancestorAnchor = findAncestor(elem, "A");
			if (!shown) {
				if (ancestorAnchor) {
					dM.log("maybe a dropped mouseEnter, do it now");
					const newEvent = { target: ancestorAnchor };
					mouseEnterListener(newEvent);
				}
			} else if (!shown.contains(elem)) {
				if (!ancestorAnchor) {
					dM.log("mouse pointer is not on the tooltip or on an anchor");
					hideTips();
				} else {
					if (ancestorAnchor.href !== shown.href) {
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
